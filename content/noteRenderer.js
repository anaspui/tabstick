/**
 * NoteRenderer — Shadow DOM construction for sticky notes.
 * Builds complete note HTML with SVG grain filter, header, title input,
 * body (textarea + checklist), timestamps, resize handle, and liquid glass mode.
 */
var NoteRenderer = (globalThis.NoteRenderer && globalThis.NoteRenderer.__tabstick) ? globalThis.NoteRenderer : (function() {
  const Z_INDEX_BASE = 2147400000;

  // SVG icons
  const CHECKLIST_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
  const EYE_OPEN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const EYE_CLOSED_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
  const PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"/><path d="M5 17h14"/><path d="M7 11l-2 6h14l-2-6"/></svg>`;
  const PIN_FILLED_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"/><path d="M5 17h14"/><path d="M7 11l-2 6h14l-2-6"/></svg>`;

  function _buildShadowCSS() {
    return `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :host {
          font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
          font-size: initial; line-height: initial; letter-spacing: initial;
          text-transform: none; text-decoration: none; text-align: left;
          display: block;
          border-radius: 10px;
          overflow: hidden;
          border: none;
          box-shadow:
            0 1px 2px rgba(0,0,0,0.07),
            0 4px 8px rgba(0,0,0,0.10),
            0 12px 24px rgba(0,0,0,0.08),
            0 1px 0 rgba(255,255,255,0.55) inset;
          transition: box-shadow 200ms ease, transform 200ms ease;
        }
        :host(.ts-focused) {
          box-shadow:
            0 2px 4px rgba(0,0,0,0.10),
            0 8px 16px rgba(0,0,0,0.15),
            0 20px 40px rgba(0,0,0,0.10),
            0 1px 0 rgba(255,255,255,0.55) inset;
        }
        :host(.ts-lifting) {
          transition: box-shadow 120ms ease, transform 120ms ease;
          box-shadow:
            0 4px 8px rgba(0,0,0,0.12),
            0 16px 32px rgba(0,0,0,0.18),
            0 32px 64px rgba(0,0,0,0.12);
        }
        @media (prefers-reduced-motion: reduce) {
          :host, :host(.ts-lifting) { transition: none; }
        }

        .ts-note {
          width: 100%; height: 100%;
          display: flex; flex-direction: column;
          border-radius: 10px; overflow: hidden; position: relative;
          background: var(--ts-bg);
          color: var(--ts-body-text);
        }

        /* ── Header (36px) ── */
        .ts-header {
          height: 36px; min-height: 36px;
          display: flex; align-items: center;
          padding: 0 8px;
          background: var(--ts-header-bg); color: var(--ts-header-text);
          cursor: grab; user-select: none;
          border-radius: 10px 10px 0 0;
          transition: background-color 250ms ease, color 250ms ease;
          gap: 2px;
        }
        .ts-header.ts-locked {
          cursor: default;
          border-bottom: 2px dashed rgba(255,255,255,0.45);
        }

        .ts-drag-glyph { font-size: 14px; opacity: 0.5; margin-right: 4px; pointer-events: none; line-height: 1; }

        .ts-color-dot {
          width: 12px; height: 12px; border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,0.7);
          background: var(--ts-header-bg);
          cursor: pointer; flex-shrink: 0;
          transition: background-color 250ms ease;
        }
        .ts-color-dot:hover { opacity: 0.8; }
        .ts-color-dot:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

        .ts-header-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px; font-weight: 500;
          color: var(--ts-header-text); opacity: 0.8;
          margin-left: 6px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 100px; display: none;
          pointer-events: none;
        }

        .ts-header-spacer { flex: 1; min-width: 0; }

        .ts-btn {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          background: none; border: none;
          color: var(--ts-header-text);
          cursor: pointer; border-radius: 4px;
          font-size: 14px; line-height: 1;
          opacity: 0.7;
          transition: opacity 150ms ease, background-color 150ms ease;
          flex-shrink: 0; padding: 0;
        }
        .ts-btn:hover { opacity: 1; background: rgba(0,0,0,0.12); }
        .ts-btn.ts-active { opacity: 1; background: rgba(0,0,0,0.18); }
        .ts-btn:focus-visible { outline: 2px solid #fff; outline-offset: 1px; opacity: 1; }
        .ts-btn svg { width: 14px; height: 14px; }

        /* ── Body area ── */
        .ts-body-area {
          flex: 1; display: flex; flex-direction: column;
          background: var(--ts-bg); overflow: hidden;
          transition: background-color 250ms ease;
          position: relative;
        }

        .ts-body-bg {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: var(--ts-bg);
          filter: url(#ts-grain);
          opacity: 0.045; mix-blend-mode: multiply;
          pointer-events: none;
          transition: background-color 250ms ease;
        }

        /* ── Title input ── */
        .ts-title-input {
          width: 100%; border: none; background: transparent;
          font-family: 'Caveat', cursive, sans-serif;
          font-weight: 600; font-size: 20px;
          color: var(--ts-body-text);
          padding: 8px 12px 0 12px;
          outline: none; box-sizing: border-box;
          flex-shrink: 0;
          transition: color 250ms ease;
        }
        .ts-title-input::placeholder { color: var(--ts-body-text); opacity: 0.35; }
        .ts-title-input[readonly] { opacity: 0.85; cursor: default; }

        /* ── Content area ── */
        .ts-body-content {
          flex: 1; position: relative; overflow: hidden;
        }

        .ts-textarea {
          position: absolute; top: 0; left: 0;
          width: 100%; height: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          background: transparent; border: none; outline: none; resize: none;
          font-family: 'Caveat', cursive, sans-serif;
          font-size: 16px; font-weight: 400;
          line-height: 1.65; letter-spacing: 0.01em;
          color: var(--ts-body-text);
          transition: color 250ms ease;
        }
        .ts-textarea::placeholder { color: var(--ts-body-text); opacity: 0.45; }
        .ts-textarea::-webkit-scrollbar { width: 3px; }
        .ts-textarea::-webkit-scrollbar-track { background: transparent; }
        .ts-textarea::-webkit-scrollbar-thumb { background: var(--ts-scrollbar); border-radius: 3px; }
        .ts-textarea.ts-readonly { pointer-events: none; user-select: none; opacity: 0.85; }

        /* ── Checklist ── */
        .ts-checklist {
          position: absolute; top: 0; left: 0;
          width: 100%; height: 100%;
          box-sizing: border-box;
          padding: 12px; padding-bottom: 24px;
          overflow-y: auto;
          font-family: 'Caveat', cursive, sans-serif;
          font-size: 20px; color: var(--ts-body-text);
          display: none; flex-direction: column; gap: 4px;
        }
        .ts-checklist::-webkit-scrollbar { width: 3px; }
        .ts-checklist::-webkit-scrollbar-thumb { background: var(--ts-scrollbar); border-radius: 3px; }
        .ts-checklist-item { display: flex; align-items: flex-start; gap: 8px; }
        .ts-checklist-item input[type="checkbox"] {
          width: 18px; height: 18px; cursor: pointer; margin-top: 6px;
          accent-color: var(--ts-header-bg);
        }
        .ts-checklist-item input[type="checkbox"]:disabled { cursor: default; opacity: 0.7; }
        .ts-checklist-text {
          flex: 1; background: transparent; border: none; outline: none;
          font-family: inherit; font-size: inherit; color: inherit;
          line-height: 1.4; min-width: 0; word-wrap: break-word; white-space: pre-wrap;
        }
        .ts-checklist-item.checked .ts-checklist-text { text-decoration: line-through; opacity: 0.6; }
        .ts-add-item-btn {
          background: transparent; border: none; cursor: pointer;
          font-family: inherit; font-size: 18px;
          color: var(--ts-body-text); opacity: 0.5;
          text-align: left; padding: 4px 0; margin-top: 4px; outline: none;
        }
        .ts-add-item-btn:hover { opacity: 1; }

        /* ── Timestamps ── */
        .ts-timestamps {
          font-size: 11px; color: var(--ts-body-text); opacity: 0.45;
          padding: 4px 12px 6px;
          font-family: 'DM Sans', sans-serif;
          display: flex; gap: 8px; flex-shrink: 0;
          align-items: center;
        }
        .ts-timestamp-text {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
        }
        .ts-saved-indicator {
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 10px; color: var(--ts-body-text);
          opacity: 0; transition: opacity 150ms ease;
          margin-left: auto; flex-shrink: 0;
        }

        /* ── Resize handle ── */
        .ts-resize-handle {
          position: absolute; bottom: 0; right: 0;
          width: 12px; height: 12px; cursor: se-resize; z-index: 1;
        }
        .ts-resize-handle::after {
          content: ''; position: absolute; bottom: 2px; right: 2px;
          width: 0; height: 0; border-style: solid;
          border-width: 0 0 8px 8px;
          border-color: transparent transparent var(--ts-header-bg) transparent;
          opacity: 0.35; transition: opacity 150ms ease;
        }
        .ts-resize-handle:hover::after { opacity: 0.75; }
        .ts-resize-handle.ts-locked { pointer-events: none; opacity: 0.25; }

        /* ── Liquid Glass mode overrides (backdrop-filter on :host avoids Backdrop Root) ── */
        :host(.ts-glass) {
          background: transparent !important;
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.45) !important;
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.65),
            inset 0 -1px 1px rgba(255, 255, 255, 0.15),
            0 8px 32px rgba(0, 0, 0, 0.18) !important;
        }
        :host(.ts-glass.ts-focused) {
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.75),
            inset 0 -1px 1px rgba(255, 255, 255, 0.2),
            0 12px 36px rgba(0, 0, 0, 0.24) !important;
        }
        :host(.ts-glass.ts-lifting) {
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.75),
            inset 0 -1px 1px rgba(255, 255, 255, 0.2),
            0 18px 44px rgba(0, 0, 0, 0.28) !important;
        }
        :host(.ts-glass) .ts-note {
          background: transparent;
          border-radius: 9px;
        }
        :host(.ts-glass) .ts-header {
          background: var(--ts-glass-header-bg);
          border-bottom: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 0;
        }
        :host(.ts-glass) .ts-header.ts-locked {
          border-bottom: 2px dashed rgba(255, 255, 255, 0.55);
        }
        :host(.ts-glass) .ts-body-area {
          background:
            linear-gradient(
              155deg,
              rgba(255, 255, 255, 0.32) 0%,
              rgba(255, 255, 255, 0.06) 48%,
              rgba(255, 255, 255, 0.14) 100%
            ),
            var(--ts-glass-bg);
        }
        :host(.ts-glass) .ts-body-bg { display: none; }
        :host(.ts-glass) .ts-color-dot { border-color: rgba(255, 255, 255, 0.85); }
        :host(.ts-glass) .ts-timestamps { opacity: 0.65; }
      </style>
    `;
  }

  function _buildShadowHTML(note) {
    return `
      <svg width="0" height="0" style="position:absolute;pointer-events:none">
        <filter id="ts-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="4" stitchTiles="stitch" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blend"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="1"/>
          </feComponentTransfer>
        </filter>
      </svg>

      <div class="ts-note">
        <div class="ts-header ${note.pinned ? 'ts-locked' : ''}">
          <span class="ts-drag-glyph">⠿</span>
          <button class="ts-color-dot" tabindex="0" aria-label="Change color. Current: ${note.color}"></button>
          <span class="ts-header-title"></span>
          <div class="ts-header-spacer"></div>
          <button class="ts-btn ts-checklist-btn ${note.isChecklist ? 'ts-active' : ''}" tabindex="0" aria-label="Toggle checklist" aria-pressed="${note.isChecklist ? 'true' : 'false'}">${CHECKLIST_SVG}</button>
          <button class="ts-btn ts-pin-btn" tabindex="0" aria-label="${note.pinned ? 'Unlock note position' : 'Lock note position'}">${note.pinned ? PIN_FILLED_SVG : PIN_SVG}</button>
          <button class="ts-btn ts-min-btn" tabindex="0" aria-label="${note.minimized ? 'Restore note' : 'Minimize note'}">${note.minimized ? EYE_CLOSED_SVG : EYE_OPEN_SVG}</button>
          <button class="ts-btn ts-close-btn" tabindex="0" aria-label="Delete note">✕</button>
        </div>

        <div class="ts-body-area">
          <div class="ts-body-bg"></div>
          <input class="ts-title-input" type="text" placeholder="Untitled" aria-label="Note title" ${note.pinned ? 'readonly' : ''}>
          <div class="ts-body-content">
            <textarea class="ts-textarea ${note.pinned ? 'ts-readonly' : ''}" aria-label="Note content" aria-multiline="true" placeholder="Type your note…" ${note.pinned ? 'readonly' : ''}></textarea>
            <div class="ts-checklist"></div>
          </div>
          <div class="ts-timestamps"><span class="ts-timestamp-text"></span><span class="ts-saved-indicator" aria-live="polite" aria-atomic="true">✓ saved</span></div>
          <div class="ts-resize-handle ${note.pinned ? 'ts-locked' : ''}"></div>
        </div>
      </div>
    `;
  }

  function applyThemeVars(host, colorKey) {
    const theme = ColorThemes.getTheme(colorKey);
    const glass = ColorThemes.getGlassColors(colorKey);
    host.style.setProperty('--ts-bg', theme.bg);
    host.style.setProperty('--ts-header-bg', theme.headerBg);
    host.style.setProperty('--ts-header-text', theme.headerText);
    host.style.setProperty('--ts-body-text', theme.bodyText);
    host.style.setProperty('--ts-scrollbar', ColorThemes.getScrollbarColor(colorKey));
    host.style.setProperty('--ts-glass-bg', glass.bg);
    host.style.setProperty('--ts-glass-header-bg', glass.headerBg);
  }

  function applyGlassMode(host, isGlass) {
    const next = Boolean(isGlass);
    host.classList.toggle('ts-glass', next);
    if (next) {
      host.style.setProperty('backdrop-filter', 'blur(20px) saturate(180%)', 'important');
      host.style.setProperty('-webkit-backdrop-filter', 'blur(20px) saturate(180%)', 'important');
    } else {
      host.style.removeProperty('backdrop-filter');
      host.style.removeProperty('-webkit-backdrop-filter');
    }
    if (host.isConnected) {
      void host.offsetHeight;
    }
  }

  function buildNote(note) {
    const host = document.createElement('tabstick-note');
    host.className = 'ts-host';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Sticky note');
    host.setAttribute('aria-modal', 'false');
    host.dataset.noteId = note.id;

    Object.assign(host.style, {
      position: 'fixed',
      left: `${note.x}px`,
      top: `${note.y}px`,
      width: `${note.width}px`,
      height: note.minimized ? '36px' : `${note.height}px`,
      zIndex: String(Z_INDEX_BASE + note.zIndex),
      transform: `rotate(${note.rotation}deg)`,
      transformOrigin: 'top left',
      pointerEvents: 'all',
      minWidth: '180px',
      minHeight: '36px',
      opacity: '1',
    });

    applyThemeVars(host, note.color);

    const shadow = host.attachShadow({ mode: 'open' });
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap';
    shadow.appendChild(fontLink);

    const template = document.createElement('div');
    template.innerHTML = _buildShadowCSS() + _buildShadowHTML(note);
    while (template.firstChild) {
      shadow.appendChild(template.firstChild);
    }

    // Set content safely
    const textarea = shadow.querySelector('.ts-textarea');
    if (textarea) textarea.value = note.content || '';
    const titleInput = shadow.querySelector('.ts-title-input');
    if (titleInput) titleInput.value = note.title || '';

    // Minimized state
    if (note.minimized) {
      const bodyArea = shadow.querySelector('.ts-body-area');
      if (bodyArea) {
        bodyArea.style.display = 'none';
        bodyArea.style.opacity = '0';
      }
      const headerTitle = shadow.querySelector('.ts-header-title');
      if (headerTitle) {
        headerTitle.style.display = 'inline-block';
        headerTitle.textContent = note.title || (note.content || '').substring(0, 30) || 'Note';
      }
    }

    return { host, shadow };
  }

  return {
    __tabstick: true,
    Z_INDEX_BASE,
    buildNote,
    applyThemeVars,
    applyGlassMode,
    CHECKLIST_SVG,
    EYE_OPEN_SVG,
    EYE_CLOSED_SVG,
    PIN_SVG,
    PIN_FILLED_SVG,
  };
})();
