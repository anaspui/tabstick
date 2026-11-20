/**
 * ToastManager — Undo toast for note deletion.
 * Spec §4.9 — Slide-up animation, 4-second timer with progress bar, undo callback.
 */
const ToastManager = (function() {
  let currentToast = null;
  let currentTimer = null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Show an undo toast for a deleted note.
   * @param {object} noteSnapshot — full note object snapshot
   * @param {function} undoCallback — called if user clicks Undo
   * @param {function} confirmCallback — called after 4s if no undo
   */
  function show(noteSnapshot, undoCallback, confirmCallback) {
    // Dismiss any existing toast
    dismiss(true);

    const toast = document.createElement('div');
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) ${reducedMotion ? '' : 'translateY(80px)'};
      z-index: 2147483647;
      background: #323232;
      color: #fff;
      font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      padding: 12px 20px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 16px;
      opacity: ${reducedMotion ? '1' : '0'};
      pointer-events: all;
      user-select: none;
      overflow: hidden;
    `;

    const textSpan = document.createElement('span');
    textSpan.textContent = 'Note deleted';
    textSpan.style.cssText = 'white-space: nowrap;';

    const dot = document.createElement('span');
    dot.textContent = '·';
    dot.style.cssText = 'opacity: 0.5;';

    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo';
    undoBtn.style.cssText = `
      background: none;
      border: none;
      color: #F9A825;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
      text-underline-offset: 2px;
    `;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      width: 100%;
      background: #F9A825;
      border-radius: 0 0 10px 10px;
      transform-origin: left;
    `;

    toast.appendChild(textSpan);
    toast.appendChild(dot);
    toast.appendChild(undoBtn);
    toast.appendChild(progressBar);
    document.body.appendChild(toast);
    currentToast = toast;

    // Appear animation
    if (!reducedMotion) {
      toast.animate([
        { transform: 'translateX(-50%) translateY(80px)', opacity: 0 },
        { transform: 'translateX(-50%) translateY(0)', opacity: 1 },
      ], {
        duration: 300,
        easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)',
        fill: 'forwards',
      });
    }

    // Progress bar animation
    if (!reducedMotion) {
      progressBar.animate([
        { transform: 'scaleX(1)' },
        { transform: 'scaleX(0)' },
      ], {
        duration: 4000,
        easing: 'linear',
        fill: 'forwards',
      });
    }

    // Undo handler
    undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(currentTimer);
      dismiss(false);
      undoCallback(noteSnapshot);
    });

    // 4-second timer
    currentTimer = setTimeout(() => {
      dismiss(false);
      confirmCallback(noteSnapshot.id);
    }, 4000);
  }

  /**
   * Dismiss the current toast.
   * @param {boolean} immediate — skip animation
   */
  function dismiss(immediate) {
    if (!currentToast) return;
    clearTimeout(currentTimer);
    const toast = currentToast;
    currentToast = null;
    currentTimer = null;

    if (immediate || reducedMotion) {
      toast.remove();
      return;
    }

    const anim = toast.animate([
      { transform: 'translateX(-50%) translateY(0)', opacity: 1 },
      { transform: 'translateX(-50%) translateY(80px)', opacity: 0 },
    ], {
      duration: 200,
      easing: 'ease-in',
      fill: 'forwards',
    });

    anim.onfinish = () => toast.remove();
  }

  return { show, dismiss };
})();
