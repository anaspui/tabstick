/**
 * DragHandler — Mouse-driven drag logic for notes.
 * Spec §9.4 — Cached measurements, viewport clamping, lift/drop animations.
 */
var DragHandler = (globalThis.DragHandler && globalThis.DragHandler.__tabstick) ? globalThis.DragHandler : (function() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Attach drag behavior to a note's header.
   * @param {HTMLElement} host — shadow DOM host element
   * @param {ShadowRoot} shadow — shadow root
   * @param {object} note — note data object (mutated in place)
   * @param {function} onUpdate — called with { x, y } after drag ends if moved
   */
  function attachDrag(host, shadow, note, onUpdate) {
    const headerEl = shadow.querySelector('.ts-header');
    if (!headerEl) return;

    headerEl.addEventListener('mousedown', (e) => {
      // Don't drag if pinned
      if (note.pinned) return;
      // Left click only
      if (e.button !== 0) return;
      // Don't drag from buttons or color dot
      if (e.target.closest('button') || e.target.closest('.ts-color-dot')) return;

      e.preventDefault();

      // Cache values before drag starts (no layout reads during drag)
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startNoteX  = note.x;
      const startNoteY  = note.y;
      const maxX = Math.max(0, window.innerWidth - note.width);
      const maxY = Math.max(0, window.innerHeight - 36);

      _applyDragLift(host, note);
      document.body?.classList.add('ts-dragging');

      function onMove(ev) {
        const dx = ev.clientX - startMouseX;
        const dy = ev.clientY - startMouseY;
        const newX = _clamp(startNoteX + dx, 0, maxX);
        const newY = _clamp(startNoteY + dy, 0, maxY);
        host.style.left = `${newX}px`;
        host.style.top  = `${newY}px`;
        note.x = newX;
        note.y = newY;
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
        window.removeEventListener('blur', onUp);
        _applyDragDrop(host, note);
        document.body?.classList.remove('ts-dragging');
        if (note.x !== startNoteX || note.y !== startNoteY) {
          onUpdate({ x: note.x, y: note.y });
        }
      }

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
      window.addEventListener('blur', onUp);
    });
  }

  /**
   * Apply drag lift styles — scale 1.03, elevated shadow via CSS class.
   */
  function _applyDragLift(host, note) {
    host.classList.add('ts-lifting');
    if (reducedMotion) return;
    host.style.transform = `rotate(${note.rotation}deg) scale(1.03)`;
  }

  /**
   * Apply drag drop styles — scale 1.0, resting shadow via CSS class.
   */
  function _applyDragDrop(host, note) {
    host.classList.remove('ts-lifting');
    host.style.transform = reducedMotion
      ? `rotate(${note.rotation}deg)`
      : `rotate(${note.rotation}deg) scale(1.0)`;
  }

  function _clamp(val, min, max) {
    return Math.max(min, Math.min(val, max));
  }

  return { __tabstick: true, attachDrag };
})();
