# TabStick — Chrome Extension
### Complete Product & Engineering Specification v2.0

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Feature Specification](#2-feature-specification)
3. [UI & Visual Design System](#3-ui--visual-design-system)
4. [Animation & Motion](#4-animation--motion)
5. [Extension Popup](#5-extension-popup)
6. [Keyboard Shortcuts & Accessibility](#6-keyboard-shortcuts--accessibility)
7. [Technical Architecture](#7-technical-architecture)
8. [Storage Schema & Data Model](#8-storage-schema--data-model)
9. [Content Script — Full Behavior Spec](#9-content-script--full-behavior-spec)
10. [Popup Script — Full Behavior Spec](#10-popup-script--full-behavior-spec)
11. [Background Service Worker](#11-background-service-worker)
12. [Message Passing Contract](#12-message-passing-contract)
13. [Interactions & Behaviors](#13-interactions--behaviors)
14. [Edge Cases & Defensive Programming](#14-edge-cases--defensive-programming)
15. [Performance Constraints](#15-performance-constraints)
16. [Error Handling](#16-error-handling)
17. [Non-Goals (v1)](#17-non-goals-v1)
18. [v2 Roadmap](#18-v2-roadmap)
19. [Builder Notes & Implementation Rules](#19-builder-notes--implementation-rules)

---

## 1. Product Vision

**TabStick** is a Chrome extension that turns every browser tab into a corkboard. Users can pin one or more sticky notes to any web page — notes are permanently attached to that page's URL, survive browser restarts, and feel like real paper notes: warm, tactile, slightly imperfect, satisfying to use.

The product should feel like physically sticking notes to your monitor. Not a productivity dashboard. Not a to-do app. A simple, beautiful, focused note layer that lives quietly on top of any webpage.

### Design Principles
- **Invisible when not needed.** Notes don't interrupt browsing. They sit wherever placed until wanted.
- **Zero friction.** Creating a note takes one click and zero thought.
- **Permanence by default.** Notes never disappear unless the user explicitly deletes them.
- **Tactile delight.** Every interaction — spawn, drag, type, close — feels satisfying and physical.
- **Respect the page.** Notes never break or permanently obscure critical page elements.

---

## 2. Feature Specification

### 2.1 Per-URL Note Isolation
- Notes are bound to a **normalized URL key** (see §8 for normalization rules).
- The same URL visited in any tab or window shows the same set of notes — notes belong to the page, not the tab instance.
- Different URLs always have completely independent note sets.
- URL normalization strips query strings and fragments by default. `protocol + hostname + pathname` is the key.

### 2.2 Multiple Notes Per Page
- There is no hard cap on notes per page. A soft UI warning appears at 20+ notes: a subtle amber banner inside the popup reads `"You have a lot of notes on this page."` — no notes are blocked.
- Each note is fully independent: its own position, size, color, content, z-index, and collapsed state.
- Notes never auto-arrange or snap to each other — free-form placement only.

### 2.3 Persistent Storage
- All notes stored in `chrome.storage.local`.
- Notes survive: tab close, browser close, system restart, extension reload, and page refresh.
- Notes are re-injected on every `document_idle` from stored data.
- Storage writes are debounced (500ms) and batched per URL key to minimize write frequency.
- On storage write failure, the extension retries up to 3 times with exponential backoff (100ms, 200ms, 400ms), then shows a non-intrusive error indicator inside the affected note.

### 2.4 Note Lifecycle

#### Creation
- Triggered by: popup "+ Add Note" button, or keyboard shortcut `Alt+Shift+S`.
- New note spawns at a **cascading offset** position: the first note on a page appears at viewport center. Each subsequent new note is offset +24px right and +24px down from the previous spawn point, wrapping back to center after 8 notes.
- New note gets a **random color** from the palette (user can change it immediately).
- New note gets a random rotation between −2° and +2°, generated once at creation and permanently stored with the note. This angle never changes.
- The new note's textarea is immediately focused and ready to type.
- Creation plays a spawn animation (see §4.1).

#### Editing
- Single-click inside the note body focuses the textarea.
- Auto-saves on every `input` event, debounced 500ms.
- A tiny `"✓ saved"` indicator appears in the note footer and fades out after 1.5 seconds after each successful save.
- Placeholder text: `"Type your note…"` — hidden as soon as the user starts typing, restores only when the note is empty AND unfocused.

#### Deletion
- Click the `✕` button in the note header.
- No confirmation dialog. Instead: a **brief undo toast** appears at the bottom-center of the viewport: `"Note deleted  ·  Undo"` with a shrinking progress bar.
- Clicking "Undo" within 4 seconds restores the note exactly (position, size, color, content, rotation).
- After 4 seconds with no undo, deletion is permanent and storage is updated.
- Deletion plays an exit animation (see §4.2).

#### Minimizing / Collapsing
- Click the `─` button to collapse the note to just its header bar.
- Collapsed height: exactly 36px. Width and position are preserved.
- The `─` icon becomes `□` when minimized. Re-clicking restores with a smooth spring animation.
- Minimized state persists to storage.

#### Pinning / Locking
- The pin icon in the header toggles **locked mode**.
- Locked notes cannot be dragged, cannot be resized, and the textarea is read-only (`readonly` attribute).
- Locked notes display a subtle dashed outline on the header's bottom edge to signal the locked state.
- Locked/unlocked state persists to storage.
- This prevents accidental movement or editing of important notes.

### 2.5 Visibility Toggle
- The popup has a "Hide All" / "Show All" toggle for the current page.
- When hidden: all notes are `visibility: hidden; pointer-events: none` — they are NOT removed from DOM, so they reappear instantly.
- Visibility state is persisted per URL in the URL's metadata object.
- The toolbar badge color changes: orange when visible with notes, grey when hidden.

---

## 3. UI & Visual Design System

### 3.1 Aesthetic Direction

**Warm paper realism with modern restraint.** Sticky notes that exist in the real world but were designed with a great eye. Not skeuomorphic to the point of being tacky — just enough texture, shadow, and imperfection to feel physical. The note body has a barely-perceptible paper grain texture (SVG noise filter, not a bitmap, so it's crisp at all resolutions). Notes cast soft, multi-layered shadows. Colors are warm and saturated but never garish.

Every note is slightly rotated at a unique fixed angle — random between −2° and +2°, generated once at creation and stored. This "placed by hand" quality is critical to the aesthetic. Do not skip it.

### 3.2 Color Themes

Each note has one of 8 color themes. The user cycles through them by clicking the color dot in the header.

| Theme Name | Body BG     | Header BG   | Header Text | Textarea Text |
|------------|-------------|-------------|-------------|---------------|
| Sunflower  | `#FFF9C4`   | `#F9A825`   | `#4E3200`   | `#3E2800`     |
| Peach      | `#FFE0B2`   | `#F4511E`   | `#FFFFFF`   | `#3E1500`     |
| Mint       | `#DCEDC8`   | `#558B2F`   | `#FFFFFF`   | `#1B3A00`     |
| Sky        | `#E1F5FE`   | `#0277BD`   | `#FFFFFF`   | `#01233F`     |
| Lavender   | `#EDE7F6`   | `#6A1B9A`   | `#FFFFFF`   | `#2A0A40`     |
| Rose       | `#FCE4EC`   | `#C2185B`   | `#FFFFFF`   | `#40001E`     |
| Slate      | `#ECEFF1`   | `#455A64`   | `#FFFFFF`   | `#1A2B33`     |
| Cream      | `#FFFDE7`   | `#F0EAD0`   | `#5D4037`   | `#3E2723`     |

Color cycling order: Sunflower → Peach → Mint → Sky → Lavender → Rose → Slate → Cream → (back to Sunflower).

### 3.3 Typography

**Inside notes (handwriting feel):**
- Font: `'Caveat'` (Google Fonts: `https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&display=swap`)
- Textarea body: `Caveat` 16px, weight 400, line-height 1.65
- Injected inside Shadow DOM via a `<link>` element prepended to the shadow root.

**Extension popup & UI chrome:**
- Font: `'DM Sans'` (Google Fonts: `https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap`)
- Popup body: 13px weight 400. Buttons: 13px weight 600. Toast: 12px weight 500.

**Note header buttons:**
- Use Unicode symbols or inline SVG — never emoji (renders inconsistently cross-OS), never raster images.
- Acceptable symbols: `✕` (close), `─` (minimize), `□` (restore), and SVG for pin and drag affordance.

### 3.4 Note Anatomy — Detailed Specification

```
┌─────────────────────────────────────────────┐   ← Shadow DOM host (position: fixed)
│ ╔═══════════════════════════════════════════╗ │
│ ║  ⠿   ●   ──────────────────  🖈  ─  ✕   ║ │  ← Header (36px)
│ ╚═══════════════════════════════════════════╝ │
│                                               │
│   Type your note…                             │  ← Textarea (flex-grow)
│                                               │
│                                               │
│ ─────────────────────────────────── ✓ saved  │  ← Footer (20px)
└────────────────────────────────────────────╗  │
                                             ╚━━┘  ← Resize handle (12×12px)
```

**Header bar (36px height, full width):**
- Left: `⠿` drag affordance glyph (6-dot braille pattern U+2807, 14px, 50% opacity) + `●` color dot (12px filled circle, color = the theme's Header BG color, bordered with 1.5px white ring, clickable to cycle colors).
- Center: empty flex-grow space — this area is also a valid drag target.
- Right: pin SVG icon + `─` minimize button + `✕` close button. Each is a `28×28px` clickable region (icon visually 14px inside).
- Header background: theme Header BG color.
- Header `border-radius: 10px 10px 0 0`.
- Cursor on header area: `grab`. Changes to `grabbing` on `mousedown` (set on `document.body` via a class, so cursor persists while dragging outside the note).

**Body (flex-grow, fills height between header and footer):**
- Background: theme Body BG color with a subtle SVG noise grain overlay (`opacity: 0.045`, `mix-blend-mode: multiply`).
- Padding: `10px 12px`.
- `<textarea>`: fills 100% of body. `border: none`, `outline: none`, `background: transparent`, `resize: none`, font: Caveat 16px, `line-height: 1.65`, `letter-spacing: 0.01em`, `color`: theme Textarea Text color.
- Scrollbar: custom thin scrollbar — `3px` width, `border-radius: 3px`, thumb color = theme Header BG at 40% opacity, only visible on overflow. Applied via `::-webkit-scrollbar` inside shadow DOM.
- Placeholder color: textarea text color at 45% opacity.

**Footer bar (20px height):**
- Background: body BG with an 8% black overlay (`rgba(0,0,0,0.08)`).
- Right-aligned: `✓ saved` in 10px DM Sans, normally invisible (`opacity: 0`), animates in/out on save (see §4.8).
- Padding: `0 8px`.
- `border-radius: 0 0 10px 10px`.

**Resize handle:**
- Positioned at bottom-right corner, `12×12px`.
- Rendered as a CSS triangle (bottom-right oriented) using `border` trick, or inline SVG.
- Color: theme Header BG at 35% opacity. Hover: 75% opacity. Transition: `opacity 150ms ease`.
- Cursor: `se-resize`.

**Host element:**
- `position: fixed`
- `z-index: 2147483640 + note.zIndex` (max safe z-index with headroom for TabStick's own overlays)
- `border-radius: 10px`
- `transform: rotate(Xdeg)` where X is the stored rotation value
- `transform-origin: top left`
- Multi-layer box-shadow (resting state):
  ```css
  box-shadow:
    0 1px 2px rgba(0,0,0,0.07),
    0 4px 8px rgba(0,0,0,0.10),
    0 12px 24px rgba(0,0,0,0.08),
    0 1px 0 rgba(255,255,255,0.55) inset;
  ```
- `min-width: 180px`, `min-height: 120px`
- `default width: 240px`, `default height: 180px`
- `max-width: 600px`, `max-height: 500px`
- `overflow: hidden` — keeps grain texture and content inside rounded corners
- `will-change: transform` — applied ONLY during active drag, removed on mouseup

**Focused state (textarea active):**
```css
box-shadow:
  0 2px 4px rgba(0,0,0,0.10),
  0 8px 16px rgba(0,0,0,0.15),
  0 20px 40px rgba(0,0,0,0.10),
  0 1px 0 rgba(255,255,255,0.55) inset;
transform: rotate(Xdeg) scale(1.015);
transition: box-shadow 200ms ease, transform 200ms ease;
```

**Locked state:**
- Header bottom border: `2px dashed rgba(255,255,255,0.45)`.
- Textarea: `pointer-events: none; user-select: none; opacity: 0.85`.
- Resize handle: `pointer-events: none; opacity: 0.25`.
- Drag cursor does not apply to the header.

### 3.5 Paper Grain Texture

Define this SVG filter inside the Shadow DOM (before the note HTML, in a hidden SVG):

```html
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
```

Apply `filter: url(#ts-grain)` to the body background layer ONLY — not to the textarea element itself (text would appear blurry). Achieve this by having a separate absolute-positioned `div.ts-body-bg` behind the textarea, and applying the grain filter to that div.

### 3.6 CSS Custom Properties Architecture

All theme values are driven by CSS custom properties on the shadow `:host`. When the user changes color, only these vars are updated — no DOM rebuild.

```css
/* Applied via host.style.setProperty() when theme changes */
:host {
  --ts-bg:          #FFF9C4;
  --ts-header-bg:   #F9A825;
  --ts-header-text: #4E3200;
  --ts-body-text:   #3E2800;
  --ts-scrollbar:   rgba(249, 168, 37, 0.4);
}
```

All inner elements reference only these vars. Color transitions work automatically by adding `transition: background-color 250ms ease, color 250ms ease` to the relevant elements.

### 3.7 Toolbar Icon Badge
- **No notes on page**: badge cleared (`chrome.action.setBadgeText({ text: '' })`).
- **Notes present, visible**: orange badge, text = count (capped at `"9+"`). Background: `#F9A825`, text color: `#000000`.
- **Notes present, hidden**: grey badge, same count. Background: `#90A4AE`, text color: `#FFFFFF`.
- Badge is updated by the background service worker on storage changes and on tab activation/navigation.

---

## 4. Animation & Motion

All animations use CSS transitions or the Web Animations API (WAAPI). No `requestAnimationFrame` animation loops. All animation code must check `prefers-reduced-motion` — if the user has reduced motion enabled, skip all transitions and animations (instant state changes only).

```js
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

### 4.1 Note Spawn
```
Start:  opacity: 0, transform: rotate(Xdeg) scale(0.85) translateY(10px)
End:    opacity: 1, transform: rotate(Xdeg) scale(1.0)  translateY(0)
Duration: 280ms
Easing:   cubic-bezier(0.34, 1.56, 0.64, 1)   ← spring overshoot
```

### 4.2 Note Delete
```
Start:  opacity: 1, transform: rotate(Xdeg) scale(1.0)
End:    opacity: 0, transform: rotate(Xdeg) scale(0.88) translateY(-8px)
Duration: 200ms
Easing:   ease-in
After:    remove from DOM
```

### 4.3 Minimize (collapse)
```
Body:   opacity 1→0, duration 100ms ease-out (fade first)
Height: current→36px, duration 220ms ease-out (starts after 80ms delay)
```

### 4.4 Restore (expand from minimized)
```
Height: 36px→stored height, duration 250ms cubic-bezier(0.34, 1.2, 0.64, 1)
Body:   opacity 0→1, duration 150ms ease-in, delay 100ms
```

Drive height animation via a CSS custom property `--ts-h` on the host, using `element.animate()` (WAAPI) to avoid the need for fixed `height` transitions on the host itself.

### 4.5 Drag Lift (on mousedown)
```
transform: rotate(Xdeg) scale(1.03)
box-shadow: (elevated — see §3.4 focused state, further amplified)
  0 4px 8px rgba(0,0,0,0.12),
  0 16px 32px rgba(0,0,0,0.18),
  0 32px 64px rgba(0,0,0,0.12)
Duration: 120ms ease
```

### 4.6 Drag Drop (on mouseup)
```
transform: rotate(Xdeg) scale(1.0)
box-shadow: resting state
Duration: 200ms cubic-bezier(0.34, 1.1, 0.64, 1)
```

### 4.7 Color Change
All color-related CSS custom properties transition automatically:
```css
.ts-header    { transition: background-color 250ms ease, color 250ms ease; }
.ts-body-bg   { transition: background-color 250ms ease; }
.ts-textarea  { transition: color 250ms ease; }
```

### 4.8 "Saved ✓" Indicator
```
Fade in:  opacity 0→0.75, 150ms ease
Hold:     1000ms
Fade out: opacity 0.75→0, 400ms ease
```

### 4.9 Undo Toast
```
Appear:  translateY(80px)→translateY(0), opacity 0→1, 300ms cubic-bezier(0.34, 1.2, 0.64, 1)
Dismiss: translateY(0)→translateY(80px), opacity 1→0, 200ms ease-in
Progress bar: width 100%→0%, linear, over 4000ms
```

### 4.10 Focus Scale
```
On textarea focus: transform rotate(Xdeg) scale(1.0) → scale(1.015)
On blur:           transform rotate(Xdeg) scale(1.015) → scale(1.0)
Duration: 200ms ease. box-shadow also transitions (see §3.4).
```

---

## 5. Popup & Dashboard — Full Specification

TabStick has **two distinct UI surfaces**: the **Toolbar Popup** (quick-access panel, 360px wide) and the **Dashboard** (full-page extension tab, opened from the popup). Together they form a complete note management system. The popup handles per-page actions; the Dashboard handles everything across all pages.

---

### 5.1 Toolbar Popup

The popup opens when the user clicks the TabStick toolbar icon. It is `popup/popup.html`, fixed at **360px wide**, auto height (max 560px with internal scroll).

#### 5.1.1 Popup Layout

```
┌──────────────────────────────────────────────────┐
│  ╔════════════════════════════════════════════╗  │
│  ║  [🗒] TabStick           [⚙ Dashboard ↗]  ║  │  ← Header (52px)
│  ╚════════════════════════════════════════════╝  │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  🌐  reddit.com/r/programming            │   │  ← Page pill
│  │  3 notes on this page                    │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────┐  ┌───────────────────┐    │
│  │  + Add Note      │  │  👁  Hide All     │    │  ← Primary actions
│  └──────────────────┘  └───────────────────┘    │
│                                                  │
│  ─────────────────────────────────────────────  │
│  On this page                          [Sort ▾] │  ← List header
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ ●  Buy milk and eggs tomor…    [📌] [✕]  │   │
│  │ ●  Check PR comments before…  [─]  [✕]  │   │
│  │ ●  (empty note)                     [✕]  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ─────────────────────────────────────────────  │
│  [ 🗑  Clear All on This Page ]                 │  ← Danger zone
│                                                  │
│  ─────────────────────────────────────────────  │
│  12 notes across 4 pages  ·  Open Dashboard ↗   │  ← Footer stats
└──────────────────────────────────────────────────┘
```

#### 5.1.2 Popup Header (52px)

- Left: sticky note inline SVG icon (18px, color `#F9A825`) + `"TabStick"` in DM Sans 700, 15px, color `#2D2D2D`.
- Right: `"Dashboard ↗"` link button — opens the Dashboard in a new tab (`chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') })`), then `window.close()`.
- Background: linear gradient `135deg, #FFF9C4 0%, #FFFDE7 100%`.
- Bottom border: `1px solid #E8E0B0`.
- Padding: `0 16px`.

#### 5.1.3 Current Page Pill

A rounded card showing the current page context:

- Background: `#FFFFFF`. Border: `1px solid #EEEEEE`. Border-radius: `10px`. Padding: `10px 14px`. Margin: `12px 16px 8px`.
- Left icon: 🌐 globe SVG (14px, `#9E9E9E`).
- URL text: `hostname + pathname` only, max 38 chars, middle-ellipsis truncated. Font: DM Sans 500, 13px, `#424242`.
- Below URL: note count in DM Sans 400, 12px, `#9E9E9E`: `"No notes yet"` / `"1 note"` / `"N notes"`.
- **Inaccessible page state**: pill background `#FFF8E1`, border `#FFE082`, icon becomes ⚠ in `#F57C00`. Text: `"Notes unavailable on this page"` in 12px `#E65100`. All action buttons below are disabled and dimmed.

#### 5.1.4 Primary Action Buttons

Two buttons side by side, margin `0 16px 12px`, gap `8px`:

**"+ Add Note" (primary, left):**
- Background: `#F9A825`. Text: `#3E2800`. Font: DM Sans 600, 13px.
- Border-radius: `9px`. Height: `38px`. Width: `calc(50% - 4px)`.
- Left icon: `+` SVG (14px).
- Hover: `background: #F0A000`. Active: `background: #E09000`. Transition: `background 120ms ease`.
- On click: sends `CREATE_NOTE` → `window.close()`.
- Disabled (inaccessible page): `opacity: 0.4`, `cursor: not-allowed`.

**"Hide All" / "Show All" (secondary, right):**
- Background: `#FFFFFF`. Border: `1.5px solid #E0E0E0`. Text: `#424242`. Font: DM Sans 500, 13px.
- Border-radius: `9px`. Height: `38px`. Width: `calc(50% - 4px)`.
- Left icon: eye SVG (open when notes visible, closed when hidden).
- Hover: `background: #F5F5F5`. Active: `background: #EEEEEE`. Transition: `background 120ms ease`.
- Label and icon update based on `meta.hidden`.
- On click: saves updated meta → sends `TOGGLE_VISIBILITY` → does NOT close popup (user may want to see the result).

#### 5.1.5 Note List

List header bar (padding `4px 16px`):
- Left: `"On this page"` in DM Sans 600, 11px, `#9E9E9E`, uppercase, letter-spacing 0.05em.
- Right: `[Sort ▾]` button — a small dropdown that cycles through sort options: **Newest**, **Oldest**, **Color**, **Alphabetical**. Sort preference is persisted to `chrome.storage.local` under key `tabstick::prefs::sort`. Default: Newest.

Note rows (inside a scrollable container, `max-height: 200px`, `overflow-y: auto`):
- Each row: `44px` height, padding `0 16px`. Display: flex, align-items: center, gap: `10px`.
- **Color dot**: 11px filled circle, color = theme Header BG. Flex-shrink: 0.
- **Content preview**: DM Sans 400, 13px, `#424242`. Max 36 chars, truncated with `…`. If note content is empty: `"(empty note)"` in italic `#BDBDBD`.
- **Status icons** (appear between preview and delete, only when state applies):
  - 📌 pin SVG (12px, `#9E9E9E`) if note is pinned.
  - `─` minimize symbol (12px, `#BDBDBD`) if note is minimized.
- **Delete button `[✕]`**: 28×28px tap target, icon 12px. Color `#BDBDBD`. Hover: `#EF5350`. Transition: `color 120ms ease`.
- Row hover: background `#F8F8F8`. Transition: `background 120ms ease`.
- Row delete animation: height `44px → 0`, opacity `1 → 0`, `200ms ease`. Remove from DOM after.
- If **0 notes**: section is replaced with a centered empty state: sticky note SVG illustration (40px, low opacity) + `"No notes on this page yet"` in 12px `#BDBDBD` + small `"Add your first note →"` inline link that triggers `CREATE_NOTE`.

#### 5.1.6 Clear All Button

- Full width, margin `8px 16px`. Height `36px`. Border-radius `9px`.
- Style: border `1.5px solid #FFCDD2`, background `#FFF8F8`, text `#C62828`, font DM Sans 500 13px.
- Icon: trash SVG (13px, `#EF9A9A`).
- Only rendered if `notes.length > 0`.
- On click: the button area **morphs inline** into a confirm row:
  ```
  "Delete all N notes on this page?"  [Cancel]  [Delete All]
  ```
  - No browser dialogs. Implemented by replacing button content with the confirm UI.
  - `[Cancel]`: grey text button. Reverts to original button on click.
  - `[Delete All]`: red filled button. On click: sends `CLEAR_NOTES` → clears storage → `window.close()`.
  - Confirm row uses a brief fade-in: `opacity 0→1, 150ms ease`.

#### 5.1.7 Footer Stats Bar

Fixed at the bottom of the popup, always visible. Height: `36px`. Background: `#F5F5F5`. Top border: `1px solid #EEEEEE`. Padding: `0 16px`. Font: DM Sans 400, 11px, `#9E9E9E`.

- Left: e.g., `"12 notes across 4 pages"` — total notes count and total URL count read from all `tabstick::notes::*` keys.
- Right: `"Open Dashboard ↗"` — clickable link, same color, DM Sans 500. Opens Dashboard, closes popup.
- Stats are loaded asynchronously on popup open (show `"—"` as placeholder while loading).

#### 5.1.8 Sort Dropdown

A custom lightweight dropdown (no `<select>`) rendered inline below the list header button when `[Sort ▾]` is clicked:

```
┌──────────────────┐
│ ✓ Newest first   │
│   Oldest first   │
│   By color       │
│   Alphabetical   │
└──────────────────┘
```

- Position: absolute, top 100% of the sort button, right-aligned, z-index above note rows.
- Background `#FFFFFF`, border `1px solid #E0E0E0`, border-radius `8px`, box-shadow `0 4px 12px rgba(0,0,0,0.10)`.
- Each option: 32px height, padding `0 14px`, DM Sans 400, 13px, `#424242`. Hover: `background: #F5F5F5`.
- Active option has a `✓` checkmark on the left (DM Sans 500, `#F9A825`).
- Clicking outside or selecting an option closes the dropdown. Transition: `opacity 0→1, 150ms ease`.
- Note list re-renders with the new sort order when selection changes.

---

### 5.2 Dashboard (Full-Page)

The Dashboard is a full Chrome extension page at `dashboard/dashboard.html`, opened in a new browser tab. It is the **command center for all notes across all pages** — search, browse, manage, and understand your entire note collection.

The Dashboard has its own complete file set:
```
dashboard/
├── dashboard.html
├── dashboard.js
├── dashboard.css
└── views/
    ├── allNotes.js          # "All Notes" view logic
    ├── bySite.js            # "By Site" view logic
    └── stats.js             # "Statistics" view logic
```

#### 5.2.1 Dashboard Layout

```
╔══════════════════════════════════════════════════════════════════════════╗
║  [🗒] TabStick Dashboard                              [+ New Note] (v1) ║  ← Top bar (60px)
╚══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────┐
│  [🔍 Search all notes…                                               ] │  ← Search bar (52px)
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┬──────────────────────────────────────────────────────────┐
│              │                                                          │
│  NAV         │  CONTENT AREA                                            │
│              │                                                          │
│  📋 All      │  (renders the active view)                               │
│  🌐 By Site  │                                                          │
│  📊 Stats    │                                                          │
│              │                                                          │
│  ────────    │                                                          │
│  FILTERS     │                                                          │
│  ● All       │                                                          │
│  ● Sunflower │                                                          │
│  ● Peach     │                                                          │
│  ● Mint      │                                                          │
│  ● Sky       │                                                          │
│  ● Lavender  │                                                          │
│  ● Rose      │                                                          │
│  ● Slate     │                                                          │
│  ● Cream     │                                                          │
│              │                                                          │
│  ────────    │                                                          │
│  SORT        │                                                          │
│  ○ Newest    │                                                          │
│  ○ Oldest    │                                                          │
│  ○ A→Z       │                                                          │
│  ○ By Site   │                                                          │
│              │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

**Proportions:**
- Top bar: full width, `60px` height.
- Search bar: full width, `52px` height (includes padding).
- Sidebar: `220px` fixed width, full remaining height, sticky.
- Content area: `flex-grow: 1`, padded `24px`, scrollable.
- Overall background: `#F7F5F0` (warm off-white, like the back of a corkboard).

#### 5.2.2 Dashboard Top Bar

- Background: linear gradient `135deg, #FFF9C4 0%, #FFFDE7 100%`. Bottom border: `1px solid #E8E0B0`. Height: `60px`. Padding: `0 28px`.
- Left: sticky note SVG icon (22px, `#F9A825`) + `"TabStick"` DM Sans 700 18px `#2D2D2D` + `"Dashboard"` DM Sans 400 18px `#9E9E9E` (separate spans, gap `6px`).
- Right: version tag `"v1.0.0"` in a small pill (background `#FFF0CC`, border `1px solid #F9A825`, text `#B37400`, DM Sans 500, 11px, border-radius `20px`, padding `2px 8px`).

#### 5.2.3 Dashboard Search Bar

Full-width search input directly below the top bar:
- Background: `#FFFFFF`. Border-bottom: `1px solid #E8E0B0`. Height: `52px`. Padding: `0 28px`.
- Left icon: magnifying glass SVG (16px, `#BDBDBD`).
- Input: `<input type="text">`. Placeholder: `"Search all notes…"`. Font: DM Sans 400, 15px, `#424242`. Border: none. Outline: none. Background: transparent. `flex-grow: 1`.
- Right (only when search has text): `[✕]` clear button (24×24px, `#BDBDBD`, hover `#757575`).
- Search is **live** — filters notes as the user types (debounced 150ms). No "submit" or Enter required.
- Search matches: note content (case-insensitive substring match) AND the URL the note belongs to.
- Search highlights: matched text within note content previews is wrapped in `<mark>` styled with `background: #FFF176; border-radius: 2px; padding: 0 1px`.

#### 5.2.4 Dashboard Sidebar (220px)

Background: `#FFFFFF`. Right border: `1px solid #EEEEEE`. Padding: `20px 0`. Sticky, full height.

**Section: Views (navigation)**

```
  📋  All Notes          (N)
  🌐  By Site
  📊  Stats
```

Each nav item: `40px` height, padding `0 20px`. DM Sans 500, 13px. Left icon (SVG, 15px). Right: note count badge for "All Notes" only (small pill, `#F9A825` bg, dark text, 10px).

Active item: background `#FFF9C4`, left border `3px solid #F9A825`, text `#3E2800`. Border-radius right side `8px`.
Hover: background `#F9F9F9`. Transition: `background 120ms ease`.

**Section divider:** `1px solid #EEEEEE`, margin `12px 20px`.

**Section label:** `"FILTER BY COLOR"`, DM Sans 600, 10px, `#BDBDBD`, letter-spacing `0.08em`, uppercase. Padding `0 20px`. Margin-bottom `6px`.

**Color filter list:**

```
  ●  All colors          (12)
  ●  Sunflower            (4)
  ●  Peach                (2)
  ●  Mint                 (1)
  ●  Sky                  (3)
  ●  Lavender             (0)
  ●  Rose                 (1)
  ●  Slate                (1)
  ●  Cream                (0)
```

Each item: `34px` height, padding `0 20px`. DM Sans 400, 12px.
Left: filled circle (10px, that theme's Header BG color). Label: theme name. Right: count in `#BDBDBD`.
Active: text `#2D2D2D`, DM Sans 500. Dot gets a `2px solid #2D2D2D` ring.
Themes with 0 notes: `opacity: 0.45`.
Clicking a color toggles it as an active filter. Multiple colors can be selected simultaneously (multi-select). Clicking "All colors" deselects all individual colors.

**Section divider:** `1px solid #EEEEEE`, margin `12px 20px`.

**Section label:** `"SORT BY"`.

**Sort options (radio style):**
```
  ○  Newest first
  ○  Oldest first
  ○  A → Z
  ○  Site
```

Each item: `32px` height, padding `0 20px`. DM Sans 400, 12px.
Custom radio: 14px circle, border `1.5px solid #E0E0E0`. Selected: fill `#F9A825`, border `#F9A825`. Transition: `150ms ease`.
Selected label: DM Sans 500, `#2D2D2D`.

All sidebar filters and sort selection persist to `chrome.storage.local` under `tabstick::prefs::dashboard`.

#### 5.2.5 Dashboard Content Area — "All Notes" View

The default view. Shows all notes across all pages, filtered and sorted per sidebar settings and search query.

**View header bar (sticky within content area):**
```
All Notes  ·  12 notes                    [Select All] [Export ▾]
```
- Left: `"All Notes"` DM Sans 700, 16px, `#2D2D2D` + note count in `#9E9E9E` DM Sans 400 14px.
- Right: `[Select All]` text button (activates multi-select mode) + `[Export ▾]` dropdown button.
- Background: `#F7F5F0`. Padding: `0 0 16px 0`. Sticky top `0`.

**Note cards grid:**

Notes render as cards in a **masonry-style responsive grid** (CSS columns, `column-count: auto`, `column-width: 280px`, gap `16px`).

Each card:
```
┌──────────────────────────────────┐
│ ══════════════════════════════  │  ← Color header strip (8px)
│                                  │
│  Buy milk and eggs before the    │  ← Note content (Caveat 15px)
│  weekend. Also check if we need  │
│  more coffee.                    │
│                                  │
│ ─────────────────────────────── │
│  reddit.com/r/cooking  · 2d ago  │  ← Footer: site + age
│                  [📌] [↗] [✕]   │  ← Action icons
└──────────────────────────────────┘
```

Card specifications:
- Background: theme Body BG color.
- Border: `1px solid` theme Header BG at `25%` opacity.
- Border-radius: `12px`.
- Box-shadow: `0 2px 6px rgba(0,0,0,0.07)`.
- Top strip: `8px` solid bar in theme Header BG color. Border-radius: `12px 12px 0 0`.
- Content area: padding `12px 14px`. Font: Caveat 15px, theme body text color, line-height 1.6. Max 6 lines shown; overflow hidden with a `linear-gradient` fade to transparent at the bottom (not hard clamp).
- Slight rotation applied: `transform: rotate(Xdeg)` using the stored note rotation — cards in the dashboard also carry their personality.
- Hover: `box-shadow: 0 6px 16px rgba(0,0,0,0.12)`, `transform: rotate(Xdeg) translateY(-2px)`. Transition: `200ms ease`.
- **No rotation on cards in the grid** — rotation is charming on the live note overlay but would make the dashboard grid feel chaotic. Cards are presented straight (`rotate(0deg)`), clean and readable. The rotation is only applied on the actual sticky note in-page.

Card footer:
- Top border: `1px solid` Header BG at `15%` opacity.
- Padding: `8px 14px`.
- Left: site hostname in DM Sans 400, 11px, `#9E9E9E`. Then `·` separator. Then relative time (`"just now"`, `"2d ago"`, `"3 weeks ago"`) in 11px `#BDBDBD`. (Use `updatedAt` timestamp.)
- Right: three icon buttons, each `24×24px`:
  - 📌 pin/unpin SVG — toggles note's pinned state in storage + sends message to content script if page is currently open.
  - ↗ navigate SVG — opens the note's URL in a new tab.
  - ✕ delete SVG — deletes the note (shows undo toast within the dashboard).

Card **multi-select mode** (activated by "Select All" or clicking a checkbox):
- A checkbox (18×18px) appears in the top-right corner of each card.
- Selecting cards shows a floating action bar at the bottom of the dashboard content area:
  ```
  3 notes selected   [Delete Selected]  [Export Selected]  [Cancel]
  ```
- `[Delete Selected]`: confirms inline, then deletes all selected notes from storage.
- `[Export Selected]`: triggers export of selected notes only.
- `[Cancel]`: exits multi-select mode.

**Empty state (no notes anywhere, or search/filter returns nothing):**
```
        [sticky note SVG illustration, 80px, low opacity]

        No notes found

        Try a different search, or add your first note
        by clicking the TabStick icon in your toolbar.
```
Center-aligned, full content area. Text: DM Sans 400, 14px, `#BDBDBD`.

**Search results state:** shows all matching notes from any URL. Search term is highlighted in cards. A result count line at the top: `'Showing 4 results for "milk"'`.

#### 5.2.6 Dashboard Content Area — "By Site" View

Groups all notes by their URL, showing one section per site.

**View header:**
```
By Site  ·  4 sites                        [Expand All] [Collapse All]
```

**Site group:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  🌐  github.com/user/repo                         5 notes   [↗] [▾] │  ← Site header
├──────────────────────────────────────────────────────────────────────┤
│  [card] [card] [card] [card] [card]                                  │  ← Note cards (smaller)
└──────────────────────────────────────────────────────────────────────┘
```

Site header:
- Background: `#FFFFFF`. Border: `1px solid #EEEEEE`. Border-radius `10px 10px 0 0` (when expanded) or `10px` (when collapsed). Padding: `12px 18px`.
- Left: globe SVG (14px, `#9E9E9E`) + URL hostname + pathname (DM Sans 500, 13px, `#2D2D2D`). Max 60 chars, truncated.
- Right: note count pill (`"5 notes"`, background `#F5F5F5`, border-radius `20px`, DM Sans 400 11px `#9E9E9E`, padding `2px 8px`) + `[↗]` open-site icon + `[▾]` collapse/expand toggle.
- Hover: `background: #FAFAFA`.

Site card row: horizontal scroll if overflow, or wraps to 2 rows max. Cards here are **compact**: `180px` wide, same height as content needs.

Compact card differences:
- No footer (URL is the section header). Only `updatedAt` age shown.
- Action icons: only ↗ and ✕.
- Content preview: max 4 lines.

Site group collapse animation: `max-height` transition `0 → auto` proxy via WAAPI, `250ms ease`.

"Expand All" / "Collapse All": collapses or expands every site section simultaneously.

Sites are sorted by: most recently updated note within each site (most active site first). This order cannot be changed — it's the only ordering that makes sense for the By Site view.

**Empty site state**: a site with all notes deleted is removed from the list with a fade-out.

#### 5.2.7 Dashboard Content Area — "Stats" View

A statistics and insights view. No note editing here — read-only.

**View header:**
```
Stats  ·  Your note history at a glance
```

**Stats cards row (4 across, responsive to 2 on narrow screens):**

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  📝 Total Notes  │  │  🌐 Total Sites  │  │  📅 This Week    │  │  🎨 Top Color    │
│                  │  │                  │  │                  │  │                  │
│       12         │  │        4         │  │        3         │  │   ● Sunflower    │
│                  │  │                  │  │                  │  │      (4 notes)   │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

Each stat card: background `#FFFFFF`, border `1px solid #EEEEEE`, border-radius `12px`, padding `20px`, box-shadow `0 2px 6px rgba(0,0,0,0.05)`.
- Icon: 20px SVG, `#F9A825`.
- Label: DM Sans 600, 11px, `#9E9E9E`, uppercase, letter-spacing `0.06em`.
- Value: DM Sans 700, 32px, `#2D2D2D`.
- Sub-label (for "Top Color"): theme name + count in DM Sans 400, 12px, `#9E9E9E`.

**Color distribution chart:**

A horizontal stacked bar showing note count per color theme:

```
Sunflower  ████████████████░░░░░░░░  4 notes  (33%)
Peach      ████████░░░░░░░░░░░░░░░░  2 notes  (17%)
Sky        ████████████░░░░░░░░░░░░  3 notes  (25%)
Rose       ████░░░░░░░░░░░░░░░░░░░░  1 note    (8%)
Slate      ████░░░░░░░░░░░░░░░░░░░░  1 note    (8%)
Mint       ████░░░░░░░░░░░░░░░░░░░░  1 note    (8%)
```

Each row: color dot + theme name label + filled bar (background = theme Header BG, `border-radius: 3px`, `height: 10px`, width proportional to percentage) + count + percentage. Bar animates from `width: 0` to final width on view load (`600ms cubic-bezier(0.34, 1.1, 0.64, 1)`, staggered 80ms per row). Empty themes are hidden.

**Activity timeline (last 30 days):**

A simple calendar heatmap (GitHub-style) showing notes created/updated per day:

```
      Mon  Tue  Wed  Thu  Fri  Sat  Sun
Week1  □    □    ■    □    ■■   □    □
Week2  □    ■    □    □    □    □    □
Week3  ■■   □    □    ■    □    □    □
Week4  □    □    ■    □    □    □    □
```

Each cell: `16×16px`, `border-radius: 3px`, gap `3px`. Color intensity based on note count that day:
- 0 notes: `#F0F0F0`
- 1 note: `#FFE082`
- 2–3 notes: `#FFB300`
- 4+ notes: `#F9A825`

Hover on cell: tooltip showing the date and count: `"May 14 · 3 notes updated"`.

**Most active sites:**

Top 5 sites by total note count, shown as a simple ranked list:
```
  1  github.com              5 notes   ████████████
  2  reddit.com              3 notes   ████████
  3  docs.google.com         2 notes   █████
  4  notion.so               1 note    ███
  5  stackoverflow.com       1 note    ███
```

Bar widths proportional to max (site #1 = 100% width). Animation: same staggered bar grow as color chart.

**Notes by pinned / minimized status:**

Two small stat pills side by side:
- `"📌 3 pinned notes"` — background `#FFF9C4`, border `1px solid #FFE082`, text `#B37400`.
- `"─ 2 minimized notes"` — background `#F5F5F5`, border `1px solid #E0E0E0`, text `#757575`.

#### 5.2.8 Dashboard — Export Feature

Accessible via the `[Export ▾]` dropdown in the All Notes view header, and `[Export Selected]` in multi-select mode.

Dropdown options:
```
  Export all notes as .txt
  Export all notes as .md
  Export all notes as .json
```

When "Export Selected" is active, dropdown options become:
```
  Export N selected as .txt
  Export N selected as .md
  Export N selected as .json
```

**`.txt` format** (one note per block):
```
== github.com/user/repo ==
[Note 1 — Sunflower — Created May 14, 2026]
Review PR before EOD

[Note 2 — Sky — Created May 13, 2026]
Ask about API rate limits

== reddit.com/r/cooking ==
[Note 1 — Peach — Created May 12, 2026]
Buy milk and eggs before the weekend.
```

**`.md` format** (Markdown):
```markdown
# TabStick Export — May 18, 2026

## github.com/user/repo

### Note 1 (Sunflower · May 14, 2026)
Review PR before EOD

### Note 2 (Sky · May 13, 2026)
Ask about API rate limits

## reddit.com/r/cooking

### Note 1 (Peach · May 12, 2026)
Buy milk and eggs before the weekend.
```

**`.json` format**: the raw note objects array, pretty-printed, wrapped in a top-level object:
```json
{
  "exported": "2026-05-18T10:30:00Z",
  "version": "1.0.0",
  "notes": [
    {
      "url": "https://github.com/user/repo",
      "id": "note_a3f2b1c9",
      "color": "sunflower",
      "content": "Review PR before EOD",
      "createdAt": 1716000000000,
      "updatedAt": 1716001200000
    }
  ]
}
```

Export is implemented using `URL.createObjectURL(new Blob([content], { type: '...' }))` and a programmatic `<a download>` click. No server involved.

#### 5.2.9 Dashboard Undo Toast

The Dashboard has its own undo toast, identical in behavior to the in-page toast (§4.9) but rendered inside the dashboard page (fixed to the bottom of the dashboard viewport, not the content scroll area).

- Appears after any note deletion from the dashboard.
- Shows: `"Note deleted · Undo"` with a 4-second progress bar.
- Undo restores the note to storage. The card re-appears in the grid with a fade-in animation.
- Multiple rapid deletions each get their own 4-second window. If a second delete happens before the first toast expires, the first toast completes its timer independently (toasts stack vertically, max 3 visible at once, older ones above newer ones).

#### 5.2.10 Dashboard — Empty State (First Use)

When the user opens the Dashboard for the first time with 0 notes anywhere:

```
        [large corkboard illustration SVG, 120px]

        Your corkboard is empty

        Start by clicking the TabStick icon in your browser toolbar
        on any webpage and adding your first note.

        [ Open a page to get started ]
```

`[Open a page to get started]` button opens `https://example.com` in a new tab. Styling: outlined, `#F9A825` border and text.

#### 5.2.11 Dashboard Keyboard Navigation

| Key | Action |
|-----|--------|
| `/` | Focus the search bar |
| `Escape` | Clear search (if search has text) / exit multi-select mode |
| `1` | Switch to "All Notes" view |
| `2` | Switch to "By Site" view |
| `3` | Switch to "Stats" view |
| `↑` / `↓` | Navigate between note cards (when a card is focused) |
| `Delete` / `Backspace` | Delete focused card (shows undo toast) |
| `Space` | Toggle selection of focused card (in multi-select mode) |
| `Cmd/Ctrl + A` | Select all (enters multi-select, selects all visible cards) |

#### 5.2.12 Dashboard Visual Details

**Overall page:**
- Body background: `#F7F5F0` (warm off-white, corkboard feel).
- Custom scrollbar in content area: `6px` width, `border-radius: 3px`, thumb `#E0D8C8`, track transparent.
- All interactive elements: `outline: 2px solid #F9A825` on `:focus-visible` (keyboard navigation).

**Typography:**
- All text: DM Sans (loaded in `<head>` from Google Fonts).
- Headings: DM Sans 700.
- Body: DM Sans 400.
- Labels: DM Sans 600.
- Note card content only: Caveat 15px (loaded alongside DM Sans in the same Google Fonts request).

**Responsive breakpoints:**
- `≥ 1200px`: sidebar visible, card grid 3+ columns.
- `900px – 1199px`: sidebar visible (narrower: `190px`), card grid 2 columns.
- `< 900px`: sidebar collapses to a top filter bar (horizontal scroll). Card grid 1 column.
- Dashboard is not designed for mobile use (it's a desktop extension), but must not break below 768px wide.

**Loading state:**
- When the dashboard first loads and is reading storage: show skeleton cards (3 grey placeholder cards in the grid, pulsing with `@keyframes pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.8 } }`, `1.5s ease infinite`).
- Skeleton cards are replaced by real cards as soon as storage read completes (typically < 50ms).

**Favicon:**
The dashboard `<head>` includes a favicon using the TabStick icon: `<link rel="icon" href="../assets/icons/icon32.png">`.

**Page title:** `<title>TabStick Dashboard</title>`.

---

## 6. Keyboard Shortcuts & Accessibility

### 6.1 Global Shortcut
- `Alt+Shift+S` — create a new note on the current page.
- Registered in `manifest.json` under `commands`. Works regardless of popup state.

### 6.2 Within a Note

| Key | Action |
|-----|--------|
| `Escape` | Blur the textarea (deactivate note) |
| `Tab` | Insert a literal tab character into the textarea. Override the default focus-move behavior. |
| `Ctrl+Z` / `Cmd+Z` | Native undo within textarea — do not override. |
| `Ctrl+A` / `Cmd+A` | Select all text in textarea — do not override. |

### 6.3 Focus Management
- On note creation: `textarea.focus()` is called immediately after the spawn animation starts (not after it ends — the user should be able to type during the animation).
- On note delete via `✕` button: `document.body.focus()` after deletion.
- Tab order within the note header (left to right): `color dot → pin button → minimize button → close button`. The textarea is not in this tab order (it's a text input and has its own natural tab stop).

### 6.4 ARIA Attributes

| Element | ARIA |
|---------|------|
| Shadow host `div` | `role="dialog"` `aria-label="Sticky note"` `aria-modal="false"` |
| Close button | `aria-label="Delete note"` |
| Minimize button | `aria-label="Minimize note"` (changes to `"Restore note"` when minimized) |
| Pin button | `aria-label="Lock note position"` (changes to `"Unlock note position"` when pinned) |
| Color dot button | `aria-label="Change color. Current: Sunflower"` (updates with current color name) |
| Textarea | `aria-label="Note content"` `aria-multiline="true"` |
| Undo toast | `role="alert"` `aria-live="assertive"` |
| "Saved" indicator | `aria-live="polite"` `aria-atomic="true"` |

---

## 7. Technical Architecture

### 7.1 File Structure

```
tabstick/
├── manifest.json
│
├── background/
│   └── service-worker.js          # Badge updates, command routing, storage listener
│
├── content/
│   ├── content.js                 # Entry point: init, message listener, URL change watcher
│   ├── noteManager.js             # NoteManager class: state, CRUD, storage sync
│   ├── noteRenderer.js            # Shadow DOM construction, HTML/CSS template builder
│   ├── dragHandler.js             # Mousedown/move/up drag logic
│   ├── resizeHandler.js           # Resize handle drag logic
│   └── toastManager.js            # Undo toast: render, timer, undo callback
│
├── popup/
│   ├── popup.html                 # Toolbar popup (360px)
│   ├── popup.js                   # Popup logic: per-page actions, sort, global stats
│   └── popup.css                  # Popup styles
│
├── dashboard/
│   ├── dashboard.html             # Full-page dashboard (new tab)
│   ├── dashboard.js               # Dashboard orchestrator: init, state, event wiring
│   ├── dashboard.css              # Dashboard styles
│   └── views/
│       ├── allNotes.js            # "All Notes" masonry grid, search, multi-select
│       ├── bySite.js              # "By Site" grouped view with expand/collapse
│       └── stats.js               # "Stats" view: charts, heatmap, activity
│
├── utils/
│   ├── storage.js                 # chrome.storage.local Promise wrappers
│   ├── urlUtils.js                # URL normalization + isAccessibleUrl
│   ├── idUtils.js                 # Note ID generation
│   └── colorThemes.js             # Color theme definitions — single source of truth
│
└── assets/
    ├── icons/
    │   ├── icon16.png
    │   ├── icon32.png
    │   ├── icon48.png
    │   └── icon128.png
    └── illustrations/
        ├── empty-corkboard.svg    # Empty state illustration (Dashboard first use)
        └── empty-page.svg         # Empty state illustration (popup, 0 notes on page)
```

### 7.2 manifest.json (complete)

```json
{
  "manifest_version": 3,
  "name": "TabStick",
  "version": "1.0.0",
  "description": "Sticky notes for every browser tab. Create, pin, and persist notes on any webpage.",

  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "tabs"
  ],

  "host_permissions": [
    "http://*/*",
    "https://*/*"
  ],

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16":  "assets/icons/icon16.png",
      "32":  "assets/icons/icon32.png",
      "48":  "assets/icons/icon48.png",
      "128": "assets/icons/icon128.png"
    },
    "default_title": "TabStick — Sticky Notes"
  },

  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": [
        "utils/colorThemes.js",
        "utils/storage.js",
        "utils/urlUtils.js",
        "utils/idUtils.js",
        "content/toastManager.js",
        "content/dragHandler.js",
        "content/resizeHandler.js",
        "content/noteRenderer.js",
        "content/noteManager.js",
        "content/content.js"
      ],
      "run_at": "document_idle",
      "all_frames": false
    }
  ],

  "background": {
    "service_worker": "background/service-worker.js"
  },

  "web_accessible_resources": [
    {
      "resources": ["dashboard/dashboard.html"],
      "matches":   ["<all_urls>"]
    }
  ],

  "commands": {
    "create-note": {
      "suggested_key": {
        "default": "Alt+Shift+S",
        "mac": "Alt+Shift+S"
      },
      "description": "Create a new sticky note on this page"
    }
  },

  "icons": {
    "16":  "assets/icons/icon16.png",
    "32":  "assets/icons/icon32.png",
    "48":  "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

---

## 8. Storage Schema & Data Model

### 8.1 URL Normalization

```js
// utils/urlUtils.js
function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    // Keep protocol + hostname + pathname only.
    // Normalize trailing slash: always strip it (unless path is just "/").
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
    return `${url.protocol}//${url.hostname}${pathname}`;
  } catch {
    // Fallback: use the raw URL as-is if parsing fails.
    return rawUrl;
  }
}
```

Examples:
- `https://github.com/user/repo?tab=readme#section` → `https://github.com/user/repo`
- `https://docs.google.com/document/d/abc123/edit` → `https://docs.google.com/document/d/abc123/edit`
- `https://reddit.com/r/programming/` → `https://reddit.com/r/programming`
- `https://example.com` → `https://example.com/`

### 8.2 Storage Key Format

```js
// utils/storage.js
const NOTES_PREFIX = 'tabstick::notes::';
const META_PREFIX  = 'tabstick::meta::';

const notesKey = (url) => `${NOTES_PREFIX}${url}`;
const metaKey  = (url) => `${META_PREFIX}${url}`;
```

### 8.3 Note Object Schema

```typescript
interface NoteObject {
  id:        string;    // "note_" + 8 random hex chars. e.g. "note_a3f2b1c9"
  x:         number;    // px from viewport left (integer)
  y:         number;    // px from viewport top (integer)
  width:     number;    // px (integer, clamped 180–600)
  height:    number;    // px (integer, clamped 120–500). Stored full height even when minimized.
  color:     string;    // "sunflower"|"peach"|"mint"|"sky"|"lavender"|"rose"|"slate"|"cream"
  rotation:  number;    // degrees (float, e.g. 1.47). Generated once, never changes.
  content:   string;    // plain text only (no HTML, no markdown)
  minimized: boolean;   // true = collapsed to header only
  pinned:    boolean;   // true = locked (no drag/resize, readonly textarea)
  zIndex:    number;    // integer, relative stacking order (0 = bottom). Increments on focus.
  createdAt: number;    // Unix timestamp ms
  updatedAt: number;    // Unix timestamp ms
}
```

### 8.4 URL Metadata Schema

```typescript
interface UrlMeta {
  hidden:    boolean;   // true = all notes on this URL are visibility:hidden
  noteCount: number;    // redundant cache for badge updates; must be kept in sync
}
```

### 8.5 Full Storage Layout Example

```json
{
  "tabstick::notes::https://github.com/user/repo": [
    {
      "id": "note_a3f2b1c9",
      "x": 120, "y": 200,
      "width": 240, "height": 180,
      "color": "sunflower",
      "rotation": 1.47,
      "content": "Review PR before EOD",
      "minimized": false,
      "pinned": false,
      "zIndex": 2,
      "createdAt": 1716000000000,
      "updatedAt": 1716001200000
    },
    {
      "id": "note_b8e1f234",
      "x": 400, "y": 150,
      "width": 220, "height": 160,
      "color": "sky",
      "rotation": -1.12,
      "content": "Ask about API rate limits",
      "minimized": true,
      "pinned": false,
      "zIndex": 3,
      "createdAt": 1716002000000,
      "updatedAt": 1716002500000
    }
  ],
  "tabstick::meta::https://github.com/user/repo": {
    "hidden": false,
    "noteCount": 2
  }
}
```

### 8.6 Storage Utility API

```js
// utils/storage.js — all methods return Promises

const Storage = {
  // Returns [] if key does not exist (never throws on missing key)
  async getNotes(normalizedUrl): Promise<NoteObject[]>

  // Full replace of the notes array for this URL
  async saveNotes(normalizedUrl, notes): Promise<void>

  // Returns { hidden: false, noteCount: 0 } if key does not exist
  async getMeta(normalizedUrl): Promise<UrlMeta>

  async saveMeta(normalizedUrl, meta): Promise<void>

  // Removes both the notes key and the meta key for this URL
  async deleteAllForUrl(normalizedUrl): Promise<void>

  // Returns all storage keys (for Dashboard and global stats)
  async getAllKeys(): Promise<string[]>

  // User preferences shared between popup and dashboard
  // Key: tabstick::prefs
  // Returns defaults if not set: { sort: newest, colorFilters: [], view: all }
  async getPrefs(): Promise<UserPrefs>
  async savePrefs(prefs): Promise<void>
};
```

UserPrefs schema:
- sort: newest | oldest | az | site  (shared by popup and dashboard)
- colorFilters: string[]  (active color filters in dashboard sidebar, [] = all)
- view: all | bysite | stats  (last active dashboard view, restored on next open)

All methods wrap chrome.storage.local calls in Promises. getNotes returns [] if key does not exist. getMeta returns { hidden: false, noteCount: 0 } if missing. getPrefs returns default values if the key has never been written.

### 8.7 ID Generation

```js
// utils/idUtils.js
function generateNoteId() {
  // 8 random hex characters
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `note_${hex}`;
}
```

### 8.8 Default Note Values

```js
function createDefaultNote(spawnX, spawnY) {
  return {
    id:        generateNoteId(),
    x:         spawnX,
    y:         spawnY,
    width:     240,
    height:    180,
    color:     randomColor(),   // picks a random theme key
    rotation:  parseFloat((Math.random() * 4 - 2).toFixed(2)),  // -2.00 to +2.00
    content:   '',
    minimized: false,
    pinned:    false,
    zIndex:    0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
```

---

## 9. Content Script — Full Behavior Spec

### 9.1 Initialization Flow (content.js)

```
1. currentUrl = normalizeUrl(window.location.href)
2. [notes, meta] = await Promise.all([
     Storage.getNotes(currentUrl),
     Storage.getMeta(currentUrl)
   ])
3. NoteManager.init(notes, meta, currentUrl)
4. Register chrome.runtime.onMessage listener
5. Start SPA URL-change watcher (MutationObserver — see §14.3)
6. Register document visibilitychange listener for cross-tab sync (see §14.4)
```

### 9.2 NoteManager Class (noteManager.js)

```
class NoteManager {
  currentUrl   // string
  notes        // Map<id, NoteObject>  — in-memory source of truth
  domNodes     // Map<id, HTMLElement> — shadow host elements
  maxZIndex    // number — highest zIndex currently in use
  meta         // UrlMeta
  saveTimer    // debounce timer handle

  init(notesArray, meta, url)
    Clamps positions of all notes to viewport (§14.5).
    Calls renderNote() for each note.
    Applies meta.hidden visibility to all notes.
    Updates maxZIndex = max(note.zIndex) across all notes.

  createNote()
    Computes spawn position (cascading offset from previous spawn).
    Creates a default NoteObject (§8.8).
    Adds to this.notes map.
    Calls renderNote(note).
    Calls Storage.saveNotes() IMMEDIATELY (no debounce — new note must persist at once).
    Updates Storage.saveMeta() with incremented noteCount.
    Returns the new note.

  renderNote(note)
    Calls noteRenderer.buildNote(note) → { host, shadow }
    Attaches all event handlers: drag (dragHandler), resize (resizeHandler),
      textarea input, color dot click, pin button, minimize button, close button,
      mousedown on host (bring to front).
    Applies current meta.hidden visibility.
    Appends host to document.body.
    Plays spawn animation (unless reducedMotion).
    Focuses textarea.

  updateNote(id, changes)
    Merges changes into this.notes.get(id).
    Updates only changed DOM attributes (no re-render).
    Schedules debouncedSave().

  deleteNote(id, { skipUndo = false } = {})
    If !skipUndo: stores a snapshot of the note for undo. Calls toastManager.show(note, undoCallback).
    Plays delete animation on host element.
    After animation ends: removes host from DOM, removes from this.notes and this.domNodes.
    If skipUndo: calls Storage.saveNotes() + saveMeta() immediately.
    If !skipUndo: storage is not updated yet (happens after 4s toast timer, or is reversed by undo).

  undoDelete(noteSnapshot)
    Re-adds noteSnapshot to this.notes map.
    Calls renderNote(noteSnapshot) (no spawn animation for undo — instant appearance).
    Calls Storage.saveNotes() + saveMeta() immediately.

  confirmDelete(id)
    Called by toastManager after 4s with no undo.
    Calls Storage.saveNotes() + saveMeta() immediately.

  bringToFront(id)
    this.maxZIndex++
    note.zIndex = this.maxZIndex
    Updates host element z-index style.
    Schedules debouncedSave().

  setAllVisibility(hidden)
    this.meta.hidden = hidden
    Applies visibility:hidden / visible + pointer-events to all host elements.
    Calls Storage.saveMeta() immediately.

  clearAll()
    Plays delete animation on all host elements simultaneously.
    After animation: removes all from DOM, clears this.notes and this.domNodes.
    Calls Storage.deleteAllForUrl(currentUrl) immediately.

  handleUrlChange(newUrl)
    Hides + removes all current DOM notes (no animation — instant).
    this.notes.clear(), this.domNodes.clear()
    this.currentUrl = newUrl
    [notes, meta] = await load from storage
    Calls init(notes, meta, newUrl)

  debouncedSave()
    Clears existing save timer.
    Sets new timer (500ms) → on fire:
      calls Storage.saveNotes(currentUrl, Array.from(this.notes.values()))
      on error: retries 3x with backoff; on final failure: shows in-note error indicator
}
```

### 9.3 noteRenderer.js — Shadow DOM Construction

```js
function buildNote(note) {
  const { bg, headerBg, headerText, bodyText } = colorThemes[note.color];

  const host = document.createElement('div');
  host.className = 'ts-host';
  // Set all critical styles as inline styles on host — never rely on external CSS
  Object.assign(host.style, {
    position:     'fixed',
    left:         `${note.x}px`,
    top:          `${note.y}px`,
    width:        `${note.width}px`,
    height:       note.minimized ? '36px' : `${note.height}px`,
    zIndex:       String(2147483640 + note.zIndex),
    transform:    `rotate(${note.rotation}deg)`,
    transformOrigin: 'top left',
    borderRadius: '10px',
    pointerEvents: 'all',
    // Spawn animation start state (overridden immediately by WAAPI)
    opacity:      '0',
  });

  const shadow = host.attachShadow({ mode: 'open' });

  // Inject Google Fonts
  const fontLink = document.createElement('link');
  fontLink.rel  = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap';
  shadow.appendChild(fontLink);

  // Inject styles + HTML
  shadow.innerHTML += buildShadowCSS(note) + buildShadowHTML(note);

  return { host, shadow };
}
```

`buildShadowCSS(note)` returns a `<style>` block containing all note CSS, using `--ts-*` custom properties. `buildShadowHTML(note)` returns the full note inner HTML: SVG grain filter, header, body, footer, resize handle.

### 9.4 Drag Handler (dragHandler.js)

```
attachDrag(host, note, onUpdate):

  headerEl.addEventListener('mousedown', (e) => {
    if (note.pinned) return
    if (e.button !== 0) return   // left click only
    e.preventDefault()

    // Cache values before drag starts (no layout reads during drag)
    let startMouseX = e.clientX
    let startMouseY = e.clientY
    let startNoteX  = note.x
    let startNoteY  = note.y

    host.style.willChange = 'transform'
    applyDragLiftStyles(host, note)          // scale 1.03, elevated shadow
    document.body.classList.add('ts-dragging') // sets cursor: grabbing on body

    function onMove(e) {
      const dx = e.clientX - startMouseX
      const dy = e.clientY - startMouseY
      const newX = clamp(startNoteX + dx, 0, window.innerWidth  - note.width)
      const newY = clamp(startNoteY + dy, 0, window.innerHeight - 36)
      host.style.left = `${newX}px`
      host.style.top  = `${newY}px`
      note.x = newX
      note.y = newY
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup',   onUp,   true)
      host.style.willChange = ''
      applyDragDropStyles(host, note)          // scale 1.0, resting shadow
      document.body.classList.remove('ts-dragging')
      onUpdate({ x: note.x, y: note.y })      // triggers NoteManager.updateNote → debouncedSave
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup',   onUp,   true)
  })
```

### 9.5 Resize Handler (resizeHandler.js)

```
attachResize(host, note, onUpdate):

  resizeHandleEl.addEventListener('mousedown', (e) => {
    if (note.pinned) return
    if (e.button !== 0) return
    e.preventDefault()

    const startX = e.clientX, startY = e.clientY
    const startW = note.width, startH = note.height

    function onMove(e) {
      const newW = clamp(startW + (e.clientX - startX), 180, 600)
      const newH = clamp(startH + (e.clientY - startY), 120, 500)
      host.style.width  = `${newW}px`
      host.style.height = `${newH}px`
      note.width  = newW
      note.height = newH
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup',   onUp,   true)
      onUpdate({ width: note.width, height: note.height })
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup',   onUp,   true)
  })
```

### 9.6 Content Script Message Listener

```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Guard: only handle messages from our own extension
  if (sender.id !== chrome.runtime.id) return;

  try {
    switch (msg.type) {
      case 'CREATE_NOTE':
        NoteManager.createNote();
        sendResponse({ success: true });
        break;
      case 'DELETE_NOTE':
        NoteManager.deleteNote(msg.noteId);
        sendResponse({ success: true });
        break;
      case 'CLEAR_NOTES':
        NoteManager.clearAll();
        sendResponse({ success: true });
        break;
      case 'TOGGLE_VISIBILITY':
        NoteManager.setAllVisibility(msg.hidden);
        sendResponse({ success: true });
        break;
      case 'GET_NOTE_COUNT':
        sendResponse({ count: NoteManager.notes.size });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }

  return true; // Keep message channel open for async sendResponse
});
```

---

## 10. Popup & Dashboard Script — Full Behavior Spec

### 10.1 Popup Initialization (popup.js)

```
1. DOMContentLoaded fires
2. [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
3. accessible = isAccessibleUrl(tab.url)
4. currentUrl = normalizeUrl(tab.url)
5. if (!accessible): renderInaccessibleState(); load footer stats async; return
6. [notes, meta, prefs, globalStats] = await Promise.all([
     Storage.getNotes(currentUrl),
     Storage.getMeta(currentUrl),
     Storage.getPrefs(),
     Storage.getGlobalStats()        // total note count + total URL count
   ])
7. applySortOrder(notes, prefs.sort) → sortedNotes
8. renderPopup(tab, sortedNotes, meta, currentUrl)
9. renderFooterStats(globalStats)
10. attachAllEventListeners(tab, sortedNotes, meta, currentUrl, prefs)
```

### 10.2 Utility Functions (popup.js)

```js
function isAccessibleUrl(url) {
  return typeof url === 'string' &&
    (url.startsWith('http://') || url.startsWith('https://'));
}

function formatUrlDisplay(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const display = url.hostname + (url.pathname === '/' ? '' : url.pathname);
    if (display.length <= 38) return display;
    const half = 17;
    return display.slice(0, half) + '…' + display.slice(display.length - half);
  } catch {
    return rawUrl.slice(0, 38);
  }
}

function applySortOrder(notes, sortPref) {
  const sorted = [...notes];
  switch (sortPref) {
    case 'oldest':      return sorted.sort((a, b) => a.createdAt - b.createdAt);
    case 'color':       return sorted.sort((a, b) => a.color.localeCompare(b.color));
    case 'alphabetical':return sorted.sort((a, b) => a.content.localeCompare(b.content));
    case 'newest':
    default:            return sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000)            return 'just now';
  if (diff < 3_600_000)         return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)        return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000)   return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
```

### 10.3 Popup Actions

All state-mutating actions follow this pattern:
1. Update `chrome.storage.local` directly (never depend solely on content script).
2. Send a message to the content script to update the live DOM.
3. Catch and swallow `chrome.runtime.lastError` if the content script is unavailable.

```js
// Open Dashboard
dashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
});

// Add Note
addNoteBtn.addEventListener('click', async () => {
  addNoteBtn.disabled = true;
  chrome.tabs.sendMessage(tab.id, { type: 'CREATE_NOTE' }, () => void chrome.runtime.lastError);
  window.close();
});

// Toggle Visibility (does NOT close popup — user sees updated label)
toggleVisibilityBtn.addEventListener('click', async () => {
  const newHidden = !meta.hidden;
  meta.hidden = newHidden;
  await Storage.saveMeta(currentUrl, meta);
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_VISIBILITY', hidden: newHidden }, () => void chrome.runtime.lastError);
  updateVisibilityButton(newHidden);   // update label + icon in place
});

// Sort dropdown
sortBtn.addEventListener('click', () => toggleSortDropdown());
sortOptions.forEach(option => {
  option.addEventListener('click', async (e) => {
    const newSort = e.currentTarget.dataset.sort;
    prefs.sort = newSort;
    await Storage.savePrefs(prefs);
    const resorted = applySortOrder(notes, newSort);
    rerenderNoteList(resorted);
    closeSortDropdown();
  });
});

// Delete single note from list
noteRowDeleteBtns.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const noteId = btn.dataset.noteId;
    const rowEl  = btn.closest('.ts-note-row');

    // Animate row out
    rowEl.style.overflow = 'hidden';
    rowEl.style.transition = 'height 200ms ease, opacity 200ms ease, margin 200ms ease';
    rowEl.style.height  = rowEl.offsetHeight + 'px';
    requestAnimationFrame(() => {
      rowEl.style.height  = '0';
      rowEl.style.opacity = '0';
      rowEl.style.marginBottom = '0';
    });
    setTimeout(() => rowEl.remove(), 210);

    // Update data + storage
    notes = notes.filter(n => n.id !== noteId);
    await Storage.saveNotes(currentUrl, notes);
    chrome.tabs.sendMessage(tab.id, { type: 'DELETE_NOTE', noteId }, () => void chrome.runtime.lastError);
    updateNoteCount(notes.length);
    if (notes.length === 0) renderEmptyState();
  });
});

// Clear All (inline confirm)
clearAllBtn.addEventListener('click', () => {
  showInlineConfirm(
    `Delete all ${notes.length} note${notes.length === 1 ? '' : 's'} on this page?`,
    {
      onConfirm: async () => {
        await Storage.deleteAllForUrl(currentUrl);
        chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_NOTES' }, () => void chrome.runtime.lastError);
        window.close();
      },
      onCancel: hideInlineConfirm,
    }
  );
});
```

### 10.4 Global Stats Loading

```js
async function loadGlobalStats() {
  const allKeys = await Storage.getAllKeys();
  const noteKeys = allKeys.filter(k => k.startsWith('tabstick::notes::'));
  const results  = await chrome.storage.local.get(noteKeys);
  let totalNotes = 0;
  let totalSites = 0;
  for (const key of noteKeys) {
    const arr = results[key];
    if (Array.isArray(arr) && arr.length > 0) {
      totalNotes += arr.length;
      totalSites++;
    }
  }
  return { totalNotes, totalSites };
}
```

Render footer: `"${totalNotes} note${totalNotes !== 1 ? 's' : ''} across ${totalSites} page${totalSites !== 1 ? 's' : ''}"`. While loading, show `"— notes across — pages"`.

---

### 10.5 Dashboard Initialization (dashboard.js)

```
1. DOMContentLoaded fires
2. Load Google Fonts (DM Sans + Caveat) via injected <link> (already in dashboard.html <head>)
3. Show skeleton loading state
4. allData = await loadAllNotesData()
   → reads all tabstick::notes::* and tabstick::meta::* keys in a single chrome.storage.local.get
   → returns: { byUrl: Map<url, NoteObject[]>, meta: Map<url, UrlMeta> }
5. prefs = await Storage.getPrefs() → { sort, colorFilter[], view, sidebarCollapsed }
6. Hide skeleton, render full dashboard
7. renderView(prefs.view || 'all')
8. updateSidebarCounts(allData)
9. attachDashboardEventListeners()
10. chrome.storage.onChanged.addListener(onStorageChange)
    → re-renders affected cards/counts when storage mutates while dashboard is open
```

### 10.6 Dashboard Data Model (in-memory)

```js
// dashboard.js in-memory state
const state = {
  allData:       null,   // Map<normalizedUrl, NoteObject[]>
  filteredNotes: [],     // flat array, post-filter + post-sort, for "All Notes" view
  activeView:    'all',  // 'all' | 'bysite' | 'stats'
  search:        '',     // current search string
  colorFilters:  [],     // [] = all, or ['sunflower', 'sky', ...]
  sort:          'newest',
  multiSelect:   false,
  selectedIds:   new Set(),
  undoQueue:     [],     // stack of { note, url } for undo toasts
};
```

### 10.7 Dashboard Filter & Search Logic

```js
function applyFilters() {
  let flat = [];

  // Flatten all notes from all URLs into a single array with url attached
  for (const [url, notes] of state.allData) {
    for (const note of notes) {
      flat.push({ ...note, _url: url });
    }
  }

  // Color filter
  if (state.colorFilters.length > 0) {
    flat = flat.filter(n => state.colorFilters.includes(n.color));
  }

  // Search filter (content + URL)
  if (state.search.trim()) {
    const q = state.search.toLowerCase();
    flat = flat.filter(n =>
      n.content.toLowerCase().includes(q) ||
      n._url.toLowerCase().includes(q)
    );
  }

  // Sort
  switch (state.sort) {
    case 'oldest':       flat.sort((a, b) => a.createdAt - b.createdAt); break;
    case 'az':           flat.sort((a, b) => a.content.localeCompare(b.content)); break;
    case 'site':         flat.sort((a, b) => a._url.localeCompare(b._url)); break;
    case 'newest':
    default:             flat.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  state.filteredNotes = flat;
}
```

Calling `applyFilters()` followed by `renderNoteGrid(state.filteredNotes)` is the complete re-render cycle for the All Notes view. It runs on: search input, color filter toggle, sort change, storage change.

### 10.8 Dashboard Card Rendering

```js
function buildNoteCard(note) {
  const theme = colorThemes[note.color];
  const card  = document.createElement('article');
  card.className = 'ts-card';
  card.dataset.noteId = note.id;
  card.dataset.url    = note._url;

  // Inline styles for theme (no custom property injection needed — dashboard uses classes)
  card.style.setProperty('--card-header-bg', theme.headerBg);
  card.style.setProperty('--card-body-bg',   theme.bg);
  card.style.setProperty('--card-text',       theme.bodyText);
  card.style.setProperty('--card-border',     theme.headerBg + '40'); // 25% opacity

  // Content (safe: textContent only, never innerHTML for user data)
  const contentEl = card.querySelector('.ts-card-content');
  contentEl.textContent = note.content || '';

  // Search highlight (if search active)
  if (state.search.trim()) {
    highlightText(contentEl, state.search);
  }

  // Footer
  card.querySelector('.ts-card-site').textContent = new URL(note._url).hostname;
  card.querySelector('.ts-card-age').textContent  = relativeTime(note.updatedAt);

  // Multi-select checkbox
  const checkbox = card.querySelector('.ts-card-checkbox');
  checkbox.checked = state.selectedIds.has(note.id);

  return card;
}

function highlightText(el, query) {
  // Safe highlight: split textContent by query, wrap matches in <mark>
  const text  = el.textContent;
  const lower = text.toLowerCase();
  const q     = query.toLowerCase();
  let idx     = lower.indexOf(q);
  if (idx === -1) return;

  const frag = document.createDocumentFragment();
  let last = 0;
  while (idx !== -1) {
    frag.appendChild(document.createTextNode(text.slice(last, idx)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(idx, idx + q.length);
    frag.appendChild(mark);
    last = idx + q.length;
    idx  = lower.indexOf(q, last);
  }
  frag.appendChild(document.createTextNode(text.slice(last)));
  el.innerHTML = '';   // safe: el is a controlled content element
  el.appendChild(frag);
}
```

### 10.9 Dashboard Storage Change Listener

While the Dashboard is open, storage may change from content scripts on other tabs (user edited a note). The dashboard listens and reconciles:

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  for (const [key, { newValue }] of Object.entries(changes)) {
    if (!key.startsWith('tabstick::notes::')) continue;
    const url = key.replace('tabstick::notes::', '');

    if (!newValue || newValue.length === 0) {
      state.allData.delete(url);
    } else {
      state.allData.set(url, newValue.map(validateNote).filter(Boolean));
    }
  }

  // Re-apply filters and re-render current view
  applyFilters();
  rerenderCurrentView();
  updateSidebarCounts();
});
```

### 10.10 Dashboard Export Implementation

```js
function exportNotes(notes, format) {
  let content = '';
  let filename = '';
  let mimeType = '';
  const now = new Date().toISOString().slice(0, 10);

  // Group notes by URL
  const grouped = new Map();
  for (const note of notes) {
    if (!grouped.has(note._url)) grouped.set(note._url, []);
    grouped.get(note._url).push(note);
  }

  if (format === 'txt') {
    for (const [url, urlNotes] of grouped) {
      content += `== ${new URL(url).hostname + new URL(url).pathname} ==\n`;
      urlNotes.forEach((n, i) => {
        const date = new Date(n.createdAt).toLocaleDateString();
        content += `\n[Note ${i+1} — ${n.color.charAt(0).toUpperCase() + n.color.slice(1)} — Created ${date}]\n`;
        content += (n.content || '(empty)') + '\n';
      });
      content += '\n';
    }
    filename = `tabstick-export-${now}.txt`;
    mimeType = 'text/plain';

  } else if (format === 'md') {
    content = `# TabStick Export — ${new Date().toLocaleDateString()}\n\n`;
    for (const [url, urlNotes] of grouped) {
      content += `## ${new URL(url).hostname + new URL(url).pathname}\n\n`;
      urlNotes.forEach((n, i) => {
        const date = new Date(n.createdAt).toLocaleDateString();
        const color = n.color.charAt(0).toUpperCase() + n.color.slice(1);
        content += `### Note ${i+1} (${color} · ${date})\n`;
        content += (n.content || '_empty_') + '\n\n';
      });
    }
    filename = `tabstick-export-${now}.md`;
    mimeType = 'text/markdown';

  } else if (format === 'json') {
    const payload = {
      exported: new Date().toISOString(),
      version:  chrome.runtime.getManifest().version,
      notes: notes.map(n => ({
        url:       n._url,
        id:        n.id,
        color:     n.color,
        content:   n.content,
        pinned:    n.pinned,
        minimized: n.minimized,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
    };
    content  = JSON.stringify(payload, null, 2);
    filename = `tabstick-export-${now}.json`;
    mimeType = 'application/json';
  }

  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### 10.11 Dashboard Delete & Undo

```js
async function deleteNoteFromDashboard(noteId, noteUrl) {
  // Find the note in allData
  const urlNotes = state.allData.get(noteUrl) || [];
  const note     = urlNotes.find(n => n.id === noteId);
  if (!note) return;

  // Remove from in-memory state
  const updated = urlNotes.filter(n => n.id !== noteId);
  if (updated.length === 0) state.allData.delete(noteUrl);
  else state.allData.set(noteUrl, updated);

  // Animate card out
  const cardEl = document.querySelector(`[data-note-id="${noteId}"]`);
  if (cardEl) {
    cardEl.style.transition = 'opacity 180ms ease, transform 180ms ease';
    cardEl.style.opacity    = '0';
    cardEl.style.transform  = 'scale(0.92)';
    setTimeout(() => cardEl.remove(), 190);
  }

  // Push to undo queue
  const undoEntry = { note: { ...note }, url: noteUrl, committed: false };
  state.undoQueue.push(undoEntry);

  // Show undo toast
  showDashboardToast(`Note deleted`, () => {
    // Undo callback
    undoEntry.committed = false;
    const currentNotes  = state.allData.get(noteUrl) || [];
    currentNotes.push(undoEntry.note);
    state.allData.set(noteUrl, currentNotes);
    applyFilters();
    rerenderCurrentView();
    // Restore in storage
    Storage.saveNotes(noteUrl, currentNotes);
    // Restore in open tab (if any)
    notifyTabForUrl(noteUrl, { type: 'RESTORE_NOTE', note: undoEntry.note });
  }, () => {
    // Commit callback (after 4s, no undo)
    undoEntry.committed = true;
    Storage.saveNotes(noteUrl, state.allData.get(noteUrl) || []);
    notifyTabForUrl(noteUrl, { type: 'DELETE_NOTE', noteId: note.id });
  });

  // Re-render (card already removed from DOM above)
  applyFilters();
}

async function notifyTabForUrl(url, message) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && normalizeUrl(tab.url) === url) {
      chrome.tabs.sendMessage(tab.id, message, () => void chrome.runtime.lastError);
    }
  }
}
```

---

## 11. Background Service Worker

```js
// background/service-worker.js

// Import utils directly (service worker can't use content script files)
// Inline the normalizeUrl and storage helpers here, or duplicate the minimal logic.

// --- Badge updater ---

async function updateBadgeForTab(tabId, rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('http')) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  const url = normalizeUrl(rawUrl);
  try {
    const result = await chrome.storage.local.get([notesKey(url), metaKey(url)]);
    const notes  = result[notesKey(url)] || [];
    const meta   = result[metaKey(url)]  || { hidden: false };
    const count  = notes.length;

    if (count === 0) {
      chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const text  = count > 9 ? '9+' : String(count);
    const color = meta.hidden ? '#90A4AE' : '#F9A825';
    const tcolor = meta.hidden ? '#FFFFFF' : '#000000';

    chrome.action.setBadgeText({ text, tabId });
    chrome.action.setBadgeBackgroundColor({ color, tabId });
    chrome.action.setBadgeTextColor({ color: tcolor, tabId });
  } catch (err) {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// Trigger badge update when storage changes
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (tab?.id && tab?.url) {
    updateBadgeForTab(tab.id, tab.url);
  }
});

// Trigger badge update when the active tab changes
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.url) updateBadgeForTab(tabId, tab.url);
});

// Trigger badge update on navigation within a tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

// Handle keyboard command
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'create-note') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab?.id || !tab?.url?.startsWith('http')) return;
  chrome.tabs.sendMessage(tab.id, { type: 'CREATE_NOTE' }, () => {
    // Ignore chrome.runtime.lastError if content script not available
    void chrome.runtime.lastError;
  });
});
```

---

## 12. Message Passing Contract

### 12.1 Message Types

```typescript
// All messages sent TO the content script (from popup, dashboard, or background)
type InboundMessage =
  | { type: 'CREATE_NOTE' }
  | { type: 'DELETE_NOTE';       noteId: string }
  | { type: 'RESTORE_NOTE';      note: NoteObject }     // from dashboard undo
  | { type: 'CLEAR_NOTES' }
  | { type: 'TOGGLE_VISIBILITY'; hidden: boolean }
  | { type: 'UPDATE_NOTE';       noteId: string; changes: Partial<NoteObject> }  // from dashboard pin toggle
  | { type: 'GET_NOTE_COUNT' }

// All responses FROM the content script
type Response =
  | { success: true }
  | { success: false; error: string }
  | { count: number }   // for GET_NOTE_COUNT only
```

The `RESTORE_NOTE` message must be handled in `content.js`:
```js
case 'RESTORE_NOTE':
  NoteManager.undoDelete(msg.note);
  sendResponse({ success: true });
  break;

case 'UPDATE_NOTE':
  NoteManager.updateNote(msg.noteId, msg.changes);
  sendResponse({ success: true });
  break;
```

### 12.2 Error Handling in Popup

Always wrap `chrome.tabs.sendMessage` calls in `.catch(() => {})` or check `chrome.runtime.lastError`. The popup must function even when the content script fails to respond (e.g., the extension was just installed and the user hasn't refreshed the page yet). In that case, storage is updated directly by the popup, and the page will reflect the changes on next reload.

---

## 13. Interactions & Behaviors

| Interaction | Trigger | Result |
|---|---|---|
| Create note | Popup "+ Add Note" | Spawns new note at cascading position, textarea focused |
| Create note | `Alt+Shift+S` | Same as above |
| Edit note | Click note body | Textarea focuses, focus animation plays |
| Auto-save | Any keypress (500ms debounce) | Note saved, "✓ saved" indicator flashes |
| Change color | Click color dot | Cycles to next theme, CSS vars update with transition |
| Drag note | Mousedown on header, drag | Note lifts (scale + shadow), tracks cursor, clamped to viewport |
| Resize note | Drag bottom-right corner handle | Note resizes within min/max bounds |
| Bring to front | Click anywhere on note | Note gets highest z-index |
| Minimize | Click `─` | Note collapses to 36px header-only with animation |
| Restore | Click `□` (when minimized) | Note expands to full height with spring animation |
| Pin | Click pin icon | Note locks; no drag, resize, or editing |
| Unpin | Click pin icon again | Note unlocks |
| Delete | Click `✕` | Delete animation, 4s undo toast, then permanent |
| Undo delete | Click "Undo" in toast | Note restores exactly to prior state |
| Hide All | Popup "Hide All" | All notes hidden, badge turns grey |
| Show All | Popup "Show All" | All notes shown, badge turns orange |
| Clear All | Popup "Clear All" → confirm | All notes deleted permanently, storage cleared |
| Delete from popup | Click `[✕]` in popup list | That note removed from DOM and storage; popup stays open |
| Navigate (SPA) | URL changes without page reload | Old notes removed, new URL's notes loaded |
| Page reload | Refresh | Notes re-injected from storage |
| New tab, same URL | Open same URL in new tab | Same notes appear (URL-keyed storage) |

---

## 14. Edge Cases & Defensive Programming

### 14.1 Inaccessible Pages
Content scripts are not injected on `chrome://`, `chrome-extension://`, `about:`, `file://` (file requires extra permissions not requested), or the Chrome Web Store (`chrome.google.com/webstore`).

Detection in popup:
```js
function isAccessibleUrl(url) {
  return typeof url === 'string' &&
    (url.startsWith('http://') || url.startsWith('https://'));
}
```

Show the inaccessible state in popup. Do not attempt to `sendMessage`.

### 14.2 Note Position Clamping on Load
```js
function clampNotePosition(note) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    ...note,
    x: Math.max(0, Math.min(note.x, vw - note.width)),
    y: Math.max(0, Math.min(note.y, vh - 36)), // ensure at least header is visible
  };
}
```
Apply to every note during `NoteManager.init()`. Save corrected positions immediately.

### 14.3 SPA URL Change Detection
Listen for URL changes caused by `history.pushState` / `replaceState`:

```js
let lastUrl = normalizeUrl(window.location.href);

const urlObserver = new MutationObserver(debounce(() => {
  const newUrl = normalizeUrl(window.location.href);
  if (newUrl !== lastUrl) {
    lastUrl = newUrl;
    NoteManager.handleUrlChange(newUrl);
  }
}, 100));

urlObserver.observe(document, { subtree: true, childList: true });
```

Also intercept `popstate` events:
```js
window.addEventListener('popstate', () => {
  const newUrl = normalizeUrl(window.location.href);
  if (newUrl !== lastUrl) {
    lastUrl = newUrl;
    NoteManager.handleUrlChange(newUrl);
  }
});
```

### 14.4 Cross-Tab Sync (Same URL)
When the current tab becomes visible again (`document.visibilitychange` → `document.visibilityState === 'visible'`):

```js
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const freshNotes = await Storage.getNotes(NoteManager.currentUrl);
  // Add notes not in DOM
  for (const n of freshNotes) {
    if (!NoteManager.notes.has(n.id)) {
      NoteManager.notes.set(n.id, n);
      NoteManager.renderNote(n);
    }
  }
  // Remove notes deleted in other tabs
  for (const [id] of NoteManager.notes) {
    if (!freshNotes.find(n => n.id === id)) {
      NoteManager.deleteNote(id, { skipUndo: true });
    }
  }
});
```

### 14.5 Extension Context Invalidated
When the extension is updated while a content script is alive, all `chrome.runtime.*` calls fail with `"Extension context invalidated"`. Wrap all runtime calls:

```js
function safeRuntimeCall(fn) {
  try { fn(); }
  catch (err) {
    if (err.message.includes('Extension context invalidated')) {
      showReloadBanner(); // One-time banner: "TabStick updated — please refresh this page."
    }
  }
}
```

The reload banner is a simple `position: fixed`, `z-index: 2147483647`, `top: 0`, full-width amber bar. It is NOT a note. It does not use Shadow DOM. It can be dismissed by clicking an `✕`.

### 14.6 Malformed Stored Note Data
When loading notes from storage, validate each note object:

```js
function validateNote(raw) {
  if (typeof raw !== 'object' || !raw.id) return null;
  return {
    id:        typeof raw.id        === 'string'  ? raw.id        : generateNoteId(),
    x:         typeof raw.x        === 'number'   ? raw.x        : 100,
    y:         typeof raw.y        === 'number'   ? raw.y        : 100,
    width:     typeof raw.width    === 'number'   ? raw.width    : 240,
    height:    typeof raw.height   === 'number'   ? raw.height   : 180,
    color:     colorThemes[raw.color] ? raw.color : 'sunflower',
    rotation:  typeof raw.rotation === 'number'   ? raw.rotation : 0,
    content:   typeof raw.content  === 'string'   ? raw.content  : '',
    minimized: typeof raw.minimized === 'boolean' ? raw.minimized : false,
    pinned:    typeof raw.pinned   === 'boolean'  ? raw.pinned   : false,
    zIndex:    typeof raw.zIndex   === 'number'   ? raw.zIndex   : 0,
    createdAt: typeof raw.createdAt === 'number'  ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number'  ? raw.updatedAt : Date.now(),
  };
}
```

Invalid notes (fail `if (typeof raw !== 'object' || !raw.id)`) are silently skipped and logged to console.

### 14.7 Storage Quota
`chrome.storage.local` default: 5MB. Each note ≈ 500 bytes JSON. Practical limit ≈ 10,000 notes.
On write error: retry 3× with exponential backoff. On final failure: show an in-note error bar inside the Shadow DOM footer:
```
[ ⚠ Could not save — storage may be full ]
```
Color: amber background, dark text. Does not block editing.

### 14.8 Host Page CSS Interference
Shadow DOM provides full isolation. However, the host element (`ts-host`) itself is subject to host page styles. All critical host styles (`position`, `z-index`, `width`, `height`, `transform`, `pointer-events`) must be set as **inline styles** on the host element, not via stylesheet. This makes them immune to `!important` overrides from the host page.

### 14.9 Content Security Policy (CSP)
Some pages block external script/style resources. The Google Fonts `<link>` inside Shadow DOM may be blocked. In that case, the textarea will fall back to the browser's system cursive font. This is acceptable — the note remains fully functional. The extension must NOT inject `<script>` tags or `eval()` anything.

### 14.10 iframes
`all_frames: false` in manifest — content scripts never inject into iframes. Notes appear only once on the top-level page, regardless of how many iframes are embedded.

### 14.11 Very High Note Counts (20+)
If `notes.length > 20`, the popup shows an amber info line above the note list:
`"⚠ You have many notes on this page."`
No functionality is blocked. This is informational only.

---

## 15. Performance Constraints

| Concern | Constraint |
|---|---|
| Initial render | All notes visible within 150ms of `document_idle` |
| Storage reads | Single batched read per page load (one `chrome.storage.local.get` call) |
| Storage writes | Debounced 500ms. Never per-keypress. Full array replacement (one write per URL key). |
| Drag/resize | Zero layout reads during `mousemove`. Cache all measurements in `mousedown`. |
| `will-change` | Set only during active drag. Remove immediately on `mouseup`. |
| MutationObserver | Debounced 100ms handler. Disconnect before `handleUrlChange`, reconnect after. |
| 20+ note pages | Use `requestIdleCallback` to render off-screen notes in a second pass after initial visible-notes render. |
| Memory | Remove ALL event listeners when a note is deleted. Verify no closures retain DOM references. |
| Animations | CSS transitions preferred. WAAPI for height animations. No JS animation loops. |

---

## 16. Error Handling

| Scenario | Handling |
|---|---|
| `chrome.storage.local.get` fails | Log to console. Render page with empty notes. No error shown to user. |
| `chrome.storage.local.set` fails | Retry 3× with backoff. On final failure: in-note "Could not save" bar. |
| `chrome.tabs.sendMessage` fails | Catch `chrome.runtime.lastError`. Popup shows: "Could not connect. Try refreshing the page." |
| Extension context invalidated | Catch error. Show one-time page-level reload banner. |
| Malformed note data in storage | Skip note, log warning, continue with remaining notes. |
| URL normalization throws | Use raw URL as storage key. |
| Google Fonts fails to load | Textarea falls back to system cursive. No error shown. |
| Storage quota exceeded | Show in-note amber error bar after 3 retries. |
| Inaccessible page (popup) | Show inaccessible state, disable all buttons. |
| Content script not injected yet | Popup storage actions still work. DOM won't update until next page load. |

---

## 17. Non-Goals (v1)

These are explicitly out of scope. Do not implement or stub them.

- `chrome.storage.sync` — quota is 100KB, far too small for real note content.
- Rich text / markdown formatting.
- Note titles separate from body.
- Note tagging or categories.
- Reminders or date/time alarms.
- Global search across all pages.
- Note export (JSON, PDF, Markdown).
- Image or file attachments inside notes.
- Sharing notes between users.
- Custom note shapes.
- Real-time collaboration.
- Options / settings page.
- New Tab page override.
- Firefox or other browser support.

---

## 18. v2 Roadmap

In priority order:

1. **Note title field** — optional editable field at the top of the note body (one line, bold, Caveat 18px 600). Stored as `title: string` in the note object. Shown in popup note list instead of content preview.
2. **Keyboard shortcut configuration** — document the Chrome Extensions shortcuts page (`chrome://extensions/shortcuts`) in the popup's footer as a help link.
3. **Export notes** — popup button: "Export as .txt" or "Export as .md". Generates a file download with all notes for the current page.
4. **Options / Settings page** — `options_page` in manifest. Settings: default note color, default size, URL normalization mode (exact path vs. hostname-only), enable/disable rotation effect, font size (three choices).
5. **Global notes manager** — options page section listing all URLs with stored notes, note counts, and a per-site "Delete all" button. Also shows total storage used (bytes).
6. **Search** — from options page, search across all note content on all URLs.
7. **Note timestamps on hover** — `title` attribute on footer element: `"Created Jan 15 · Updated Jan 16"`.
8. **SPA hash-based routing** — optionally include URL hash in the storage key (user-configurable in settings) for apps that use `#/route` navigation.
9. **Keyboard navigation within note list** — arrow keys to move between notes in popup list.
10. **Minimap** — for pages with 10+ notes: a small draggable minimap panel showing all note positions relative to the viewport. Clicking a minimap dot scrolls/focuses that note.

---

## 19. Builder Notes & Implementation Rules

These rules are non-negotiable. Follow every one of them precisely.

### Architecture
1. **Manifest V3 only.** Do not use `background.scripts`, `browser_action`, or any MV2 API. Use `service_worker` and `action`.
2. **Shadow DOM for every note.** Use `attachShadow({ mode: 'open' })`. Do not inject notes as plain page DOM elements. Style isolation is mandatory.
3. **`position: fixed` for all note host elements.** Never `position: absolute`. Notes must remain visible regardless of page scroll.
4. **No iframes.** Notes are Shadow DOM elements attached directly to `document.body`.
5. **No ES module imports in content scripts.** Chrome content scripts do not support `import`/`export` at runtime without a bundler. Use plain `const`/`function` globals. Load files in the correct order via manifest `js` array.
6. **`utils/colorThemes.js` is the single source of truth** for all color data. Both popup and content scripts load this file. No color values are hardcoded elsewhere.
7. **No bundler required.** The extension must work as plain files loaded by Chrome's extension runtime. If the builder uses a bundler (e.g., esbuild), the output must still be plain JS files, not ES modules.

### DOM Rules
8. **Cache layout measurements before drag/resize begins.** Never call `getBoundingClientRect()`, `offsetWidth`, `offsetHeight`, or any layout-triggering property inside a `mousemove` handler.
9. **Clamp positions on both load and drag end.** A note's header must always be at least 36px visible within the viewport.
10. **`resize: none` on textarea.** The custom bottom-right handle is the only resize mechanism.
11. **`will-change: transform` only during active drag.** Add on `mousedown`, remove on `mouseup`. Do not set it statically on notes — it wastes GPU memory.
12. **Critical host styles as inline styles.** `position`, `z-index`, `width`, `height`, `transform`, `transform-origin`, `pointer-events` must all be inline styles on the host element, immune to host page CSS interference.

### Storage Rules
13. **All storage writes debounced to 500ms minimum.** Exception: note creation, deletion, and undo — these write immediately.
14. **One storage key per URL for all notes** (`tabstick::notes::${url}` → array). Do not use one key per note.
15. **Always handle `chrome.runtime.lastError`** in every storage callback. Wrap Promise-based calls in try/catch.
16. **Validate every note object loaded from storage** using the `validateNote()` function (see §14.6). Never trust raw storage data.

### Security Rules
17. **No `innerHTML` with user content.** The note's `content` field (user text) must never be set via `innerHTML`. Use `textarea.value = note.content` and `textNode.textContent = note.content` for any display. The grain filter SVG and note structure HTML (from `buildShadowHTML`) are safe because they are hardcoded templates, not user input.
18. **No `eval()`, `new Function()`, or dynamic script injection** of any kind.
19. **Verify message sender identity** in the content script message listener: `if (sender.id !== chrome.runtime.id) return;`.

### Accessibility Rules
20. **All ARIA attributes from §6.4 must be present.** Verify with Chrome DevTools accessibility tree.
21. **All icon buttons must have minimum 28×28px clickable area** regardless of visual icon size.
22. **`prefers-reduced-motion` check is mandatory.** Wrap all animation code in the check. No exceptions.
23. **Tab order within note header** must work: color dot → pin → minimize → close. All must be `tabindex="0"` within the Shadow DOM.

### Visual Rules
24. **Rotation angle stored in note object, never regenerated.** A note must show the same rotation on every page load.
25. **CSS custom properties (`--ts-*`) on `:host`** drive all theming. Child elements reference only vars, never hardcoded colors.
26. **Paper grain texture: SVG filter only.** No raster images for texture.
27. **No emoji as UI icons in the note header.** Use Unicode symbols or inline SVG. The pin can use a SVG icon. The color dot uses a CSS circle with border.
28. **Popup uses DM Sans.** Load it from Google Fonts in `popup.html` `<head>`. Shadow DOM loads both Caveat and DM Sans via a `<link>` inside the shadow root.

### Testing Checklist

Before considering the extension complete, manually verify every item:

**Core functionality:**
- [ ] Notes appear on a standard http/https page (e.g., `https://example.com`)
- [ ] Notes persist after browser restart
- [ ] Notes persist after tab close and reopen
- [ ] Notes persist after page refresh (F5)
- [ ] Multiple notes can be created on one page, each independent
- [ ] Each note has its own position, size, color, content, and rotation
- [ ] The rotation angle is the same on every load (not randomly regenerated)

**Note controls:**
- [ ] Drag works: note moves freely, stays within viewport
- [ ] Resize works: minimum 180×120px, maximum 600×500px
- [ ] Color cycling: 8 colors, cycles correctly, transitions smoothly
- [ ] Minimize: collapses to 36px, body hidden, width/position preserved
- [ ] Restore: expands back to full height with spring animation
- [ ] Pin: prevents drag, resize, and edit
- [ ] Unpin: restores all interactions
- [ ] Delete: plays exit animation, shows 4-second undo toast
- [ ] Undo delete: restores note at exact position and content
- [ ] Bring to front: clicking a note raises its z-index above others
- [ ] Focused state: note slightly scales up and shadow deepens

**Persistence:**
- [ ] Position, size, color, content, minimized, pinned states all persist
- [ ] `"✓ saved"` indicator appears briefly after typing stops

**Popup:**
- [ ] URL display is correct and truncated appropriately
- [ ] Note count is correct and uses singular/plural correctly
- [ ] "Add Note" creates a note and closes popup
- [ ] "Hide All" hides all notes, badge turns grey
- [ ] "Show All" shows all notes, badge turns orange
- [ ] Note list shows correct color dot and content preview
- [ ] Per-note delete in popup list removes from DOM and storage; popup stays open
- [ ] "Clear All" shows inline confirmation; Cancel works; Confirm deletes all
- [ ] Inaccessible page state: correct message shown, all buttons disabled

**Badge:**
- [ ] No badge when page has no notes
- [ ] Orange badge with count when notes visible
- [ ] Grey badge when notes hidden
- [ ] Badge shows `"9+"` when count > 9
- [ ] Badge updates when switching tabs

**Edge cases:**
- [ ] Notes do not render on `chrome://newtab` or any `chrome://` page
- [ ] Popup shows inaccessible state on non-http pages
- [ ] SPA navigation: simulate with `history.pushState('/test', '', '/test')` in DevTools console — notes for new URL load correctly, old notes are removed
- [ ] Resize note, reload page — size is restored correctly
- [ ] Drag note near viewport edge — note is clamped, never fully off-screen
- [ ] Notes in iframes: confirm notes do NOT appear inside iframe content
- [ ] `prefers-reduced-motion`: enable in OS settings, confirm no animations play
- [ ] ARIA: open DevTools > Accessibility tree, confirm all labels are present
- [ ] Keyboard shortcut `Alt+Shift+S`: creates note without opening popup

**Popup enhancements:**
- [ ] Popup is 360px wide, all sections render correctly
- [ ] Footer stats show correct total note count and site count
- [ ] Footer "Open Dashboard ↗" opens dashboard in new tab
- [ ] Sort dropdown: all 4 options work, selection persists after popup close/reopen
- [ ] Note list shows correct pin/minimize status icons on rows
- [ ] Note count in footer stays in sync after per-row deletes
- [ ] Empty state renders correctly (SVG + "Add your first note" link) when 0 notes
- [ ] Clear All inline confirm: Cancel reverts, Delete All closes popup
- [ ] "Hide All" toggles button label + icon without closing popup

**Dashboard — All Notes view:**
- [ ] Dashboard opens correctly in a new tab via popup "Open Dashboard" link
- [ ] All notes from all pages appear as cards in the masonry grid
- [ ] Cards show correct color header strip, content, site hostname, and relative time
- [ ] Cards have NO rotation (straight grid, unlike in-page notes which rotate)
- [ ] Search filters cards in real-time as user types (debounced 150ms)
- [ ] Search highlights matched text in card content with yellow `<mark>` styling
- [ ] Search by URL: typing a domain name filters to notes from that site
- [ ] Clear search (✕ button) restores all cards
- [ ] Color filter in sidebar: clicking "Sunflower" shows only Sunflower notes
- [ ] Multi-color filter: selecting "Sunflower" + "Sky" shows notes of both colors
- [ ] "All colors" resets color filter
- [ ] Sort by Newest / Oldest / A→Z / Site all reorder the card grid correctly
- [ ] Sidebar filter + sort selections persist across dashboard sessions
- [ ] Card hover: shadow deepens, card lifts 2px
- [ ] Card ↗ icon: opens the note's page URL in a new tab
- [ ] Card 📌 icon: toggles pinned state in storage and on open tab (if applicable)
- [ ] Card ✕ icon: deletes note, plays fade/scale exit animation, shows undo toast
- [ ] Dashboard undo toast: restores note card with fade-in, disappears after 4s
- [ ] Multiple rapid deletes: each toast runs its own 4s timer independently (stacked)
- [ ] Multi-select mode: "Select All" button activates it, checkboxes appear on cards
- [ ] Multi-select: selecting cards shows floating action bar with count
- [ ] "Delete Selected" in multi-select: confirms inline, deletes all selected
- [ ] "Export Selected" in multi-select: exports only selected notes
- [ ] Empty state (0 notes or 0 search results): illustration + message renders correctly

**Dashboard — By Site view:**
- [ ] All sites appear as separate collapsed/expanded groups
- [ ] Site group header shows correct hostname, note count, ↗ and ▾ buttons
- [ ] Clicking ▾ collapses/expands that site's cards with a height animation
- [ ] "Expand All" expands all groups simultaneously
- [ ] "Collapse All" collapses all groups simultaneously
- [ ] Sites sorted by most recently updated note (most active site first)
- [ ] Compact cards in this view show no URL footer (site is the header)
- [ ] Deleting all notes for a site: group fades out and is removed from list

**Dashboard — Stats view:**
- [ ] 4 stat cards render: Total Notes, Total Sites, This Week, Top Color
- [ ] Color distribution bars animate from 0 to final width on view load (staggered)
- [ ] Heatmap shows 30 days of activity; cells color correctly by note count
- [ ] Heatmap cell hover shows tooltip with date and count
- [ ] Most active sites list renders with correct proportional bar widths
- [ ] Pinned/minimized count pills show correct numbers
- [ ] Stats update if storage changes while dashboard is open

**Dashboard — Export:**
- [ ] Export ▾ dropdown appears with 3 format options
- [ ] .txt export: correct format with site headers and note blocks
- [ ] .md export: correct Markdown with ## site headers and ### note headers
- [ ] .json export: valid JSON with correct schema, pretty-printed
- [ ] File downloads with correct filename (tabstick-export-YYYY-MM-DD.ext)
- [ ] "Export Selected" only includes the selected notes

**Dashboard — Keyboard navigation:**
- [ ] Pressing `/` focuses the search bar
- [ ] `Escape` clears search (if text present) or exits multi-select
- [ ] `1`, `2`, `3` switch between All Notes, By Site, Stats views
- [ ] `Cmd/Ctrl + A` enters multi-select and selects all visible cards

**Dashboard — Sync & state:**
- [ ] Dashboard open + edit a note in another tab → card content updates in dashboard
- [ ] Dashboard open + add a new note in another tab → new card appears in dashboard
- [ ] Dashboard open + delete a note in another tab → card disappears from dashboard
- [ ] Loading skeleton appears briefly and is replaced by real cards
- [ ] First-use empty state (0 notes anywhere): corkboard illustration + intro message