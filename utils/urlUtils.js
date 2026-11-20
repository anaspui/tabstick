/**
 * URL Utilities — URL normalization for storage key generation.
 * Spec §8.1
 */
const UrlUtils = (function() {
  /**
   * Normalize a URL to protocol + hostname + pathname.
   * Strips query strings and fragments.
   * Normalizes trailing slash: always strip unless path is just "/".
   * @param {string} rawUrl
   * @returns {string}
   */
  function normalizeUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
      return `${url.protocol}//${url.hostname}${pathname}`;
    } catch {
      // Fallback: use the raw URL as-is if parsing fails.
      return rawUrl;
    }
  }

  /**
   * Check if a URL is accessible for content script injection.
   * @param {string} url
   * @returns {boolean}
   */
  function isAccessibleUrl(url) {
    return typeof url === 'string' &&
      (url.startsWith('http://') || url.startsWith('https://'));
  }

  /**
   * Format URL for display in popup. Middle-truncates if > 42 chars.
   * @param {string} rawUrl
   * @returns {string}
   */
  function formatUrlDisplay(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const display = url.hostname + url.pathname;
      if (display.length <= 42) return display;
      const half = 19;
      return display.slice(0, half) + '…' + display.slice(display.length - half);
    } catch {
      return rawUrl.slice(0, 42);
    }
  }

  return {
    normalizeUrl,
    isAccessibleUrl,
    formatUrlDisplay,
  };
})();
