/**
 * Background Service Worker — Badge updates, command routing, storage migration.
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

// ── One-time storage migration from old prefix ──

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    try {
      const all = await chrome.storage.local.get(null);
      const toSet = {};
      const toRemove = [];
      let migrated = 0;

      for (const [key, value] of Object.entries(all)) {
        // Migrate old notes:: prefix to tabstick::notes::
        if (key.startsWith('notes::') && !key.startsWith('tabstick::notes::')) {
          const url = key.replace('notes::', '');
          const newKey = _notesKey(url);
          // Don't overwrite if new key already exists
          if (!(newKey in all)) {
            // Migrate note schema: zOrder → zIndex, remove isChecklist
            const migratedNotes = (Array.isArray(value) ? value : []).map(note => ({
              id:        note.id || 'note_' + Math.random().toString(16).slice(2, 10),
              x:         typeof note.x === 'number' ? note.x : 100,
              y:         typeof note.y === 'number' ? note.y : 100,
              width:     typeof note.width === 'number' ? note.width : 240,
              height:    typeof note.height === 'number' ? note.height : 180,
              color:     _isValidColor(note.color) ? note.color : 'sunflower',
              rotation:  typeof note.rotation === 'number' ? note.rotation : parseFloat((Math.random() * 4 - 2).toFixed(2)),
              content:   typeof note.content === 'string' ? note.content : '',
              minimized: typeof note.minimized === 'boolean' ? note.minimized : false,
              pinned:    typeof note.pinned === 'boolean' ? note.pinned : false,
              zIndex:    typeof note.zOrder === 'number' ? note.zOrder : (typeof note.zIndex === 'number' ? note.zIndex : 0),
              createdAt: typeof note.createdAt === 'number' ? note.createdAt : Date.now(),
              updatedAt: typeof note.updatedAt === 'number' ? note.updatedAt : Date.now(),
            }));

            toSet[newKey] = migratedNotes;
            // Also create meta key
            toSet[_metaKey(url)] = { hidden: false, noteCount: migratedNotes.length };
            migrated++;
          }
          toRemove.push(key);
        }
      }

      if (Object.keys(toSet).length > 0) {
        await chrome.storage.local.set(toSet);
        console.log(`[TabStick] Migrated ${migrated} URL(s) to new storage format.`);
      }
      // Clean up old keys and settings
      const settingsToRemove = ['syncEnabled', 'setting::glassMode'];
      const allRemove = [...toRemove, ...settingsToRemove.filter(k => k in all)];
      if (allRemove.length > 0) {
        await chrome.storage.local.remove(allRemove);
      }
    } catch (err) {
      console.error('[TabStick] Migration failed:', err);
    }
  }
});

function _isValidColor(color) {
  const valid = ['sunflower', 'peach', 'mint', 'sky', 'lavender', 'rose', 'slate', 'cream'];
  return valid.includes(color);
}

// ── Badge updater ──

async function updateBadgeForTab(tabId, rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('http')) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  const url = _normalizeUrl(rawUrl);
  try {
    const result = await chrome.storage.local.get([_notesKey(url), _metaKey(url)]);
    const notes = result[_notesKey(url)] || [];
    const meta  = result[_metaKey(url)]  || { hidden: false };
    const count = notes.length;

    if (count === 0) {
      chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const text   = count > 9 ? '9+' : String(count);
    const bgColor = meta.hidden ? '#90A4AE' : '#F9A825';
    const txColor = meta.hidden ? '#FFFFFF' : '#000000';

    chrome.action.setBadgeText({ text, tabId });
    chrome.action.setBadgeBackgroundColor({ color: bgColor, tabId });
    chrome.action.setBadgeTextColor({ color: txColor, tabId });
  } catch (err) {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// Badge: on storage change
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab?.url) {
      updateBadgeForTab(tab.id, tab.url);
    }
  } catch {}
});

// Badge: on tab switch
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) updateBadgeForTab(tabId, tab.url);
  } catch {}
});

// Badge: on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

// ── Keyboard command handler ──

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url?.startsWith('http')) return;

    if (command === 'create-note') {
      chrome.tabs.sendMessage(tab.id, { type: 'CREATE_NOTE' }, () => {
        void chrome.runtime.lastError;
      });
    } else if (command === 'toggle-notes') {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_NOTES' }, () => {
        void chrome.runtime.lastError;
      });
    }
  } catch {}
});

