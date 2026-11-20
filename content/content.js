/**
 * Content Script Entry Point.
 * Init, message listener, SPA URL watcher, cross-tab sync, glass mode.
 */
(async function() {
  if (window.__tabstickInitialized) return;
  window.__tabstickInitialized = true;

  const currentUrl = UrlUtils.normalizeUrl(window.location.href);

  const [storedNotes, storedMeta, isGlassMode] = await Promise.all([
    Storage.getNotes(currentUrl),
    Storage.getMeta(currentUrl),
    Storage.getGlassMode(),
  ]);

  NoteManager.init(storedNotes, storedMeta, currentUrl, isGlassMode);

  let lastShortcutAt = 0;

  // ── Message listener ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;

    try {
      const cmd = msg.type || msg.action;
      switch (cmd) {
        case 'PING':
        case 'GET_NOTE_COUNT':
        case 'GET_COUNT':
          sendResponse({ success: true, count: NoteManager.notes.size });
          break;
        case 'CREATE_NOTE': {
          if (msg.fromCommand) {
            const now = Date.now();
            if (now - lastShortcutAt < 150) {
              sendResponse({ success: true, count: NoteManager.notes.size });
              break;
            }
            lastShortcutAt = now;
          }
          NoteManager.createNote();
          sendResponse({ success: true, count: NoteManager.notes.size });
          break;
        }
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
        case 'TOGGLE_NOTES': {
          if (msg.fromCommand) {
            const now = Date.now();
            if (now - lastShortcutAt < 150) {
              sendResponse({ success: true });
              break;
            }
            lastShortcutAt = now;
          }
          NoteManager.toggleVisibility();
          sendResponse({ success: true });
          break;
        }
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

  // ── Live storage sync (glass mode + notes/meta across tabs/popup/dashboard) ──
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;

    if (Storage.GLASS_KEY in changes) {
      NoteManager.setGlassMode(Boolean(changes[Storage.GLASS_KEY].newValue));
    }

    const nKey = Storage.notesKey(NoteManager.currentUrl);
    const mKey = Storage.metaKey(NoteManager.currentUrl);
    if (nKey in changes || mKey in changes) {
      try {
        const [freshNotes, freshMeta] = await Promise.all([
          Storage.getNotes(NoteManager.currentUrl),
          Storage.getMeta(NoteManager.currentUrl),
        ]);
        NoteManager.syncFromStorage(freshNotes, freshMeta);
      } catch (err) {
        console.error('[TabStick] Storage sync error:', err);
      }
    }
  });

  // ── SPA URL change watcher ──
  let lastHref = window.location.href;
  let lastUrl = currentUrl;
  let urlCheckTimer = null;

  function checkUrlChange() {
    if (window.location.href === lastHref) return;
    lastHref = window.location.href;
    clearTimeout(urlCheckTimer);
    urlCheckTimer = setTimeout(() => {
      const newUrl = UrlUtils.normalizeUrl(window.location.href);
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        NoteManager.handleUrlChange(newUrl);
      }
    }, 100);
  }

  const rootTarget = document.documentElement || document;
  const urlObserver = new MutationObserver(checkUrlChange);
  urlObserver.observe(rootTarget, { subtree: true, childList: true });
  window.addEventListener('popstate', checkUrlChange);
  window.addEventListener('hashchange', checkUrlChange);

  // ── Keyboard Shortcuts Fallback / Accelerator ──
  window.addEventListener('keydown', (e) => {
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
        const now = Date.now();
        if (now - lastShortcutAt < 150) return;
        lastShortcutAt = now;
        NoteManager.createNote();
      } else if (key === 'a' || e.code === 'KeyA') {
        e.preventDefault();
        const now = Date.now();
        if (now - lastShortcutAt < 150) return;
        lastShortcutAt = now;
        NoteManager.toggleVisibility();
      }
    }
  });

  // ── Flush pending saves, cross-tab visibility sync, and viewport clamping ──
  window.addEventListener('pagehide', () => {
    NoteManager.flushPendingSave();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      NoteManager.clampAllToViewport();
    }, 150);
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      NoteManager.flushPendingSave();
      return;
    }
    if (document.visibilityState !== 'visible') return;
    try {
      const [freshNotes, freshMeta, freshGlass] = await Promise.all([
        Storage.getNotes(NoteManager.currentUrl),
        Storage.getMeta(NoteManager.currentUrl),
        Storage.getGlassMode(),
      ]);
      NoteManager.setGlassMode(freshGlass);
      NoteManager.syncFromStorage(freshNotes, freshMeta);
    } catch (err) {
      console.error('[TabStick] Cross-tab sync error:', err);
    }
  });
})();
