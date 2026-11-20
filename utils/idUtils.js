/**
 * ID Utilities — Note ID generation, default note factory, and validation.
 * Spec §8.7, §8.8, §14.6
 */
const IdUtils = (function() {
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

  /**
   * Validate and sanitize a note object loaded from storage.
   * Returns null if the object is fundamentally invalid.
   * Spec §14.6
   * @param {*} raw
   * @returns {object|null}
   */
  function validateNote(raw) {
    if (typeof raw !== 'object' || raw === null || !raw.id) return null;
    return {
      id:          typeof raw.id          === 'string'  ? raw.id          : generateNoteId(),
      x:           typeof raw.x           === 'number'  ? raw.x           : 100,
      y:           typeof raw.y           === 'number'  ? raw.y           : 100,
      width:       typeof raw.width       === 'number'  ? raw.width       : 240,
      height:      typeof raw.height      === 'number'  ? raw.height      : 180,
      color:       ColorThemes.isValid(raw.color)        ? raw.color       : 'sunflower',
      rotation:    typeof raw.rotation    === 'number'  ? raw.rotation    : 0,
      title:       typeof raw.title       === 'string'  ? raw.title       : '',
      content:     typeof raw.content     === 'string'  ? raw.content     : '',
      minimized:   typeof raw.minimized   === 'boolean' ? raw.minimized   : false,
      pinned:      typeof raw.pinned      === 'boolean' ? raw.pinned      : false,
      isChecklist: typeof raw.isChecklist === 'boolean' ? raw.isChecklist : false,
      zIndex:      typeof raw.zIndex      === 'number'  ? raw.zIndex      : 0,
      createdAt:   typeof raw.createdAt   === 'number'  ? raw.createdAt   : Date.now(),
      updatedAt:   typeof raw.updatedAt   === 'number'  ? raw.updatedAt   : Date.now(),
    };
  }

  /**
   * Clamp a note's position to the viewport. Ensures at least the header is visible.
   * Spec §14.2
   * @param {object} note
   * @returns {object}
   */
  function clampNotePosition(note) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      ...note,
      x: Math.max(0, Math.min(note.x, vw - note.width)),
      y: Math.max(0, Math.min(note.y, vh - 36)),
    };
  }

  return {
    generateNoteId,
    createDefaultNote,
    validateNote,
    clampNotePosition,
  };
})();
