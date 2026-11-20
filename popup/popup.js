/**
 * Popup Script — Full behavior with all features.
 * Search, note list, export/import, glass mode, sync, explore, dashboard.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // ── DOM refs ──
  const versionEl       = document.getElementById('ts-version');
  const urlEl           = document.getElementById('ts-url');
  const countEl         = document.getElementById('ts-count');
  const pageSection     = document.getElementById('ts-page-section');
  const inaccessibleEl  = document.getElementById('ts-inaccessible');
  const actionsEl       = document.getElementById('ts-actions');
  const addNoteBtn      = document.getElementById('ts-add-note');
  const toggleVisBtn    = document.getElementById('ts-toggle-visibility');
  const exploreBtn      = document.getElementById('ts-explore');
  const clearAllBtn     = document.getElementById('ts-clear-all');
  const errorEl         = document.getElementById('ts-error');
  const noteListSection = document.getElementById('ts-note-list-section');
  const noteListEl      = document.getElementById('ts-note-list');
  const searchInput     = document.getElementById('ts-search-input');
  const searchResults   = document.getElementById('ts-search-results');
  const toggleGlass     = document.getElementById('ts-toggle-glass');
  const toggleSync      = document.getElementById('ts-toggle-sync');
  const syncWarning     = document.getElementById('ts-sync-warning');
  const btnExport       = document.getElementById('ts-btn-export');
  const exportDropdown  = document.getElementById('ts-export-dropdown');
  const exportJson      = document.getElementById('ts-export-json');
  const exportMd        = document.getElementById('ts-export-md');
  const btnImport       = document.getElementById('ts-btn-import');
  const fileImport      = document.getElementById('ts-file-import');
  const dashboardBtn    = document.getElementById('ts-dashboard');

  let activeTab = null;
  let isHidden = false;
  let searchTimer = null;

  // ── Version ──
  try { versionEl.textContent = 'v' + chrome.runtime.getManifest().version; } catch {}

  // ── Get tab ──
  let tab;
  try {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = t;
    activeTab = t;
  } catch { return; }

  // ── Accessibility check ──
  const accessible = UrlUtils.isAccessibleUrl(tab?.url);
  if (!accessible) {
    pageSection.style.display = 'none';
    actionsEl.style.display = 'none';
    inaccessibleEl.style.display = 'block';
  }

  // ── Load data ──
  let currentUrl, notes, meta;
  if (accessible) {
    currentUrl = UrlUtils.normalizeUrl(tab.url);
    try {
      [notes, meta] = await Promise.all([Storage.getNotes(currentUrl), Storage.getMeta(currentUrl)]);
    } catch { notes = []; meta = { hidden: false, noteCount: 0 }; }

    urlEl.textContent = UrlUtils.formatUrlDisplay(tab.url);
    _updateCount(notes.length);
    isHidden = meta.hidden;
    toggleVisBtn.textContent = isHidden ? 'Show Notes' : 'Hide Notes';

    // Check content script readiness
    const isReady = await _checkContentScript(tab.id);
    if (!isReady) {
      errorEl.textContent = 'Please refresh the page to use TabStick here.';
      errorEl.style.display = 'block';
      actionsEl.style.opacity = '0.5';
      actionsEl.style.pointerEvents = 'none';
    }

    // Note list
    if (notes.length > 0) {
      noteListSection.style.display = 'block';
      _renderNoteList(notes);
    }
  }

  // ══════════════════════════════
  // ── Actions ──
  // ══════════════════════════════

  addNoteBtn.addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'CREATE_NOTE' });
      _updateCount((notes?.length || 0) + 1);
    } catch (e) { console.error('Failed to add note:', e); }
  });

  toggleVisBtn.addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_NOTES' });
      isHidden = !isHidden;
      toggleVisBtn.textContent = isHidden ? 'Show Notes' : 'Hide Notes';
    } catch (e) { console.error('Failed to toggle:', e); }
  });

  clearAllBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all notes on this page?')) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_NOTES' });
        _updateCount(0);
        noteListSection.style.display = 'none';
      } catch (e) { console.error('Failed to clear:', e); }
    }
  });

  // ── Explore (side panel) ──
  exploreBtn.addEventListener('click', async () => {
    try {
      const windowInfo = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: windowInfo.id });
      window.close();
    } catch (e) { console.error('Failed to open side panel:', e); }
  });

  // ── Dashboard ──
  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    window.close();
  });

  // ══════════════════════════════
  // ── Search ──
  // ══════════════════════════════

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) { searchResults.style.display = 'none'; searchResults.innerHTML = ''; return; }
    searchTimer = setTimeout(() => _runSearch(q), 300);
  });

  async function _runSearch(query) {
    const all = await chrome.storage.local.get(null);
    const results = [];
    const q = query.toLowerCase();
    for (const [key, notesList] of Object.entries(all)) {
      if (!key.startsWith(Storage.NOTES_PREFIX)) continue;
      const url = key.replace(Storage.NOTES_PREFIX, '');
      for (const note of notesList) {
        const titleText = note.title || '';
        const contentText = note.content || '';
        if (`${titleText} ${contentText}`.toLowerCase().includes(q)) {
          results.push({ url, note, titleText, contentText });
        }
      }
    }
    _renderSearchResults(results, query);
  }

  function _renderSearchResults(results, query) {
    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchResults.style.display = 'block';
      searchResults.innerHTML = `<div style="text-align:center;color:var(--text-secondary);font-size:13px;padding:12px;">No results found</div>`;
      return;
    }
    searchResults.style.display = 'flex';
    results.forEach(({ url, note, titleText, contentText }) => {
      const item = document.createElement('div');
      item.className = 'ts-search-result';
      const theme = ColorThemes.getTheme(note.color);
      const title = titleText || contentText.substring(0, 30) || 'Untitled';
      const snippet = contentText.substring(0, 100);
      item.innerHTML = `
        <div class="ts-search-result-title">
          <span class="ts-color-indicator" style="background:${theme.headerBg}"></span>
          ${_highlight(title, query)}
        </div>
        <div class="ts-search-result-url">${_escHtml(url)}</div>
        <div class="ts-search-result-snippet">${_highlight(snippet, query)}</div>
        <div class="ts-search-result-go">Go →</div>
      `;
      item.addEventListener('click', () => { chrome.tabs.update({ url }); window.close(); });
      searchResults.appendChild(item);
    });
  }

  // ══════════════════════════════
  // ── Export / Import ──
  // ══════════════════════════════

  btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.style.display = exportDropdown.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { exportDropdown.style.display = 'none'; });

  exportJson.addEventListener('click', async () => {
    exportDropdown.style.display = 'none';
    try {
      const allData = await chrome.storage.local.get(null);
      const urls = {};
      for (const [key, val] of Object.entries(allData)) {
        if (!key.startsWith(Storage.NOTES_PREFIX)) continue;
        urls[key.replace(Storage.NOTES_PREFIX, '')] = val;
      }
      _download(JSON.stringify({ exported_at: new Date().toISOString(), version: 2, urls }, null, 2), 'tabstick-export.json', 'application/json');
    } catch (e) { console.error('Export failed:', e); }
  });

  exportMd.addEventListener('click', async () => {
    exportDropdown.style.display = 'none';
    try {
      const allData = await chrome.storage.local.get(null);
      let md = `# TabStick Export\nExported: ${new Date().toLocaleString()}\n\n---\n\n`;
      for (const [key, notesList] of Object.entries(allData)) {
        if (!key.startsWith(Storage.NOTES_PREFIX)) continue;
        const url = key.replace(Storage.NOTES_PREFIX, '');
        md += `## ${url}\n\n`;
        for (const note of notesList) {
          const title = note.title || 'Untitled';
          const created = note.createdAt ? new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
          const edited = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
          md += `### ${title}\n> Created ${created} · Edited ${edited}\n\n${note.content || ''}\n\n`;
        }
        md += `---\n\n`;
      }
      _download(md, 'tabstick-export.md', 'text/markdown');
    } catch (e) { console.error('Export failed:', e); }
  });

  btnImport.addEventListener('click', () => fileImport.click());
  fileImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.version === 2 && data.urls) {
          const flat = {};
          for (const [url, notesList] of Object.entries(data.urls)) flat[`${Storage.NOTES_PREFIX}${url}`] = notesList;
          await Storage.importData(flat);
        } else {
          // Try importing old format too
          const migrated = {};
          for (const [key, val] of Object.entries(data)) {
            if (key.startsWith('notes::')) migrated[`${Storage.NOTES_PREFIX}${key.replace('notes::', '')}`] = val;
            else if (key.startsWith(Storage.NOTES_PREFIX)) migrated[key] = val;
          }
          await Storage.importData(migrated);
        }
        alert('Data imported successfully!');
        window.close();
      } catch (err) { alert('Failed to import: ' + err.message); }
      fileImport.value = '';
    };
    reader.readAsText(file);
  });

  // ══════════════════════════════
  // ── Glass Mode ──
  // ══════════════════════════════

  const isGlass = await Storage.getGlassMode();
  toggleGlass.checked = isGlass;
  toggleGlass.addEventListener('change', async (e) => {
    await Storage.setGlassMode(e.target.checked);
    try { await chrome.tabs.sendMessage(tab.id, { action: 'SET_GLASS_MODE', value: e.target.checked }); } catch {}
  });

  // ══════════════════════════════
  // ── Sync Toggle ──
  // ══════════════════════════════

  const { syncEnabled } = await chrome.storage.local.get('syncEnabled');
  toggleSync.checked = !!syncEnabled;
  syncWarning.style.display = syncEnabled ? 'block' : 'none';

  toggleSync.addEventListener('change', async (e) => {
    const enable = e.target.checked;
    syncWarning.style.display = enable ? 'block' : 'none';
    if (enable) {
      const all = await chrome.storage.local.get(null);
      const noteKeys = {};
      let totalSize = 0;
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith(Storage.NOTES_PREFIX)) { noteKeys[k] = v; totalSize += JSON.stringify(v).length; }
      }
      if (totalSize > 80000) alert("⚠️ Your notes exceed 80KB. Some may not sync due to Chrome's 102KB limit.");
      try { await chrome.storage.sync.set(noteKeys); } catch (err) {
        alert('Failed to enable sync: ' + err.message);
        e.target.checked = false; syncWarning.style.display = 'none'; return;
      }
    } else {
      try {
        const syncData = await chrome.storage.sync.get(null);
        const noteKeys = {};
        for (const [k, v] of Object.entries(syncData)) { if (k.startsWith(Storage.NOTES_PREFIX)) noteKeys[k] = v; }
        await chrome.storage.local.set(noteKeys);
      } catch (err) { console.error('Failed to migrate from sync:', err); }
    }
    await chrome.storage.local.set({ syncEnabled: enable });
  });

  // ══════════════════════════════
  // ── Helpers ──
  // ══════════════════════════════

  function _renderNoteList(notesList) {
    noteListEl.innerHTML = '';
    notesList.forEach(note => {
      const row = document.createElement('div');
      row.className = 'ts-note-row';
      const dot = document.createElement('span');
      dot.className = 'ts-note-row-dot';
      dot.style.background = ColorThemes.getTheme(note.color).headerBg;
      const text = document.createElement('span');
      const label = note.title || (note.content || '').replace(/\n/g, ' ').trim();
      if (label) {
        text.className = 'ts-note-row-text';
        text.textContent = label.length > 35 ? label.slice(0, 35) + '…' : label;
      } else {
        text.className = 'ts-note-row-text ts-empty';
        text.textContent = '(empty note)';
      }
      const delBtn = document.createElement('button');
      delBtn.className = 'ts-note-row-delete';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        row.style.transition = 'height 200ms ease, opacity 200ms ease';
        row.style.height = '0'; row.style.opacity = '0'; row.style.overflow = 'hidden';
        setTimeout(() => row.remove(), 200);
        notes = notes.filter(n => n.id !== note.id);
        await Storage.saveNotes(currentUrl, notes);
        await Storage.saveMeta(currentUrl, { ...meta, noteCount: notes.length });
        try { await chrome.tabs.sendMessage(tab.id, { type: 'DELETE_NOTE', noteId: note.id }); } catch {}
        _updateCount(notes.length);
        if (notes.length === 0) noteListSection.style.display = 'none';
      });
      row.appendChild(dot); row.appendChild(text); row.appendChild(delBtn);
      noteListEl.appendChild(row);
    });
  }

  function _updateCount(count) {
    if (!countEl) return;
    countEl.textContent = count === 0 ? 'No notes yet on this page' : count === 1 ? '1 note on this page' : `${count} notes on this page`;
  }

  function _download(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function _highlight(text, query) {
    if (!query) return _escHtml(text);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return _escHtml(text);
    return _escHtml(text.substring(0, idx)) + '<mark>' + _escHtml(text.substring(idx, idx + query.length)) + '</mark>' + _escHtml(text.substring(idx + query.length));
  }

  function _escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async function _checkContentScript(tabId) {
    try { const res = await chrome.tabs.sendMessage(tabId, { action: 'GET_COUNT' }); return res && res.success; } catch { return false; }
  }
});
