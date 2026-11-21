/**
 * NoteManager — Central state management and CRUD for sticky notes.
 * Full feature set: titles, timestamps, checklists, glass mode, undo, animations.
 */
var NoteManager = (globalThis.NoteManager && globalThis.NoteManager.__tabstick) ? globalThis.NoteManager : (function() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const Z_INDEX_BASE = (NoteRenderer && NoteRenderer.Z_INDEX_BASE) || 2147400000;

  let currentUrl   = '';
  let notes        = new Map();
  let domNodes     = new Map();
  let maxZIndex    = 0;
  let meta         = { hidden: false, noteCount: 0 };
  let saveTimer    = null;
  let spawnCounter = 0;
  let isHidden     = false;
  let isGlassMode  = false;
  let pendingWrites = 0;
  let latestWritePromise = Promise.resolve();
  let hasUnsavedChanges = false;

  function _trackWrite(promise) {
    pendingWrites++;
    const tracked = Promise.resolve(promise)
      .catch(_handleSaveError)
      .finally(() => {
        pendingWrites--;
      });
    latestWritePromise = Promise.allSettled([latestWritePromise, tracked]);
    return tracked;
  }

  function hasPendingWrites() {
    return pendingWrites > 0;
  }

  async function whenWritesSettled() {
    while (pendingWrites > 0) {
      await latestWritePromise;
    }
  }

  // ── Init ──
  function init(notesArray, urlMeta, url, glassMode) {
    currentUrl = url;
    meta = urlMeta || { hidden: false, noteCount: 0 };

    clearTimeout(saveTimer);
    saveTimer = null;
    hasUnsavedChanges = false;

    // Remove any tracked or orphaned hosts from prior injection / reload
    for (const [, host] of domNodes) {
      if (typeof host._cleanup === 'function') host._cleanup();
      host.remove();
    }
    document.querySelectorAll('tabstick-note.ts-host, div.ts-host').forEach(el => el.remove());

    notes.clear();
    domNodes.clear();
    maxZIndex = 0;
    spawnCounter = 0;
    isHidden = Boolean(meta.hidden);
    if (typeof glassMode === 'boolean') {
      isGlassMode = glassMode;
    }

    const validNotes = [];
    for (const raw of (Array.isArray(notesArray) ? notesArray : [])) {
      const validated = IdUtils.validateNote(raw);
      if (!validated) {
        console.warn('[TabStick] Skipping invalid note:', raw);
        continue;
      }
      validNotes.push(IdUtils.clampNotePosition(validated));
    }

    // Normalize zIndex to 1..N while preserving relative order
    validNotes.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    validNotes.forEach((note, idx) => {
      note.zIndex = idx + 1;
      maxZIndex = note.zIndex;
      notes.set(note.id, note);
    });

    for (const [, note] of notes) {
      renderNote(note, false);
    }
    if (isHidden) {
      _applyVisibilityToAll(true);
    }
  }

  // ── Create ──
  function createNote() {
    if (isHidden) {
      setAllVisibility(false);
    }

    const offsetIndex = spawnCounter % 8;
    const baseX = (window.innerWidth - 240) / 2;
    const baseY = (window.innerHeight - 180) / 2;
    spawnCounter++;

    const rawNote = IdUtils.createDefaultNote(baseX + offsetIndex * 24, baseY + offsetIndex * 24);
    const note = IdUtils.clampNotePosition(rawNote);
    maxZIndex++;
    note.zIndex = maxZIndex;
    notes.set(note.id, note);
    renderNote(note, true);

    _saveNow();
    return note;
  }

  function _stopKeyPropagation(el) {
    if (!el) return;
    const stop = (e) => e.stopPropagation();
    el.addEventListener('keydown', stop);
    el.addEventListener('keyup', stop);
    el.addEventListener('keypress', stop);
  }

  function _formatTimestampText(note) {
    const fmt = (ts) => {
      if (!ts) return '';
      return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    };
    return `Created ${fmt(note.createdAt)} · Edited ${fmt(note.updatedAt)}`;
  }

  function _textToChecklist(text) {
    if (!text) return [{ text: '', checked: false }];
    const lines = text.split('\n');
    const items = [];
    for (const line of lines) {
      let checked = false;
      let val = line;
      if (val.startsWith('[x] ') || val.startsWith('[X] ')) {
        checked = true;
        val = val.substring(4);
      } else if (val.startsWith('[ ] ')) {
        checked = false;
        val = val.substring(4);
      }
      items.push({ text: val, checked });
    }
    if (items.length === 0) items.push({ text: '', checked: false });
    return items;
  }

  function _checklistToText(items) {
    return items.map(item => (item.checked ? '[x] ' : '[ ] ') + item.text).join('\n');
  }

  // ── Render ──
  function renderNote(note, animate) {
    const { host, shadow } = NoteRenderer.buildNote(note);

    // Apply liquid glass mode if enabled
    if (isGlassMode) {
      NoteRenderer.applyGlassMode(host, true);
    }

    const closeBtn = shadow.querySelector('.ts-close-btn');

    // Bring to front on mousedown
    host.addEventListener('mousedown', (e) => {
      if (closeBtn && typeof e.composedPath === 'function' && e.composedPath().includes(closeBtn)) {
        return;
      }
      bringToFront(note.id);
    });

    // Drag & Resize
    DragHandler.attachDrag(host, shadow, note, (c) => updateNote(note.id, c));
    ResizeHandler.attachResize(host, shadow, note, (c) => updateNote(note.id, c));

    const textarea = shadow.querySelector('.ts-textarea');
    const titleInput = shadow.querySelector('.ts-title-input');
    const headerTitle = shadow.querySelector('.ts-header-title');
    const timestampTextEl = shadow.querySelector('.ts-timestamp-text');
    const checklistContainer = shadow.querySelector('.ts-checklist');
    const checklistBtn = shadow.querySelector('.ts-checklist-btn');
    let inputDebounce = null;

    function updateHeaderTitle() {
      if (headerTitle) {
        headerTitle.textContent = note.title || (note.content || '').substring(0, 30) || 'Note';
      }
    }
    updateHeaderTitle();

    function _updateTimestamps() {
      if (timestampTextEl) {
        timestampTextEl.textContent = _formatTimestampText(note);
      }
    }
    _updateTimestamps();

    function _attachFocusScale(el) {
      if (!el) return;
      el.addEventListener('focus', () => {
        host.classList.add('ts-focused');
        if (!reducedMotion) {
          host.style.transform = `rotate(${note.rotation}deg) scale(1.015)`;
        }
      });
      el.addEventListener('blur', () => {
        host.classList.remove('ts-focused');
        host.style.transform = reducedMotion
          ? `rotate(${note.rotation}deg)`
          : `rotate(${note.rotation}deg) scale(1.0)`;
      });
    }

    // ── Title ──
    if (titleInput) {
      _stopKeyPropagation(titleInput);
      _attachFocusScale(titleInput);
      titleInput.addEventListener('input', () => {
        note.title = titleInput.value;
        note.updatedAt = Date.now();
        updateHeaderTitle();
        _updateTimestamps();
        hasUnsavedChanges = true;
        clearTimeout(inputDebounce);
        inputDebounce = setTimeout(() => { debouncedSave(); _showSavedIndicator(shadow); }, 500);
      });
      titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') titleInput.blur();
      });
    }

    // ── Textarea ──
    if (textarea) {
      _stopKeyPropagation(textarea);
      _attachFocusScale(textarea);
      textarea.addEventListener('input', () => {
        note.content = textarea.value;
        note.updatedAt = Date.now();
        updateHeaderTitle();
        _updateTimestamps();
        hasUnsavedChanges = true;
        clearTimeout(inputDebounce);
        inputDebounce = setTimeout(() => { debouncedSave(); _showSavedIndicator(shadow); }, 500);
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value = textarea.value.substring(0, s) + '\t' + textarea.value.substring(end);
          textarea.selectionStart = textarea.selectionEnd = s + 1;
          textarea.dispatchEvent(new Event('input'));
        }
        if (e.key === 'Escape') textarea.blur();
      });
    }

    // ── Checklist ──
    function renderChecklist() {
      if (!checklistContainer) return;
      checklistContainer.innerHTML = '';
      const items = _textToChecklist(note.content || '');

      items.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `ts-checklist-item ${item.checked ? 'checked' : ''}`;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = item.checked;
        cb.disabled = Boolean(note.pinned);

        const textDiv = document.createElement('div');
        textDiv.className = 'ts-checklist-text';
        textDiv.contentEditable = note.pinned ? 'false' : 'true';
        textDiv.textContent = item.text;

        cb.addEventListener('change', () => {
          if (note.pinned) {
            cb.checked = item.checked;
            return;
          }
          item.checked = cb.checked;
          itemDiv.classList.toggle('checked', cb.checked);
          _updateFromChecklist(items);
        });

        textDiv.addEventListener('input', () => {
          if (/\r?\n/.test(textDiv.textContent)) {
            textDiv.textContent = textDiv.textContent.replace(/\r?\n/g, ' ');
          }
          item.text = textDiv.textContent;
          _updateFromChecklist(items);
        });

        textDiv.addEventListener('keydown', (e) => {
          if (note.pinned) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            items.splice(index + 1, 0, { text: '', checked: false });
            _updateFromChecklist(items);
            renderChecklist();
            const nextDiv = checklistContainer.children[index + 1]?.querySelector('.ts-checklist-text');
            if (nextDiv) nextDiv.focus();
          } else if (e.key === 'Backspace' && textDiv.textContent === '' && items.length > 1) {
            e.preventDefault();
            items.splice(index, 1);
            _updateFromChecklist(items);
            renderChecklist();
            const prevDiv = checklistContainer.children[Math.max(0, index - 1)]?.querySelector('.ts-checklist-text');
            if (prevDiv) prevDiv.focus();
          } else if (e.key === 'Escape') {
            textDiv.blur();
          }
        });

        itemDiv.appendChild(cb);
        itemDiv.appendChild(textDiv);
        checklistContainer.appendChild(itemDiv);
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'ts-add-item-btn';
      addBtn.textContent = '+ Add item';
      addBtn.style.display = note.pinned ? 'none' : '';
      addBtn.addEventListener('click', () => {
        if (note.pinned) return;
        items.push({ text: '', checked: false });
        _updateFromChecklist(items);
        renderChecklist();
        const lastText = checklistContainer.querySelector('.ts-checklist-item:last-of-type .ts-checklist-text');
        if (lastText) lastText.focus();
      });
      checklistContainer.appendChild(addBtn);
    }

    function _updateFromChecklist(items) {
      note.content = _checklistToText(items);
      note.updatedAt = Date.now();
      if (textarea) textarea.value = note.content;
      updateHeaderTitle();
      _updateTimestamps();
      hasUnsavedChanges = true;
      clearTimeout(inputDebounce);
      inputDebounce = setTimeout(() => { debouncedSave(); _showSavedIndicator(shadow); }, 500);
    }

    function applyChecklistState() {
      if (!textarea || !checklistContainer) return;
      if (checklistBtn) {
        checklistBtn.classList.toggle('ts-active', Boolean(note.isChecklist));
        checklistBtn.setAttribute('aria-pressed', note.isChecklist ? 'true' : 'false');
      }
      if (note.isChecklist) {
        textarea.style.display = 'none';
        checklistContainer.style.display = 'flex';
        renderChecklist();
      } else {
        textarea.style.display = 'block';
        checklistContainer.style.display = 'none';
      }
    }

    if (checklistContainer) {
      _stopKeyPropagation(checklistContainer);
    }
    applyChecklistState();

    // Checklist toggle button
    if (checklistBtn) {
      checklistBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        note.isChecklist = !note.isChecklist;
        applyChecklistState();
        updateNote(note.id, { isChecklist: note.isChecklist });
      });
    }

    // ── Color dot ──
    const colorDot = shadow.querySelector('.ts-color-dot');
    if (colorDot) {
      colorDot.addEventListener('click', (e) => {
        e.stopPropagation();
        note.color = ColorThemes.nextColor(note.color);
        NoteRenderer.applyThemeVars(host, note.color);
        colorDot.setAttribute('aria-label', `Change color. Current: ${note.color}`);
        updateNote(note.id, { color: note.color });
      });
    }

    // ── Pin ──
    const pinBtn = shadow.querySelector('.ts-pin-btn');
    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        note.pinned = !note.pinned;
        _applyPinnedState(shadow, host, note);
        updateNote(note.id, { pinned: note.pinned });
      });
    }

    // ── Minimize ──
    const minBtn = shadow.querySelector('.ts-min-btn');
    if (minBtn) {
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        note.minimized = !note.minimized;
        _applyMinimizedState(host, shadow, note);
        updateNote(note.id, { minimized: note.minimized });
      });
    }

    // Double-click header to toggle minimize
    const headerEl = shadow.querySelector('.ts-header');
    if (headerEl) {
      headerEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const target = e.target;
        if (target.closest('.ts-btn') || target.closest('.ts-color-dot')) {
          return;
        }
        note.minimized = !note.minimized;
        _applyMinimizedState(host, shadow, note);
        updateNote(note.id, { minimized: note.minimized });
      });
    }

    // ── Close ──
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNote(note.id);
      });
    }

    host._cleanup = () => {
      clearTimeout(inputDebounce);
      inputDebounce = null;
    };

    // Expose targeted sync helpers for external updates (cross-tab / popup / sidepanel / dashboard)
    host._syncRender = (opts = {}) => {
      if (opts.meta) {
        updateHeaderTitle();
        _updateTimestamps();
      }
      if (opts.checklist) {
        applyChecklistState();
      }
      if (opts.pinned) {
        _applyPinnedState(shadow, host, note);
      }
      if (opts.color && colorDot) {
        colorDot.setAttribute('aria-label', `Change color. Current: ${note.color}`);
      }
    };

    // Apply hidden state
    if (isHidden) {
      host.style.display = 'none';
    }

    (document.documentElement || document.body).appendChild(host);
    domNodes.set(note.id, host);

    // Spawn animation without fill: 'forwards' (prevents sticky WAAPI backdrop root)
    host.style.opacity = '1';
    host.style.transform = `rotate(${note.rotation}deg)`;
    if (animate && !reducedMotion) {
      const spawnAnim = host.animate([
        { opacity: 0, transform: `rotate(${note.rotation}deg) scale(0.85) translateY(10px)` },
        { opacity: 1, transform: `rotate(${note.rotation}deg) scale(1.0) translateY(0)` },
      ], { duration: 280, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
      spawnAnim.onfinish = () => {
        if (host.isConnected && isGlassMode) {
          NoteRenderer.applyGlassMode(host, true);
        }
      };
    } else if (isGlassMode) {
      NoteRenderer.applyGlassMode(host, true);
    }

    // Focus on creation
    if (animate && !isHidden) {
      setTimeout(() => {
        if (!host.isConnected) return;
        if (note.isChecklist) {
          const firstItem = checklistContainer?.querySelector('.ts-checklist-text');
          if (firstItem) firstItem.focus();
        } else if (textarea) {
          textarea.focus();
        } else if (titleInput) {
          titleInput.focus();
        }
      }, 10);
    }
  }

  function updateNote(id, changes) {
    const note = notes.get(id);
    if (!note) return;
    Object.assign(note, changes);
    note.updatedAt = Date.now();
    debouncedSave();
  }

  function deleteNote(id, { skipUndo = false, skipSave = false } = {}) {
    const note = notes.get(id);
    const host = domNodes.get(id);
    if (!note || !host) return;
    const snapshot = { ...note };
    notes.delete(id);
    domNodes.delete(id);

    if (typeof host._cleanup === 'function') host._cleanup();
    host.style.pointerEvents = 'none';

    if (!reducedMotion) {
      const anim = host.animate([
        { opacity: 1, transform: `rotate(${note.rotation}deg) scale(1.0)` },
        { opacity: 0, transform: `rotate(${note.rotation}deg) scale(0.88) translateY(-8px)` },
      ], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      anim.onfinish = () => host.remove();
      anim.oncancel = () => host.remove();
    } else {
      host.remove();
    }

    if (skipSave) return;
    const deletedUrl = currentUrl;
    _saveNow();
    if (!skipUndo) {
      ToastManager.show(snapshot, (noteSnapshot) => undoDelete(noteSnapshot, deletedUrl), confirmDelete);
    }
  }

  function undoDelete(noteSnapshot, expectedUrl) {
    if (expectedUrl && expectedUrl !== currentUrl) return;
    if (notes.has(noteSnapshot.id)) return;
    if (noteSnapshot.zIndex > maxZIndex) maxZIndex = noteSnapshot.zIndex;
    notes.set(noteSnapshot.id, noteSnapshot);
    renderNote(noteSnapshot, false);
    _saveNow();
  }

  function confirmDelete() {
    // Deletion is persisted immediately in deleteNote.
  }

  function bringToFront(id) {
    const note = notes.get(id);
    const host = domNodes.get(id);
    if (!note || !host) return;
    if (note.zIndex >= maxZIndex && maxZIndex > 0) return;
    maxZIndex++;
    note.zIndex = maxZIndex;
    host.style.zIndex = String(Z_INDEX_BASE + note.zIndex);
    debouncedSave();
  }

  function setAllVisibility(hidden) {
    meta.hidden = Boolean(hidden);
    isHidden = Boolean(hidden);
    _applyVisibilityToAll(isHidden);
    _trackWrite(Storage.saveMeta(currentUrl, { ...meta, noteCount: notes.size }));
  }

  function toggleVisibility() {
    setAllVisibility(!isHidden);
  }

  function clearAll() {
    clearTimeout(saveTimer);
    saveTimer = null;
    hasUnsavedChanges = false;
    ToastManager.dismiss(false);
    for (const [id, host] of domNodes) {
      if (typeof host._cleanup === 'function') host._cleanup();
      host.style.pointerEvents = 'none';
      const note = notes.get(id);
      if (!reducedMotion && note) {
        const anim = host.animate([
          { opacity: 1, transform: `rotate(${note.rotation}deg) scale(1.0)` },
          { opacity: 0, transform: `rotate(${note.rotation}deg) scale(0.88) translateY(-8px)` },
        ], { duration: 200, easing: 'ease-in', fill: 'forwards' });
        anim.onfinish = () => host.remove();
        anim.oncancel = () => host.remove();
      } else {
        host.remove();
      }
    }
    notes.clear();
    domNodes.clear();
    meta.noteCount = 0;
    _trackWrite(Storage.deleteAllForUrl(currentUrl));
  }

  function flushPendingSave() {
    if (saveTimer || hasUnsavedChanges) {
      clearTimeout(saveTimer);
      saveTimer = null;
      _saveNow();
    }
  }

  function clampAllToViewport() {
    for (const [id, note] of notes) {
      const clamped = IdUtils.clampNotePosition(note);
      if (clamped.x !== note.x || clamped.y !== note.y) {
        note.x = clamped.x;
        note.y = clamped.y;
        const host = domNodes.get(id);
        if (host) {
          host.style.left = `${note.x}px`;
          host.style.top = `${note.y}px`;
        }
      }
    }
  }

  function syncFromStorage(freshNotes, freshMeta) {
    const validatedList = [];
    const freshMap = new Map();
    for (const raw of (Array.isArray(freshNotes) ? freshNotes : [])) {
      const v = IdUtils.validateNote(raw);
      if (v) {
        const c = IdUtils.clampNotePosition(v);
        validatedList.push(c);
        freshMap.set(c.id, c);
      }
    }

    for (const [id] of Array.from(notes.entries())) {
      if (!freshMap.has(id)) {
        deleteNote(id, { skipUndo: true, skipSave: true });
      }
    }

    for (const fresh of validatedList) {
      const existing = notes.get(fresh.id);
      const host = domNodes.get(fresh.id);
      if (!existing || !host) {
        notes.set(fresh.id, fresh);
        if (fresh.zIndex > maxZIndex) maxZIndex = fresh.zIndex;
        renderNote(fresh, false);
        continue;
      }

      const shadow = host.shadowRoot;
      const isEditingThisNote = Boolean(shadow && shadow.activeElement);
      const prevX = existing.x;
      const prevY = existing.y;
      const prevW = existing.width;
      const prevH = existing.height;
      const prevZ = existing.zIndex;
      const prevColor = existing.color;
      const prevPinned = existing.pinned;
      const prevMinimized = existing.minimized;
      const prevChecklist = existing.isChecklist;
      const prevTitle = existing.title;
      const prevContent = existing.content;
      const prevUpdatedAt = existing.updatedAt;

      existing.x = fresh.x;
      existing.y = fresh.y;
      existing.width = fresh.width;
      existing.height = fresh.height;
      existing.color = fresh.color;
      existing.rotation = fresh.rotation;
      existing.pinned = fresh.pinned;
      existing.minimized = fresh.minimized;
      existing.isChecklist = fresh.isChecklist;
      existing.zIndex = fresh.zIndex;
      existing.createdAt = fresh.createdAt;
      existing.updatedAt = fresh.updatedAt;
      if (fresh.zIndex > maxZIndex) maxZIndex = fresh.zIndex;

      let contentChanged = false;
      if (!isEditingThisNote) {
        if (prevTitle !== fresh.title) {
          existing.title = fresh.title;
          const titleInput = shadow?.querySelector('.ts-title-input');
          if (titleInput && titleInput.value !== existing.title) titleInput.value = existing.title;
          contentChanged = true;
        }
        if (prevContent !== fresh.content) {
          existing.content = fresh.content;
          const textarea = shadow?.querySelector('.ts-textarea');
          if (textarea && textarea.value !== existing.content) textarea.value = existing.content;
          contentChanged = true;
        }
      }

      if (prevX !== existing.x) host.style.left = `${existing.x}px`;
      if (prevY !== existing.y) host.style.top = `${existing.y}px`;
      if (prevW !== existing.width) host.style.width = `${existing.width}px`;
      if (prevZ !== existing.zIndex) host.style.zIndex = String(Z_INDEX_BASE + existing.zIndex);

      const colorChanged = prevColor !== existing.color;
      if (colorChanged) {
        NoteRenderer.applyThemeVars(host, existing.color);
      }

      if (prevMinimized !== existing.minimized && shadow) {
        _applyMinimizedState(host, shadow, existing);
      } else if (!existing.minimized && prevH !== existing.height) {
        host.style.height = `${existing.height}px`;
      }

      const checklistModeChanged = prevChecklist !== existing.isChecklist;
      const pinnedChanged = prevPinned !== existing.pinned;
      const metaChanged = contentChanged || prevUpdatedAt !== existing.updatedAt;
      const needsChecklistRebuild = checklistModeChanged || (existing.isChecklist && contentChanged && !isEditingThisNote);

      if (typeof host._syncRender === 'function' && (metaChanged || needsChecklistRebuild || pinnedChanged || colorChanged)) {
        host._syncRender({
          meta: metaChanged,
          checklist: needsChecklistRebuild,
          pinned: pinnedChanged,
          color: colorChanged,
        });
      }
    }

    if (freshMeta && typeof freshMeta.hidden === 'boolean') {
      meta = { ...freshMeta, noteCount: notes.size };
      if (isHidden !== freshMeta.hidden) {
        isHidden = freshMeta.hidden;
        _applyVisibilityToAll(isHidden);
      }
    }
  }

  async function handleUrlChange(newUrl) {
    flushPendingSave();
    ToastManager.dismiss(true);
    for (const [, host] of domNodes) {
      if (typeof host._cleanup === 'function') host._cleanup();
      host.remove();
    }
    notes.clear();
    domNodes.clear();
    currentUrl = newUrl;
    try {
      const [storedNotes, storedMeta] = await Promise.all([
        Storage.getNotes(currentUrl),
        Storage.getMeta(currentUrl),
      ]);
      init(storedNotes, storedMeta, currentUrl, isGlassMode);
    } catch (err) {
      console.error('[TabStick] handleUrlChange failed:', err);
    }
  }

  function setGlassMode(value) {
    const next = Boolean(value);
    isGlassMode = next;
    for (const [, host] of domNodes) {
      NoteRenderer.applyGlassMode(host, next);
    }
  }

  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      _saveNow();
    }, 500);
  }

  function _saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    hasUnsavedChanges = false;
    const url = currentUrl;
    const notesArray = Array.from(notes.values()).map(n => ({ ...n }));
    meta.noteCount = notesArray.length;
    const metaSnapshot = notesArray.length > 0 ? { ...meta } : null;
    _trackWrite(Storage.saveNotesWithMeta(url, notesArray, metaSnapshot));
  }

  function _handleSaveError(err) {
    console.error('[TabStick] Save failed:', err);
  }

  function _applyVisibilityToAll(hidden) {
    for (const [, host] of domNodes) {
      host.style.display = hidden ? 'none' : 'block';
    }
  }

  function _applyPinnedState(shadow, host, note) {
    const header = shadow.querySelector('.ts-header');
    const textarea = shadow.querySelector('.ts-textarea');
    const titleInput = shadow.querySelector('.ts-title-input');
    const resizeHandle = shadow.querySelector('.ts-resize-handle');
    const pinBtn = shadow.querySelector('.ts-pin-btn');
    const checklist = shadow.querySelector('.ts-checklist');

    if (note.pinned) {
      header?.classList.add('ts-locked');
      if (textarea) { textarea.classList.add('ts-readonly'); textarea.setAttribute('readonly', ''); }
      if (titleInput) { titleInput.setAttribute('readonly', ''); }
      resizeHandle?.classList.add('ts-locked');
      if (pinBtn) {
        pinBtn.innerHTML = NoteRenderer.PIN_FILLED_SVG;
        pinBtn.setAttribute('aria-label', 'Unlock note position');
      }
      if (checklist) {
        checklist.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.disabled = true; });
        checklist.querySelectorAll('.ts-checklist-text').forEach(el => { el.contentEditable = 'false'; });
        const addBtn = checklist.querySelector('.ts-add-item-btn');
        if (addBtn) addBtn.style.display = 'none';
      }
    } else {
      header?.classList.remove('ts-locked');
      if (textarea) { textarea.classList.remove('ts-readonly'); textarea.removeAttribute('readonly'); }
      if (titleInput) { titleInput.removeAttribute('readonly'); }
      resizeHandle?.classList.remove('ts-locked');
      if (pinBtn) {
        pinBtn.innerHTML = NoteRenderer.PIN_SVG;
        pinBtn.setAttribute('aria-label', 'Lock note position');
      }
      if (checklist) {
        checklist.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.disabled = false; });
        checklist.querySelectorAll('.ts-checklist-text').forEach(el => { el.contentEditable = 'true'; });
        const addBtn = checklist.querySelector('.ts-add-item-btn');
        if (addBtn) addBtn.style.display = '';
      }
    }
  }

  function _applyMinimizedState(host, shadow, note) {
    const bodyArea = shadow.querySelector('.ts-body-area');
    const minBtn = shadow.querySelector('.ts-min-btn');
    const headerTitle = shadow.querySelector('.ts-header-title');
    const colorDot = shadow.querySelector('.ts-color-dot');

    if (note.minimized) {
      if (!reducedMotion) {
        if (bodyArea) { bodyArea.style.transition = 'opacity 100ms ease-out'; bodyArea.style.opacity = '0'; }
        setTimeout(() => {
          if (!host.isConnected || !note.minimized) return;
          if (bodyArea) bodyArea.style.display = 'none';
          host.style.transition = 'height 220ms ease-out';
          host.style.height = '36px';
          setTimeout(() => {
            if (host.isConnected) host.style.transition = '';
          }, 250);
        }, 80);
      } else {
        if (bodyArea) { bodyArea.style.display = 'none'; bodyArea.style.opacity = '0'; }
        host.style.height = '36px';
      }
      if (minBtn) { minBtn.innerHTML = NoteRenderer.EYE_CLOSED_SVG; minBtn.setAttribute('aria-label', 'Restore note'); }
      if (headerTitle) {
        headerTitle.style.display = 'inline-block';
        headerTitle.textContent = note.title || (note.content || '').substring(0, 30) || 'Note';
      }
      if (colorDot) colorDot.style.marginRight = '0';
    } else {
      if (!reducedMotion) {
        host.style.transition = 'height 250ms cubic-bezier(0.34, 1.2, 0.64, 1)';
        host.style.height = `${note.height}px`;
        setTimeout(() => {
          if (!host.isConnected || note.minimized) return;
          if (bodyArea) {
            bodyArea.style.display = '';
            bodyArea.style.transition = 'opacity 150ms ease-in';
            bodyArea.style.opacity = '1';
          }
          host.style.transition = '';
        }, 100);
      } else {
        host.style.height = `${note.height}px`;
        if (bodyArea) { bodyArea.style.display = ''; bodyArea.style.opacity = '1'; }
      }
      if (minBtn) { minBtn.innerHTML = NoteRenderer.EYE_OPEN_SVG; minBtn.setAttribute('aria-label', 'Minimize note'); }
      if (headerTitle) headerTitle.style.display = 'none';
      if (colorDot) colorDot.style.marginRight = '';
    }
  }

  function _showSavedIndicator(shadow) {
    const indicator = shadow.querySelector('.ts-saved-indicator');
    if (!indicator) return;
    indicator.style.opacity = '0.75';
    setTimeout(() => { indicator.style.transition = 'opacity 400ms ease'; indicator.style.opacity = '0'; }, 1000);
    setTimeout(() => { indicator.style.transition = 'opacity 150ms ease'; }, 1500);
  }

  return {
    __tabstick: true,
    init,
    createNote,
    renderNote,
    updateNote,
    deleteNote,
    undoDelete,
    confirmDelete,
    bringToFront,
    setAllVisibility,
    toggleVisibility,
    clearAll,
    flushPendingSave,
    clampAllToViewport,
    syncFromStorage,
    handleUrlChange,
    setGlassMode,
    debouncedSave,
    hasPendingWrites,
    whenWritesSettled,
    get notes() { return notes; },
    get currentUrl() { return currentUrl; },
    get meta() { return meta; },
  };
})();
