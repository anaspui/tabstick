/**
 * Storage — chrome.storage.local Promise wrappers.
 * Spec §8.2, §8.6
 * All methods return Promises. Uses tabstick:: prefix.
 */
const Storage = (function() {
  const NOTES_PREFIX = 'tabstick::notes::';
  const META_PREFIX  = 'tabstick::meta::';

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
   * Includes retry with exponential backoff (3 attempts).
   * @param {string} normalizedUrl
   * @param {object[]} notes
   * @returns {Promise<void>}
   */
  async function saveNotes(normalizedUrl, notes) {
    const key = notesKey(normalizedUrl);
    await _retryWrite({ [key]: notes });
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
    try {
      await chrome.storage.local.remove([notesKey(normalizedUrl), metaKey(normalizedUrl)]);
    } catch (err) {
      console.error('[TabStick] Storage.deleteAllForUrl failed:', err);
    }
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
   * Get all notes data across all URLs.
   * @returns {Promise<object>}
   */
  async function getAllData() {
    try {
      const data = await chrome.storage.local.get(null);
      const notesData = {};
      for (const key in data) {
        if (key.startsWith(NOTES_PREFIX)) {
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
   * Import notes data (full replace per URL).
   * @param {object} importedData — { "tabstick::notes::url": [...], ... }
   * @returns {Promise<void>}
   */
  async function importData(importedData) {
    if (typeof importedData !== 'object' || importedData === null) {
      throw new Error("Invalid import data format.");
    }
    const validData = {};
    for (const key in importedData) {
      if (key.startsWith(NOTES_PREFIX) && Array.isArray(importedData[key])) {
        validData[key] = importedData[key];
      }
    }
    await chrome.storage.local.set(validData);
  }

  /**
   * Get glass mode setting.
   * @returns {Promise<boolean>}
   */
  async function getGlassMode() {
    try {
      const res = await chrome.storage.local.get('setting::glassMode');
      return res['setting::glassMode'] || false;
    } catch { return false; }
  }

  /**
   * Set glass mode setting.
   * @param {boolean} value
   * @returns {Promise<void>}
   */
  async function setGlassMode(value) {
    await chrome.storage.local.set({ 'setting::glassMode': value });
  }

  return {
    NOTES_PREFIX,
    META_PREFIX,
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
  };
})();
