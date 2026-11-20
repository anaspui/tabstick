/**
 * ColorThemes — Single source of truth for all note color data.
 * Used by both content scripts and popup.
 * Spec §3.2 — 8 color themes with full palette.
 */
var ColorThemes = (globalThis.ColorThemes && globalThis.ColorThemes.__tabstick) ? globalThis.ColorThemes : (function() {
  const themes = {
    sunflower: { bg: '#FFF9C4', headerBg: '#F9A825', headerText: '#4E3200', bodyText: '#3E2800' },
    peach:     { bg: '#FFE0B2', headerBg: '#F4511E', headerText: '#FFFFFF', bodyText: '#3E1500' },
    mint:      { bg: '#DCEDC8', headerBg: '#558B2F', headerText: '#FFFFFF', bodyText: '#1B3A00' },
    sky:       { bg: '#E1F5FE', headerBg: '#0277BD', headerText: '#FFFFFF', bodyText: '#01233F' },
    lavender:  { bg: '#EDE7F6', headerBg: '#6A1B9A', headerText: '#FFFFFF', bodyText: '#2A0A40' },
    rose:      { bg: '#FCE4EC', headerBg: '#C2185B', headerText: '#FFFFFF', bodyText: '#40001E' },
    slate:     { bg: '#ECEFF1', headerBg: '#455A64', headerText: '#FFFFFF', bodyText: '#1A2B33' },
    cream:     { bg: '#FFFDE7', headerBg: '#F0EAD0', headerText: '#5D4037', bodyText: '#3E2723' },
  };

  // Cycling order per spec §3.2
  const order = ['sunflower', 'peach', 'mint', 'sky', 'lavender', 'rose', 'slate', 'cream'];

  /**
   * Returns the next color key in the cycling order.
   * @param {string} current — current color key
   * @returns {string}
   */
  function nextColor(current) {
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
  }

  /**
   * Returns a random color key from the palette.
   * @returns {string}
   */
  function randomColor() {
    return order[Math.floor(Math.random() * order.length)];
  }

  /**
   * Get full theme object for a color key.
   * Falls back to sunflower if key is invalid.
   * @param {string} key
   * @returns {{ bg: string, headerBg: string, headerText: string, bodyText: string }}
   */
  function getTheme(key) {
    return themes[key] || themes.sunflower;
  }

  /**
   * Get scrollbar thumb color for a theme (headerBg at 40% opacity).
   * @param {string} key
   * @returns {string}
   */
  function getScrollbarColor(key) {
    const t = getTheme(key);
    return hexToRgba(t.headerBg, 0.4);
  }

  /**
   * Get translucent colors for liquid glass mode.
   * @param {string} key
   * @returns {{ bg: string, headerBg: string }}
   */
  function getGlassColors(key) {
    const t = getTheme(key);
    return {
      bg: hexToRgba(t.bg, 0.54),
      headerBg: hexToRgba(t.headerBg, 0.72),
    };
  }

  /**
   * Check if a color key is valid.
   * @param {string} key
   * @returns {boolean}
   */
  function isValid(key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(themes, key);
  }

  /**
   * Convert hex color to rgba string.
   * @param {string} hex
   * @param {number} alpha
   * @returns {string}
   */
  function hexToRgba(hex, alpha) {
    const clean = typeof hex === 'string' ? hex.replace('#', '').trim() : '';
    const validHex = /^[0-9a-fA-F]{6}$/.test(clean)
      ? clean
      : themes.sunflower.bg.replace('#', '');
    const r = parseInt(validHex.substring(0, 2), 16);
    const g = parseInt(validHex.substring(2, 4), 16);
    const b = parseInt(validHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return {
    __tabstick: true,
    themes,
    order,
    nextColor,
    randomColor,
    getTheme,
    getScrollbarColor,
    getGlassColors,
    isValid,
    hexToRgba,
  };
})();
