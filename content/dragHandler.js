/**
 * DragHandler — Mouse-driven drag logic for notes.
 * Spec §9.4 — Cached measurements, viewport clamping, lift/drop animations.
 */
const DragHandler = (function() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Attach drag behavior to a note's header.
   * @param {HTMLElement} host — shadow DOM host element
   * @param {ShadowRoot} shadow — shadow root
   * @param {object} note — note data object (mutated in place)
   * @param {function} onUpdate — called with { x, y } after drag ends
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

      host.style.willChange = 'transform';
      _applyDragLift(host, note);
      document.body.classList.add('ts-dragging');

      function onMove(e) {
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;
        const newX = _clamp(startNoteX + dx, 0, window.innerWidth - note.width);
        const newY = _clamp(startNoteY + dy, 0, window.innerHeight - 36);
        host.style.left = `${newX}px`;
        host.style.top  = `${newY}px`;
        note.x = newX;
        note.y = newY;
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
        host.style.willChange = '';
        _applyDragDrop(host, note);
        document.body.classList.remove('ts-dragging');
        onUpdate({ x: note.x, y: note.y });
      }

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    });
  }

  /**
   * Apply drag lift styles — scale 1.03, elevated shadow.
   * Spec §4.5
   */
  function _applyDragLift(host, note) {
    if (reducedMotion) return;
    host.style.transition = 'box-shadow 120ms ease, transform 120ms ease';
    host.style.transform = `rotate(${note.rotation}deg) scale(1.03)`;
    host.style.boxShadow = `
      0 4px 8px rgba(0,0,0,0.12),
      0 16px 32px rgba(0,0,0,0.18),
      0 32px 64px rgba(0,0,0,0.12)
    `;
  }

  /**
   * Apply drag drop styles — scale 1.0, resting shadow.
   * Spec §4.6
   */
  function _applyDragDrop(host, note) {
    if (reducedMotion) {
      host.style.transform = `rotate(${note.rotation}deg)`;
      return;
    }
    host.style.transition = 'box-shadow 200ms cubic-bezier(0.34, 1.1, 0.64, 1), transform 200ms cubic-bezier(0.34, 1.1, 0.64, 1)';
    host.style.transform = `rotate(${note.rotation}deg) scale(1.0)`;
    host.style.boxShadow = `
      0 1px 2px rgba(0,0,0,0.07),
      0 4px 8px rgba(0,0,0,0.10),
      0 12px 24px rgba(0,0,0,0.08),
      0 1px 0 rgba(255,255,255,0.55) inset
    `;
    // Clear transition after it completes
    setTimeout(() => {
      if (host.isConnected) {
        host.style.transition = '';
      }
    }, 250);
  }

  function _clamp(val, min, max) {
    return Math.max(min, Math.min(val, max));
  }

  return { attachDrag };
})();
