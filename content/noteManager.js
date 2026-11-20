/**
 * NoteManager — Central state management and CRUD for sticky notes.
 * Full feature set: titles, timestamps, checklists, glass mode, undo, animations.
 */
const NoteManager = (function() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let currentUrl   = '';
  let notes        = new Map();
  let domNodes     = new Map();
  let maxZIndex    = 0;
  let meta         = { hidden: false, noteCount: 0 };
  let saveTimer    = null;
  let spawnCounter = 0;
  let isHidden     = false;
  let isGlassMode  = false;

  // ── Init ──
  function init(notesArray, urlMeta, url) {
    currentUrl = url;
    meta = urlMeta;
    notes.clear();
    domNodes.clear();
    maxZIndex = 0;
    spawnCounter = 0;

    for (const raw of notesArray) {
      const validated = IdUtils.validateNote(raw);
      if (!validated) { console.warn('[TabStick] Skipping invalid note:', raw); continue; }
      const clamped = IdUtils.clampNotePosition(validated);
      notes.set(clamped.id, clamped);
      if (clamped.zIndex > maxZIndex) maxZIndex = clamped.zIndex;
    }

    for (const [, note] of notes) { renderNote(note, false); }
    if (meta.hidden) { isHidden = true; _applyVisibilityToAll(true); }
  }

  // ── Create ──
  function createNote() {
    const offsetIndex = spawnCounter % 8;
    const baseX = (window.innerWidth - 240) / 2;
    const baseY = (window.innerHeight - 180) / 2;
    spawnCounter++;

    const note = IdUtils.createDefaultNote(baseX + offsetIndex * 24, baseY + offsetIndex * 24);
    maxZIndex++;
    note.zIndex = maxZIndex;
    notes.set(note.id, note);
    renderNote(note, true);

    Storage.saveNotes(currentUrl, Array.from(notes.values())).catch(_handleSaveError);
    meta.noteCount = notes.size;
    Storage.saveMeta(currentUrl, meta).catch(_handleSaveError);
  }

  // ── Render ──
  function renderNote(note, animate) {
    const { host, shadow } = NoteRenderer.buildNote(note);

    // Glass mode
    if (isGlassMode) NoteRenderer.applyGlassMode(host, true, note.color);

    // Bring to front on mousedown
    host.addEventListener('mousedown', () => { bringToFront(note.id); });

    // Drag & Resize
    DragHandler.attachDrag(host, shadow, note, (c) => updateNote(note.id, c));
    ResizeHandler.attachResize(host, shadow, note, (c) => updateNote(note.id, c));

    const textarea = shadow.querySelector('.ts-textarea');
    const titleInput = shadow.querySelector('.ts-title-input');
    const headerTitle = shadow.querySelector('.ts-header-title');
    const timestampsDiv = shadow.querySelector('.ts-timestamps');
    const checklistContainer = shadow.querySelector('.ts-checklist');
    let inputDebounce = null;

    // ── Title ──
    function updateHeaderTitle() {
      if (headerTitle) {
        headerTitle.textContent = note.title || (note.content || '').substring(0, 30) || 'Note';
      }
    }
    updateHeaderTitle();

    if (titleInput) {
      titleInput.addEventListener('input', () => {
        note.title = titleInput.value;
        note.updatedAt = Date.now();
        updateHeaderTitle();
        _updateTimestamps();
        clearTimeout(inputDebounce);
        inputDebounce = setTimeout(() => { debouncedSave(); _showSavedIndicator(shadow); }, 500);
      });
    }

    // ── Timestamps ──
    function _updateTimestamps() {
      if (!timestampsDiv) return;
      const fmt = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      };
      timestampsDiv.textContent = `Created ${fmt(note.createdAt)} · Edited ${fmt(note.updatedAt)}`;
    }
    _updateTimestamps();

    // ── Textarea ──
    if (textarea) {
      textarea.addEventListener('input', () => {
        note.content = textarea.value;
        note.updatedAt = Date.now();
        updateHeaderTitle();
        _updateTimestamps();
        clearTimeout(inputDebounce);
        inputDebounce = setTimeout(() => { debouncedSave(); _showSavedIndicator(shadow); }, 500);
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = textarea.selectionStart, end = textarea.selectionEnd;
          textarea.value = textarea.value.substring(0, s) + '\t' + textarea.value.substring(end);
          textarea.selectionStart = textarea.selectionEnd = s + 1;
          textarea.dispatchEvent(new Event('input'));
        }
        if (e.key === 'Escape') textarea.blur();
      });

      // Focus / blur scale
      textarea.addEventListener('focus', () => {
        if (!reducedMotion) {
          host.style.transition = 'box-shadow 200ms ease, transform 200ms ease';
          host.style.transform = `rotate(${note.rotation}deg) scale(1.015)`;
          host.style.boxShadow = `0 2px 4px rgba(0,0,0,0.10), 0 8px 16px rgba(0,0,0,0.15), 0 20px 40px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,0.55) inset`;
        }
      });
      textarea.addEventListener('blur', () => {
        if (!reducedMotion) {
          host.style.transition = 'box-shadow 200ms ease, transform 200ms ease';
          host.style.transform = `rotate(${note.rotation}deg) scale(1.0)`;
          host.style.boxShadow = isGlassMode
            ? 'inset 0 1px 1px rgba(255,255,255,0.4), 0 8px 32px rgba(0,0,0,0.15)'
            : `0 1px 2px rgba(0,0,0,0.07), 0 4px 8px rgba(0,0,0,0.10), 0 12px 24px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.55) inset`;
          setTimeout(() => { if (host.isConnected) host.style.transition = ''; }, 250);
        }
      });
    }

    // ── Checklist ──
    function textToChecklist(text) {
      if (!text) return [{ text: '', checked: false }];
      const lines = text.split('\n');
      const items = [];
      for (let line of lines) {
        let checked = false, val = line;
        if (val.startsWith('[x] ') || val.startsWith('[X] ')) { checked = true; val = val.substring(4); }
        else if (val.startsWith('[ ] ')) { checked = false; val = val.substring(4); }
        items.push({ text: val, checked });
      }
      if (items.length === 0) items.push({ text: '', checked: false });
      return items;
    }

    function checklistToText(items) {
      return items.map(item => (item.checked ? '[x] ' : '[ ] ') + item.text).join('\n');
    }

    function renderChecklist() {
      if (!checklistContainer) return;
      checklistContainer.innerHTML = '';
      const items = textToChecklist(note.content || '');

      items.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `ts-checklist-item ${item.checked ? 'checked' : ''}`;

        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = item.checked;

        const textDiv = document.createElement('div');
        textDiv.className = 'ts-checklist-text';
        textDiv.contentEditable = 'true';
        textDiv.textContent = item.text;

        cb.addEventListener('change', () => {
          item.checked = cb.checked;
          itemDiv.classList.toggle('checked', cb.checked);
          _updateFromChecklist(items);
        });

        textDiv.addEventListener('input', () => {
          item.text = textDiv.textContent;
          _updateFromChecklist(items);
        });

        textDiv.addEventListener('keydown', (e) => {
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
          }
        });

        itemDiv.appendChild(cb);
        itemDiv.appendChild(textDiv);
        checklistContainer.appendChild(itemDiv);
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'ts-add-item-btn';
      addBtn.textContent = '+ Add item';
      addBtn.addEventListener('click', () => {
        items.push({ text: '', checked: false });
        _updateFromChecklist(items);
        renderChecklist();
        const lastText = checklistContainer.querySelector('.ts-checklist-item:last-of-type .ts-checklist-text');
        if (lastText) lastText.focus();
      });
      checklistContainer.appendChild(addBtn);
    }

    function _updateFromChecklist(items) {
      note.content = checklistToText(items);
      note.updatedAt = Date.now();
      if (textarea) textarea.value = note.content;
      clearTimeout(inputDebounce);
      inputDebounce = setTimeout(() => { debouncedSave(); _showSavedIndicator(shadow); }, 500);
    }

    function applyChecklistState() {
      if (!textarea || !checklistContainer) return;
      if (note.isChecklist) {
        textarea.style.display = 'none';
        checklistContainer.style.display = 'flex';
        renderChecklist();
      } else {
        textarea.style.display = 'block';
        checklistContainer.style.display = 'none';
      }
    }
    applyChecklistState();

    // Checklist toggle button
    const checklistBtn = shadow.querySelector('.ts-checklist-btn');
    if (checklistBtn) {
      checklistBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        note.isChecklist = !note.isChecklist;
        applyChecklistState();
        debouncedSave();
      });
    }

    // ── Color dot ──
    const colorDot = shadow.querySelector('.ts-color-dot');
    if (colorDot) {
      colorDot.addEventListener('click', (e) => {
        e.stopPropagation();
        note.color = ColorThemes.nextColor(note.color);
        NoteRenderer.applyThemeVars(host, note.color);
        if (isGlassMode) NoteRenderer.applyGlassMode(host, true, note.color);
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

        // Ignore double click if triggered on or inside buttons or color dots
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
    const closeBtn = shadow.querySelector('.ts-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNote(note.id);
      });
    }

    // Apply hidden state
    if (isHidden) {
      host.style.display = 'none';
    }

    document.body.appendChild(host);
    domNodes.set(note.id, host);

    // Spawn animation
    if (animate && !reducedMotion) {
      host.animate([
        { opacity: 0, transform: `rotate(${note.rotation}deg) scale(0.85) translateY(10px)` },
        { opacity: 1, transform: `rotate(${note.rotation}deg) scale(1.0) translateY(0)` },
      ], { duration: 280, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' });
    } else {
      host.style.opacity = '1';
    }

    // Focus on creation
    if (animate && !isHidden) {
      setTimeout(() => {
        if (textarea) textarea.focus();
        else if (titleInput) titleInput.focus();
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

  function deleteNote(id, { skipUndo = false } = {}) {
    const note = notes.get(id);
    const host = domNodes.get(id);
    if (!note || !host) return;
    const snapshot = { ...note };
    notes.delete(id);
    domNodes.delete(id);

    if (!reducedMotion) {
      const anim = host.animate([
        { opacity: 1, transform: `rotate(${note.rotation}deg) scale(1.0)` },
        { opacity: 0, transform: `rotate(${note.rotation}deg) scale(0.88) translateY(-8px)` },
      ], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      anim.onfinish = () => host.remove();
    } else { host.remove(); }

    if (skipUndo) { _saveNow(); } else { ToastManager.show(snapshot, undoDelete, confirmDelete); }
  }

  function undoDelete(noteSnapshot) {
    notes.set(noteSnapshot.id, noteSnapshot);
    renderNote(noteSnapshot, false);
    _saveNow();
  }

  function confirmDelete(id) { _saveNow(); }

  function bringToFront(id) {
    const note = notes.get(id);
    const host = domNodes.get(id);
    if (!note || !host) return;
    if (note.zIndex >= maxZIndex && maxZIndex > 0) return;
    maxZIndex++;
    note.zIndex = maxZIndex;
    host.style.zIndex = String(2147483640 + note.zIndex);
    debouncedSave();
  }

  function setAllVisibility(hidden) {
    meta.hidden = hidden;
    isHidden = hidden;
    _applyVisibilityToAll(hidden);
    Storage.saveMeta(currentUrl, meta).catch(_handleSaveError);
  }

  function toggleVisibility() {
    setAllVisibility(!isHidden);
  }

  function clearAll() {
    for (const [id, host] of domNodes) {
      const note = notes.get(id);
      if (!reducedMotion && note) {
        const anim = host.animate([
          { opacity: 1, transform: `rotate(${note.rotation}deg) scale(1.0)` },
          { opacity: 0, transform: `rotate(${note.rotation}deg) scale(0.88) translateY(-8px)` },
        ], { duration: 200, easing: 'ease-in', fill: 'forwards' });
        anim.onfinish = () => host.remove();
      } else { host.remove(); }
    }
    notes.clear();
    domNodes.clear();
    Storage.deleteAllForUrl(currentUrl).catch(_handleSaveError);
  }

  async function handleUrlChange(newUrl) {
    for (const [, host] of domNodes) host.remove();
    notes.clear();
    domNodes.clear();
    clearTimeout(saveTimer);
    currentUrl = newUrl;
    try {
      const [storedNotes, storedMeta] = await Promise.all([Storage.getNotes(currentUrl), Storage.getMeta(currentUrl)]);
      init(storedNotes, storedMeta, currentUrl);
    } catch (err) { console.error('[TabStick] handleUrlChange failed:', err); }
  }

  function setGlassMode(value) {
    if (isGlassMode === value) return;
    isGlassMode = value;
    for (const [id, host] of domNodes) {
      const note = notes.get(id);
      if (note) {
        NoteRenderer.applyGlassMode(host, value, note.color);
        NoteRenderer.applyThemeVars(host, note.color);
      }
    }
  }

  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => _saveNow(), 500);
  }

  function _saveNow() {
    const notesArray = Array.from(notes.values());
    Storage.saveNotes(currentUrl, notesArray).catch(_handleSaveError);
    meta.noteCount = notesArray.length;
    Storage.saveMeta(currentUrl, meta).catch(_handleSaveError);
  }

  function _handleSaveError(err) { console.error('[TabStick] Save failed:', err); }

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

    if (note.pinned) {
      header.classList.add('ts-locked');
      if (textarea) { textarea.classList.add('ts-readonly'); textarea.setAttribute('readonly', ''); }
      if (titleInput) { titleInput.setAttribute('readonly', ''); titleInput.style.opacity = '0.85'; }
      resizeHandle.classList.add('ts-locked');
      pinBtn.innerHTML = NoteRenderer.PIN_FILLED_SVG;
      pinBtn.setAttribute('aria-label', 'Unlock note position');
    } else {
      header.classList.remove('ts-locked');
      if (textarea) { textarea.classList.remove('ts-readonly'); textarea.removeAttribute('readonly'); }
      if (titleInput) { titleInput.removeAttribute('readonly'); titleInput.style.opacity = '1'; }
      resizeHandle.classList.remove('ts-locked');
      pinBtn.innerHTML = NoteRenderer.PIN_SVG;
      pinBtn.setAttribute('aria-label', 'Lock note position');
    }
  }

  function _applyMinimizedState(host, shadow, note) {
    const bodyArea = shadow.querySelector('.ts-body-area');
    const footer = shadow.querySelector('.ts-footer');
    const minBtn = shadow.querySelector('.ts-min-btn');
    const headerTitle = shadow.querySelector('.ts-header-title');
    const colorDot = shadow.querySelector('.ts-color-dot');

    if (note.minimized) {
      if (!reducedMotion) {
        if (bodyArea) { bodyArea.style.transition = 'opacity 100ms ease-out'; bodyArea.style.opacity = '0'; }
        if (footer) footer.style.display = 'none';
        setTimeout(() => {
          if (bodyArea) bodyArea.style.display = 'none';
          host.style.transition = 'height 220ms ease-out';
          host.style.height = '36px';
          setTimeout(() => { host.style.transition = ''; }, 250);
        }, 80);
      } else {
        if (bodyArea) { bodyArea.style.display = 'none'; bodyArea.style.opacity = '0'; }
        if (footer) footer.style.display = 'none';
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
          if (bodyArea) { bodyArea.style.display = ''; bodyArea.style.transition = 'opacity 150ms ease-in'; bodyArea.style.opacity = '1'; }
          if (footer) footer.style.display = '';
          host.style.transition = '';
        }, 100);
      } else {
        host.style.height = `${note.height}px`;
        if (bodyArea) { bodyArea.style.display = ''; bodyArea.style.opacity = '1'; }
        if (footer) footer.style.display = '';
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
    init, createNote, renderNote, updateNote, deleteNote, undoDelete, confirmDelete,
    bringToFront, setAllVisibility, toggleVisibility, clearAll, handleUrlChange,
    setGlassMode, debouncedSave,
    get notes() { return notes; },
    get currentUrl() { return currentUrl; },
    get meta() { return meta; },
  };
})();
