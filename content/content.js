/**
 * Content Script Entry Point.
 * Init, message listener, SPA URL watcher, cross-tab sync, glass mode.
 */
(async function() {
  const currentUrl = UrlUtils.normalizeUrl(window.location.href);

  const [storedNotes, storedMeta] = await Promise.all([
    Storage.getNotes(currentUrl),
    Storage.getMeta(currentUrl),
  ]);

  NoteManager.init(storedNotes, storedMeta, currentUrl);

  // Apply glass mode from settings
  try {
    const isGlassMode = await Storage.getGlassMode();
    NoteManager.setGlassMode(isGlassMode);
  } catch {}

  // ── Message listener ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;

    try {
      switch (msg.type || msg.action) {
        case 'CREATE_NOTE':
          NoteManager.createNote();
          sendResponse({ success: true });
          break;
        case 'DELETE_NOTE':
          NoteManager.deleteNote(msg.noteId, { skipUndo: true });
          sendResponse({ success: true });
          break;
        case 'CLEAR_NOTES':
          NoteManager.clearAll();
          sendResponse({ success: true });
          break;
        case 'TOGGLE_VISIBILITY':
          if (typeof msg.hidden === 'boolean') {
            NoteManager.setAllVisibility(msg.hidden);
          } else {
            NoteManager.toggleVisibility();
          }
          sendResponse({ success: true });
          break;
        case 'TOGGLE_NOTES':
          NoteManager.toggleVisibility();
          sendResponse({ success: true });
          break;
        case 'GET_NOTE_COUNT':
        case 'GET_COUNT':
          sendResponse({ success: true, count: NoteManager.notes.size });
          break;
        case 'SET_GLASS_MODE':
          NoteManager.setGlassMode(msg.value);
          sendResponse({ success: true });
          break;
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      console.error('[TabStick] Message handler error:', err);
      sendResponse({ success: false, error: err.message });
    }

    return true;
  });

  // ── SPA URL change watcher ──
  let lastUrl = currentUrl;
  let urlCheckTimer = null;

  function checkUrlChange() {
    clearTimeout(urlCheckTimer);
    urlCheckTimer = setTimeout(() => {
      const newUrl = UrlUtils.normalizeUrl(window.location.href);
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        NoteManager.handleUrlChange(newUrl);
      }
    }, 100);
  }

  const urlObserver = new MutationObserver(checkUrlChange);
  urlObserver.observe(document, { subtree: true, childList: true });
  window.addEventListener('popstate', checkUrlChange);

  // ── Keyboard Shortcuts Fallback / Accelerator ──
  window.addEventListener('keydown', (e) => {
    // Ignore if typing in text fields or contenteditable elements
    const active = document.activeElement;
    if (active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.isContentEditable ||
      (active.shadowRoot && active.shadowRoot.activeElement)
    )) {
      return;
    }

    const isAlt = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (isAlt) {
      const key = e.key.toLowerCase();
      if (key === 's' || e.code === 'KeyS') {
        e.preventDefault();
        NoteManager.createNote();
      } else if (key === 'a' || e.code === 'KeyA') {
        e.preventDefault();
        NoteManager.toggleVisibility();
      }
    }
  });

  // ── Cross-tab sync ──
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const freshNotes = await Storage.getNotes(NoteManager.currentUrl);
      const freshIds = new Set(freshNotes.map(n => n.id));

      for (const n of freshNotes) {
        if (!NoteManager.notes.has(n.id)) {
          const validated = IdUtils.validateNote(n);
          if (validated) {
            NoteManager.notes.set(validated.id, validated);
            NoteManager.renderNote(validated, false);
          }
        }
      }

      for (const [id] of NoteManager.notes) {
        if (!freshIds.has(id)) {
          NoteManager.deleteNote(id, { skipUndo: true });
        }
      }
    } catch (err) {
      console.error('[TabStick] Cross-tab sync error:', err);
    }
  });

})();
