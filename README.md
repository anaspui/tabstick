# TabStick

A lightweight Chrome extension (Manifest V3) for pinning persistent sticky notes directly onto any webpage.

## Features

- **In-Page Sticky Notes:** Drag, resize, title, and color-theme notes across 8 paper palettes, saved per normalized URL.
- **Liquid Glass Mode:** Toggle translucent frosted-glass notes with live cross-tab synchronization.
- **Checklists:** Switch any note between freeform text and interactive checklists.
- **Pin & Minimize:** Lock note position and content against accidental edits, or collapse notes to their 36px header bar.
- **Undo & Safeguards:** Instant undo toast on note deletion, automatic viewport clamping, and SPA URL tracking.
- **Popup & Side Panel:** Quick-search all notes, toggle visibility, and group open/saved note tabs into a Chrome tab group.
- **Full Dashboard & Stats:** Manage notes across *All Notes*, *By Site*, and *Stats* views (30-day activity heatmap, color breakdown, multi-select delete/export).
- **Cross-Device Sync & Backup:** Optional `chrome.storage.sync` mirroring plus JSON, Markdown, and plain-text export/import.

## Keyboard Shortcuts

- `Alt + S` (or `Option + S` on Mac): Create a new sticky note on the active page.
- `Alt + A` (or `Option + A` on Mac): Show or hide all sticky notes on the active page.

## Installation (Unpacked)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the project root directory containing `manifest.json`.
5. Pin **TabStick** to your Chrome toolbar for quick access.

## License

MIT
