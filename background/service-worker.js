/**
 * Background Service Worker — Badge updates, command routing, storage migration, sync mirroring.
 * Spec §11
 */

// ── Inline utility functions (service worker can't import content script files) ──

function _normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
    return `${url.protocol}//${url.hostname}${pathname}`;
  } catch {
    return rawUrl;
  }
}

const _NOTES_PREFIX = 'tabstick::notes::';
const _META_PREFIX  = 'tabstick::meta::';
const _notesKey = (url) => `${_NOTES_PREFIX}${url}`;
const _metaKey  = (url) => `${_META_PREFIX}${url}`;

const CONTENT_CSS = ['content/content.css'];
const CONTENT_SCRIPTS = [
  'utils/colorThemes.js',
  'utils/storage.js',
  'utils/urlUtils.js',
  'utils/idUtils.js',
  'content/toastManager.js',
  'content/dragHandler.js',
  'content/resizeHandler.js',
  'content/noteRenderer.js',
  'content/noteManager.js',
  'content/content.js',
];

function _isValidColor(color) {
  const valid = ['sunflower', 'peach', 'mint', 'sky', 'lavender', 'rose', 'slate', 'cream'];
  return valid.includes(color);
}

// ── One-time storage migration from old prefix ──

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    try {
      const all = await chrome.storage.local.get(null);
      const toSet = {};
      const toRemove = [];

      for (const [key, value] of Object.entries(all)) {
        // Migrate old notes:: prefix to tabstick::notes::
        if (key.startsWith('notes::') && !key.startsWith(_NOTES_PREFIX)) {
          const url = key.replace('notes::', '');
          const newKey = _notesKey(url);
          // Don't overwrite if new key already exists
          if (!(newKey in all)) {
            const migratedNotes = (Array.isArray(value) ? value : []).map(note => ({
              id:          note.id || 'note_' + Math.random().toString(16).slice(2, 10),
              x:           typeof note.x === 'number' ? note.x : 100,
              y:           typeof note.y === 'number' ? note.y : 100,
              width:       typeof note.width === 'number' ? note.width : 240,
              height:      typeof note.height === 'number' ? note.height : 180,
              color:       _isValidColor(note.color) ? note.color : 'sunflower',
              rotation:    typeof note.rotation === 'number' ? note.rotation : parseFloat((Math.random() * 4 - 2).toFixed(2)),
              title:       typeof note.title === 'string' ? note.title : '',
              content:     typeof note.content === 'string' ? note.content : '',
              minimized:   typeof note.minimized === 'boolean' ? note.minimized : false,
              pinned:      typeof note.pinned === 'boolean' ? note.pinned : false,
              isChecklist: typeof note.isChecklist === 'boolean' ? note.isChecklist : false,
              zIndex:      typeof note.zOrder === 'number' ? note.zOrder : (typeof note.zIndex === 'number' ? note.zIndex : 0),
              createdAt:   typeof note.createdAt === 'number' ? note.createdAt : Date.now(),
              updatedAt:   typeof note.updatedAt === 'number' ? note.updatedAt : Date.now(),
            }));

            toSet[newKey] = migratedNotes;
            toSet[_metaKey(url)] = { hidden: false, noteCount: migratedNotes.length };
          }
          toRemove.push(key);
        }
      }

      if (Object.keys(toSet).length > 0) {
        await chrome.storage.local.set(toSet);
      }
      if (toRemove.length > 0) {
        await chrome.storage.local.remove(toRemove);
      }
    } catch (err) {
      console.error('[TabStick] Migration failed:', err);
    }
  }
});

// ── Badge updater ──

async function updateBadgeForTab(tabId, rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('http')) {
    try { await chrome.action.setBadgeText({ text: '', tabId }); } catch {}
    return;
  }

  const url = _normalizeUrl(rawUrl);
  try {
    const result = await chrome.storage.local.get([_notesKey(url), _metaKey(url)]);
    const notes = result[_notesKey(url)] || [];
    const meta  = result[_metaKey(url)]  || { hidden: false };
    const count = notes.length;

    if (count === 0) {
      await chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const text    = count > 9 ? '9+' : String(count);
    const bgColor = meta.hidden ? '#90A4AE' : '#F9A825';
    const txColor = meta.hidden ? '#FFFFFF' : '#000000';

    await chrome.action.setBadgeText({ text, tabId });
    await chrome.action.setBadgeBackgroundColor({ color: bgColor, tabId });
    await chrome.action.setBadgeTextColor({ color: txColor, tabId });
  } catch {
    try { await chrome.action.setBadgeText({ text: '', tabId }); } catch {}
  }
}

// ── Storage change listener (badge updates + inbound sync mirror) ──

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local') {
    const affectedUrls = new Set();
    for (const key of Object.keys(changes)) {
      if (key.startsWith(_NOTES_PREFIX)) {
        affectedUrls.add(_normalizeUrl(key.slice(_NOTES_PREFIX.length)));
      } else if (key.startsWith(_META_PREFIX)) {
        affectedUrls.add(_normalizeUrl(key.slice(_META_PREFIX.length)));
      }
    }
    if (affectedUrls.size === 0) return;

    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab?.id && tab?.url && affectedUrls.has(_normalizeUrl(tab.url))) {
          await updateBadgeForTab(tab.id, tab.url);
        }
      }
    } catch {}
    return;
  }

  if (area === 'sync') {
    try {
      const { syncEnabled } = await chrome.storage.local.get('syncEnabled');
      if (!syncEnabled) return;

      for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith(_NOTES_PREFIX)) continue;
        const url = key.slice(_NOTES_PREFIX.length);
        const mKey = _metaKey(url);
        const localData = await chrome.storage.local.get([key, mKey]);
        const localNotes = localData[key];
        const localMeta = localData[mKey];

        if (Array.isArray(change.newValue) && change.newValue.length > 0) {
          if (JSON.stringify(localNotes) !== JSON.stringify(change.newValue)) {
            await chrome.storage.local.set({
              [key]: change.newValue,
              [mKey]: { ...(localMeta || { hidden: false }), noteCount: change.newValue.length },
            });
          }
        } else if (key in localData) {
          await chrome.storage.local.remove([key, mKey]);
        }
      }
    } catch (err) {
      console.error('[TabStick] Sync pull failed:', err);
    }
  }
});

// Badge: on tab switch
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) await updateBadgeForTab(tab.id, tab.url);
  } catch {}
});

// Badge: on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.status === 'complete' || changeInfo.url) && tab?.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

// ── Keyboard command handler (with on-demand script injection) ──

async function _sendCommandToTab(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch {
    await chrome.scripting.insertCSS({ target: { tabId }, files: CONTENT_CSS });
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS });
    await chrome.tabs.sendMessage(tabId, payload);
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
      return;
    }

    if (command === 'create-note') {
      await _sendCommandToTab(tab.id, { type: 'CREATE_NOTE', fromCommand: true });
    } else if (command === 'toggle-notes') {
      await _sendCommandToTab(tab.id, { type: 'TOGGLE_NOTES', fromCommand: true });
    }
  } catch {}
});
