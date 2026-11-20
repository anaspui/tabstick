/**
 * ID Utilities — Note ID generation, default note factory, and validation.
 * Spec §8.7, §8.8, §14.6
 */
var IdUtils = (globalThis.IdUtils && globalThis.IdUtils.__tabstick) ? globalThis.IdUtils : (function() {
  /**
   * Generate a unique note ID: "note_" + 8 random hex chars.
   * @returns {string}
   */
  function generateNoteId() {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `note_${hex}`;
  }

  /**
   * Create a default note object at the given spawn position.
   * Spec §8.8
   * @param {number} spawnX — px from viewport left
   * @param {number} spawnY — px from viewport top
   * @returns {object}
   */
  function createDefaultNote(spawnX, spawnY) {
    return {
      id:          generateNoteId(),
      x:           Math.round(spawnX),
      y:           Math.round(spawnY),
      width:       240,
      height:      180,
      color:       ColorThemes.randomColor(),
      rotation:    parseFloat((Math.random() * 4 - 2).toFixed(2)),
      title:       '',
      content:     '',
      minimized:   false,
      pinned:      false,
      isChecklist: false,
      zIndex:      0,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    };
  }

  function _clamp(val, min, max) {
    return Math.max(min, Math.min(val, max));
  }

  /**
   * Validate and sanitize a note object loaded from storage.
   * Returns null if the object is fundamentally invalid.
   * Spec §14.6
   * @param {*} raw
   * @returns {object|null}
   */
  function validateNote(raw) {
    if (typeof raw !== 'object' || raw === null || !raw.id) return null;
    const width = Number.isFinite(raw.width) ? _clamp(raw.width, 180, 600) : 240;
    const height = Number.isFinite(raw.height) ? _clamp(raw.height, 120, 500) : 180;
    const rotation = Number.isFinite(raw.rotation) ? _clamp(raw.rotation, -5, 5) : 0;
    return {
      id:          typeof raw.id          === 'string'  ? raw.id          : generateNoteId(),
      x:           Number.isFinite(raw.x)               ? raw.x           : 100,
      y:           Number.isFinite(raw.y)               ? raw.y           : 100,
      width,
      height,
      color:       ColorThemes.isValid(raw.color)        ? raw.color       : 'sunflower',
      rotation,
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
   * Clamp a note's position to the viewport. Ensures at least the header is visible.
   * Spec §14.2
   * @param {object} note
   * @returns {object}
   */
  function clampNotePosition(note) {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    const maxX = Math.max(0, vw - note.width);
    const maxY = Math.max(0, vh - 36);
    return {
      ...note,
      x: _clamp(note.x, 0, maxX),
      y: _clamp(note.y, 0, maxY),
    };
  }

  return {
    __tabstick: true,
    generateNoteId,
    createDefaultNote,
    validateNote,
    clampNotePosition,
  };
})();
