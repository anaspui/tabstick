/**
 * Storage — chrome.storage.local Promise wrappers.
 * Spec §8.2, §8.6
 * All methods return Promises. Uses tabstick:: prefix.
 */
var Storage = (globalThis.Storage && globalThis.Storage.__tabstick) ? globalThis.Storage : (function() {
  const NOTES_PREFIX = 'tabstick::notes::';
  const META_PREFIX  = 'tabstick::meta::';
  const GLASS_KEY    = 'setting::glassMode';
  const SYNC_KEY     = 'syncEnabled';

  const notesKey = (url) => `${NOTES_PREFIX}${url}`;
  const metaKey  = (url) => `${META_PREFIX}${url}`;

  /**
   * Get notes array for a normalized URL.
   * Returns [] if key doesn't exist (never throws on missing key).
   * @param {string} normalizedUrl
   * @returns {Promise<object[]>}
   */
  async function getNotes(normalizedUrl) {
    try {
      const key = notesKey(normalizedUrl);
      const result = await chrome.storage.local.get(key);
      return result[key] || [];
    } catch (err) {
      console.error('[TabStick] Storage.getNotes failed:', err);
      return [];
    }
  }

  /**
   * Full replace of the notes array for this URL.
   * Removes URL keys when empty, includes retry with exponential backoff,
   * and mirrors to chrome.storage.sync when sync is enabled.
   * @param {string} normalizedUrl
   * @param {object[]} notes
   * @returns {Promise<void>}
   */
  async function saveNotes(normalizedUrl, notes) {
    if (!Array.isArray(notes) || notes.length === 0) {
      await deleteAllForUrl(normalizedUrl);
      return;
    }
    const key = notesKey(normalizedUrl);
    await _retryWrite({ [key]: notes });
    await _syncNotesMirror(key, notes);
  }

  /**
   * Get URL metadata. Returns default if key doesn't exist.
   * @param {string} normalizedUrl
   * @returns {Promise<{hidden: boolean, noteCount: number}>}
   */
  async function getMeta(normalizedUrl) {
    try {
      const key = metaKey(normalizedUrl);
      const result = await chrome.storage.local.get(key);
      return result[key] || { hidden: false, noteCount: 0 };
    } catch (err) {
      console.error('[TabStick] Storage.getMeta failed:', err);
      return { hidden: false, noteCount: 0 };
    }
  }

  /**
   * Save URL metadata.
   * @param {string} normalizedUrl
   * @param {object} meta
   * @returns {Promise<void>}
   */
  async function saveMeta(normalizedUrl, meta) {
    const key = metaKey(normalizedUrl);
    await _retryWrite({ [key]: meta });
  }

  /**
   * Removes both the notes key and the meta key for this URL.
   * @param {string} normalizedUrl
   * @returns {Promise<void>}
   */
  async function deleteAllForUrl(normalizedUrl) {
    const key = notesKey(normalizedUrl);
    try {
      await chrome.storage.local.remove([key, metaKey(normalizedUrl)]);
    } catch (err) {
      console.error('[TabStick] Storage.deleteAllForUrl failed:', err);
    }
    await _syncNotesMirror(key, null);
  }

  /**
   * Returns all storage keys.
   * @returns {Promise<string[]>}
   */
  async function getAllKeys() {
    try {
      const data = await chrome.storage.local.get(null);
      return Object.keys(data);
    } catch (err) {
      console.error('[TabStick] Storage.getAllKeys failed:', err);
      return [];
    }
  }

  /**
   * Internal: write with retry (3 attempts, exponential backoff 100/200/400ms).
   * Spec §2.3 — On storage write failure, retry up to 3 times.
   * @param {object} data
   * @returns {Promise<void>}
   */
  async function _retryWrite(data) {
    const delays = [100, 200, 400];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        await chrome.storage.local.set(data);
        return; // success
      } catch (err) {
        if (attempt < delays.length) {
          await new Promise(r => setTimeout(r, delays[attempt]));
        } else {
          console.error('[TabStick] Storage write failed after 3 retries:', err);
          throw err; // Let caller handle final failure
        }
      }
    }
  }

  /**
   * Best-effort sync mirror helper for notes mutations.
   * @param {string} key
   * @param {object[]|null} notes — null removes the key
   */
  async function _syncNotesMirror(key, notes) {
    if (!(await getSyncEnabled())) return;
    try {
      if (notes === null) {
        await chrome.storage.sync.remove(key);
      } else {
        await chrome.storage.sync.set({ [key]: notes });
      }
    } catch (err) {
      console.warn('[TabStick] Sync mirror failed:', err);
    }
  }

  /**
   * Fallback sanitizer when IdUtils is not loaded in context.
   * @param {*} raw
   * @returns {object|null}
   */
  function _sanitizeImportedNote(raw) {
    if (globalThis.IdUtils && typeof globalThis.IdUtils.validateNote === 'function') {
      return globalThis.IdUtils.validateNote(raw);
    }
    if (typeof raw !== 'object' || raw === null || !raw.id) return null;
    const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
    const isColorValid = globalThis.ColorThemes && typeof globalThis.ColorThemes.isValid === 'function'
      ? globalThis.ColorThemes.isValid(raw.color)
      : ['sunflower', 'peach', 'mint', 'sky', 'lavender', 'rose', 'slate', 'cream'].includes(raw.color);
    return {
      id:          typeof raw.id          === 'string'  ? raw.id          : `note_${Math.random().toString(16).slice(2, 10)}`,
      x:           Number.isFinite(raw.x)               ? raw.x           : 100,
      y:           Number.isFinite(raw.y)               ? raw.y           : 100,
      width:       Number.isFinite(raw.width)           ? clamp(raw.width, 180, 600) : 240,
      height:      Number.isFinite(raw.height)          ? clamp(raw.height, 120, 500) : 180,
      color:       isColorValid                         ? raw.color       : 'sunflower',
      rotation:    Number.isFinite(raw.rotation)        ? clamp(raw.rotation, -5, 5) : 0,
      title:       typeof raw.title       === 'string'  ? raw.title       : '',
      content:     typeof raw.content     === 'string'  ? raw.content     : '',
      minimized:   typeof raw.minimized   === 'boolean' ? raw.minimized   : false,
      pinned:      typeof raw.pinned      === 'boolean' ? raw.pinned      : false,
      isChecklist: typeof raw.isChecklist === 'boolean' ? raw.isChecklist : false,
      zIndex:      Number.isFinite(raw.zIndex)          ? raw.zIndex      : 0,
      createdAt:   Number.isFinite(raw.createdAt)       ? raw.createdAt   : Date.now(),
      updatedAt:   Number.isFinite(raw.updatedAt)       ? raw.updatedAt   : Date.now(),
    };
  }

  /**
   * Get all non-empty notes data across all URLs.
   * @returns {Promise<object>}
   */
  async function getAllData() {
    try {
      const data = await chrome.storage.local.get(null);
      const notesData = {};
      for (const key in data) {
        if (key.startsWith(NOTES_PREFIX) && Array.isArray(data[key]) && data[key].length > 0) {
          notesData[key] = data[key];
        }
      }
      return notesData;
    } catch (err) {
      console.error('[TabStick] Storage.getAllData failed:', err);
      return {};
    }
  }

  /**
   * Import notes data (full replace per URL, sanitizing entries and writing meta).
   * @param {object} importedData — { "tabstick::notes::url": [...], ... }
   * @returns {Promise<{ urlCount: number, noteCount: number }>}
   */
  async function importData(importedData) {
    if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
      throw new Error('Invalid import data format.');
    }
    const localToSet = {};
    const syncToSet = {};
    let urlCount = 0;
    let noteCount = 0;

    for (const [key, rawList] of Object.entries(importedData)) {
      if (!key.startsWith(NOTES_PREFIX) || !Array.isArray(rawList)) continue;
      const url = key.slice(NOTES_PREFIX.length);
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

      const validNotes = rawList.map(_sanitizeImportedNote).filter(Boolean);
      if (validNotes.length === 0) continue;

      localToSet[notesKey(url)] = validNotes;
      localToSet[metaKey(url)] = { hidden: false, noteCount: validNotes.length };
      syncToSet[notesKey(url)] = validNotes;
      urlCount++;
      noteCount += validNotes.length;
    }

    if (urlCount === 0) {
      throw new Error('No valid notes found in import file.');
    }

    await _retryWrite(localToSet);

    if (await getSyncEnabled()) {
      try {
        await chrome.storage.sync.set(syncToSet);
      } catch (err) {
        console.warn('[TabStick] Sync import mirror failed:', err);
      }
    }

    return { urlCount, noteCount };
  }

  /**
   * Get glass mode setting.
   * @returns {Promise<boolean>}
   */
  async function getGlassMode() {
    try {
      const res = await chrome.storage.local.get(GLASS_KEY);
      return Boolean(res[GLASS_KEY]);
    } catch {
      return false;
    }
  }

  /**
   * Set glass mode setting.
   * @param {boolean} value
   * @returns {Promise<void>}
   */
  async function setGlassMode(value) {
    await _retryWrite({ [GLASS_KEY]: Boolean(value) });
  }

  /**
   * Get sync enabled setting.
   * @returns {Promise<boolean>}
   */
  async function getSyncEnabled() {
    try {
      const res = await chrome.storage.local.get(SYNC_KEY);
      return Boolean(res[SYNC_KEY]);
    } catch {
      return false;
    }
  }

  /**
   * Set sync enabled setting.
   * @param {boolean} value
   * @returns {Promise<void>}
   */
  async function setSyncEnabled(value) {
    await _retryWrite({ [SYNC_KEY]: Boolean(value) });
  }

  return {
    __tabstick: true,
    NOTES_PREFIX,
    META_PREFIX,
    GLASS_KEY,
    SYNC_KEY,
    notesKey,
    metaKey,
    getNotes,
    saveNotes,
    getMeta,
    saveMeta,
    deleteAllForUrl,
    getAllKeys,
    getAllData,
    importData,
    getGlassMode,
    setGlassMode,
    getSyncEnabled,
    setSyncEnabled,
  };
})();
