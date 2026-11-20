/**
 * ResizeHandler — Mouse-driven resize logic for notes.
 * Spec §9.5 — Min 180×120, max 600×500. Bottom-right handle.
 */
const ResizeHandler = (function() {
  /**
   * Attach resize behavior to a note's resize handle.
   * @param {HTMLElement} host — shadow DOM host element
   * @param {ShadowRoot} shadow — shadow root
   * @param {object} note — note data object (mutated in place)
   * @param {function} onUpdate — called with { width, height } after resize ends
   */
  function attachResize(host, shadow, note, onUpdate) {
    const resizeHandle = shadow.querySelector('.ts-resize-handle');
    if (!resizeHandle) return;

    resizeHandle.addEventListener('mousedown', (e) => {
      // Don't resize if pinned
      if (note.pinned) return;
      // Left click only
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      // Cache values before resize starts
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = note.width;
      const startH = note.height;

      document.body.classList.add('ts-resizing');

      function onMove(e) {
        const newW = _clamp(startW + (e.clientX - startX), 180, 600);
        const newH = _clamp(startH + (e.clientY - startY), 120, 500);
        host.style.width  = `${newW}px`;
        host.style.height = `${newH}px`;
        note.width  = newW;
        note.height = newH;
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
        document.body.classList.remove('ts-resizing');
        onUpdate({ width: note.width, height: note.height });
      }

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    });
  }

  function _clamp(val, min, max) {
    return Math.max(min, Math.min(val, max));
  }

  return { attachResize };
})();
