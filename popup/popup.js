/**
 * Popup Script — Full behavior with all features.
 * Search, note list, export/import, glass mode, sync, explore, dashboard.
 */

const CONTENT_CSS = ['content/content.css'];
const CONTENT_SCRIPTS = [
  'utils/colorThemes.js',
  'utils/storage.js',
  'utils/urlUtils.js',
  'utils/idUtils.js',
  'content/toastManager.js',
  'content/dragHandler.js',
  'content/resizeHandler.js',
  'content/noteRenderer.js',
  'content/noteManager.js',
  'content/content.js',
];

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
  const clearConfirmEl  = document.getElementById('ts-clear-confirm');
  const clearCancelBtn  = document.getElementById('ts-clear-cancel');
  const clearConfirmBtn = document.getElementById('ts-clear-confirm-btn');
  const errorEl         = document.getElementById('ts-error');
  const statusEl        = document.getElementById('ts-status');
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

  let isHidden = false;
  let searchTimer = null;
  let statusTimer = null;
  let contentScriptReady = false;
  let currentUrl = '';
  let notes = [];
  let meta = { hidden: false, noteCount: 0 };

  // ── Version ──
  try { versionEl.textContent = 'v' + chrome.runtime.getManifest().version; } catch {}

  // ── Glass Mode (attach immediately before tab/script checks) ──
  const isGlass = await Storage.getGlassMode();
  toggleGlass.checked = isGlass;
  toggleGlass.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
      await Storage.setGlassMode(enabled);
      try {
        const allTabs = await chrome.tabs.query({});
        for (const t of allTabs) {
          if (t?.id && UrlUtils.isAccessibleUrl(t.url)) {
            chrome.tabs.sendMessage(t.id, { action: 'SET_GLASS_MODE', value: enabled }).catch(() => {});
          }
        }
      } catch {}
    } catch (err) {
      console.error('Failed to update glass mode:', err);
      _showStatus('Could not save Liquid Glass setting.', 'error');
    }
  });

  // ── Get tab ──
  let tab;
  try {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = t;
  } catch { return; }

  // ── Accessibility check ──
  const accessible = UrlUtils.isAccessibleUrl(tab?.url);
  if (!accessible) {
    pageSection.style.display = 'none';
    actionsEl.style.display = 'none';
    inaccessibleEl.style.display = 'block';
  }

  async function _refreshCurrentPage() {
    if (!accessible) return;
    try {
      [notes, meta] = await Promise.all([
        Storage.getNotes(currentUrl),
        Storage.getMeta(currentUrl),
      ]);
    } catch {
      notes = [];
      meta = { hidden: false, noteCount: 0 };
    }

    _updateCount(notes.length);
    isHidden = Boolean(meta.hidden);
    toggleVisBtn.textContent = isHidden ? 'Show Notes' : 'Hide Notes';

    if (contentScriptReady) {
      toggleVisBtn.disabled = notes.length === 0;
      clearAllBtn.disabled = notes.length === 0;
    }

    if (notes.length > 0) {
      noteListSection.style.display = 'block';
      _renderNoteList(notes);
    } else {
      noteListSection.style.display = 'none';
      noteListEl.innerHTML = '';
      clearConfirmEl.style.display = 'none';
    }
  }

  // ── Load data ──
  if (accessible) {
    currentUrl = UrlUtils.normalizeUrl(tab.url);
    urlEl.textContent = UrlUtils.formatUrlDisplay(tab.url);

    contentScriptReady = await _ensureContentScript(tab.id);
    if (!contentScriptReady) {
      errorEl.textContent = 'Please refresh the page to use TabStick here.';
      errorEl.style.display = 'block';
      addNoteBtn.disabled = true;
      toggleVisBtn.disabled = true;
      clearAllBtn.disabled = true;
    }

    await _refreshCurrentPage();
  }

  // ── Live storage listener ──
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Storage.GLASS_KEY in changes) {
      toggleGlass.checked = Boolean(changes[Storage.GLASS_KEY].newValue);
    }
    if (accessible && currentUrl) {
      const nKey = Storage.notesKey(currentUrl);
      const mKey = Storage.metaKey(currentUrl);
      if (nKey in changes || mKey in changes) {
        _refreshCurrentPage();
      }
    }
  });

  // ══════════════════════════════
  // ── Actions ──
  // ══════════════════════════════

  addNoteBtn.addEventListener('click', async () => {
    if (!accessible || !contentScriptReady) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'CREATE_NOTE' });
      await _refreshCurrentPage();
    } catch (e) {
      console.error('Failed to add note:', e);
      _showStatus('Could not create note on this page.', 'error');
    }
  });

  toggleVisBtn.addEventListener('click', async () => {
    if (!accessible || !contentScriptReady || notes.length === 0) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_NOTES' });
      isHidden = !isHidden;
      toggleVisBtn.textContent = isHidden ? 'Show Notes' : 'Hide Notes';
    } catch (e) {
      console.error('Failed to toggle:', e);
      _showStatus('Could not toggle note visibility.', 'error');
    }
  });

  clearAllBtn.addEventListener('click', () => {
    if (!accessible || !contentScriptReady || notes.length === 0) return;
    clearConfirmEl.style.display = clearConfirmEl.style.display === 'none' ? 'flex' : 'none';
  });

  clearCancelBtn.addEventListener('click', () => {
    clearConfirmEl.style.display = 'none';
  });

  clearConfirmBtn.addEventListener('click', async () => {
    clearConfirmEl.style.display = 'none';
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_NOTES' });
      notes = [];
      await _refreshCurrentPage();
    } catch (e) {
      console.error('Failed to clear:', e);
      _showStatus('Could not clear notes.', 'error');
    }
  });

  // ── Explore (side panel) ──
  exploreBtn.addEventListener('click', async () => {
    try {
      const windowInfo = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: windowInfo.id });
      window.close();
    } catch (e) {
      console.error('Failed to open side panel:', e);
      _showStatus('Unable to open side panel.', 'error');
    }
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
      if (!key.startsWith(Storage.NOTES_PREFIX) || !Array.isArray(notesList)) continue;
      const url = key.replace(Storage.NOTES_PREFIX, '');
      for (const note of notesList) {
        const titleText = note.title || '';
        const contentText = note.content || '';
        if (`${titleText} ${contentText} ${url}`.toLowerCase().includes(q)) {
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
      item.addEventListener('click', () => {
        if (UrlUtils.isAccessibleUrl(url)) {
          chrome.tabs.update({ url });
          window.close();
        }
      });
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
      const allData = await Storage.getAllData();
      const urls = {};
      for (const [key, val] of Object.entries(allData)) {
        urls[key.replace(Storage.NOTES_PREFIX, '')] = val;
      }
      _download(
        JSON.stringify({ exported_at: new Date().toISOString(), version: 2, urls }, null, 2),
        'tabstick-export.json',
        'application/json'
      );
    } catch (e) {
      console.error('Export failed:', e);
      _showStatus('Export failed.', 'error');
    }
  });

  exportMd.addEventListener('click', async () => {
    exportDropdown.style.display = 'none';
    try {
      const allData = await Storage.getAllData();
      let md = `# TabStick Export\nExported: ${new Date().toLocaleString()}\n\n---\n\n`;
      for (const [key, notesList] of Object.entries(allData)) {
        if (!Array.isArray(notesList) || notesList.length === 0) continue;
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
    } catch (e) {
      console.error('Export failed:', e);
      _showStatus('Export failed.', 'error');
    }
  });

  btnImport.addEventListener('click', () => fileImport.click());
  fileImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const flat = {};
        if (data && data.version === 2 && data.urls && typeof data.urls === 'object') {
          for (const [url, notesList] of Object.entries(data.urls)) {
            flat[`${Storage.NOTES_PREFIX}${url}`] = notesList;
          }
        } else if (data && typeof data === 'object') {
          for (const [key, val] of Object.entries(data)) {
            if (key.startsWith('notes::')) flat[`${Storage.NOTES_PREFIX}${key.replace('notes::', '')}`] = val;
            else if (key.startsWith(Storage.NOTES_PREFIX)) flat[key] = val;
          }
        }
        const { urlCount, noteCount } = await Storage.importData(flat);
        _showStatus(`Imported ${noteCount} note${noteCount === 1 ? '' : 's'} across ${urlCount} page${urlCount === 1 ? '' : 's'}.`, 'success');
        await _refreshCurrentPage();
      } catch (err) {
        _showStatus('Import failed: ' + err.message, 'error');
      } finally {
        fileImport.value = '';
      }
    };
    reader.readAsText(file);
  });

  // ══════════════════════════════
  // ── Sync Toggle ──
  // ══════════════════════════════

  const syncEnabled = await Storage.getSyncEnabled();
  if (syncWarning) {
    syncWarning.style.display = syncEnabled ? 'block' : 'none';
  }
  if (toggleSync) {
    toggleSync.checked = syncEnabled;
    toggleSync.addEventListener('change', async (e) => {
      const enable = e.target.checked;
      if (syncWarning) {
        syncWarning.style.display = enable ? 'block' : 'none';
      }
      if (enable) {
        try {
          const [allLocal, allSync] = await Promise.all([
            chrome.storage.local.get(null),
            chrome.storage.sync.get(null),
          ]);

          const localUpdates = {};
          const mergedNoteKeys = {};

          for (const [k, v] of Object.entries(allLocal)) {
            if (k.startsWith(Storage.NOTES_PREFIX) && Array.isArray(v) && v.length > 0) {
              mergedNoteKeys[k] = v;
            }
          }

          // Pull remote URLs that don't yet exist locally
          for (const [k, v] of Object.entries(allSync)) {
            if (k.startsWith(Storage.NOTES_PREFIX) && Array.isArray(v) && v.length > 0 && !(k in mergedNoteKeys)) {
              mergedNoteKeys[k] = v;
              localUpdates[k] = v;
              const url = k.slice(Storage.NOTES_PREFIX.length);
              localUpdates[Storage.metaKey(url)] = { hidden: false, noteCount: v.length };
            }
          }

          let totalSize = 0;
          for (const v of Object.values(mergedNoteKeys)) {
            totalSize += JSON.stringify(v).length;
          }
          if (totalSize > 80000) {
            _showStatus('Notes exceed 80KB; some items may exceed Chrome sync quota.', 'warning');
          }

          if (Object.keys(localUpdates).length > 0) {
            await chrome.storage.local.set(localUpdates);
          }
          if (Object.keys(mergedNoteKeys).length > 0) {
            await chrome.storage.sync.set(mergedNoteKeys);
          }
          await Storage.setSyncEnabled(true);
          await _refreshCurrentPage();
        } catch (err) {
          e.target.checked = false;
          if (syncWarning) {
            syncWarning.style.display = 'none';
          }
          _showStatus('Failed to enable sync: ' + err.message, 'error');
        }
      } else {
        try {
          const [allLocal, syncData] = await Promise.all([
            chrome.storage.local.get(null),
            chrome.storage.sync.get(null),
          ]);
          const localRestore = {};
          for (const [k, v] of Object.entries(syncData)) {
            if (k.startsWith(Storage.NOTES_PREFIX) && Array.isArray(v) && v.length > 0 && !(k in allLocal)) {
              localRestore[k] = v;
              const url = k.slice(Storage.NOTES_PREFIX.length);
              localRestore[Storage.metaKey(url)] = { hidden: false, noteCount: v.length };
            }
          }
          if (Object.keys(localRestore).length > 0) {
            await chrome.storage.local.set(localRestore);
          }
          await Storage.setSyncEnabled(false);
        } catch (err) {
          console.error('Failed to disable sync cleanly:', err);
        }
      }
    });
  }

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
      delBtn.title = 'Delete note';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (delBtn.disabled) return;
        delBtn.disabled = true;
        row.style.transition = 'height 200ms ease, opacity 200ms ease';
        row.style.height = '0'; row.style.opacity = '0'; row.style.overflow = 'hidden';
        setTimeout(() => row.remove(), 200);
        const latest = await Storage.getNotes(currentUrl);
        notes = latest.filter(n => n.id !== note.id);
        await Storage.saveNotesWithMeta(
          currentUrl,
          notes,
          notes.length > 0 ? { ...meta, noteCount: notes.length } : null
        );
        try { await chrome.tabs.sendMessage(tab.id, { type: 'DELETE_NOTE', noteId: note.id, skipSave: true }); } catch {}
        await _refreshCurrentPage();
      });
      row.appendChild(dot); row.appendChild(text); row.appendChild(delBtn);
      noteListEl.appendChild(row);
    });
  }

  function _updateCount(count) {
    if (!countEl) return;
    countEl.textContent = count === 0 ? 'No notes yet on this page' : count === 1 ? '1 note on this page' : `${count} notes on this page`;
  }

  function _showStatus(msg, type = 'success') {
    if (!statusEl) return;
    clearTimeout(statusTimer);
    statusEl.className = `ts-popup-status ts-status-${type}`;
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
    statusTimer = setTimeout(() => {
      statusEl.style.display = 'none';
    }, 4000);
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

  function _escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function _checkContentScript(tabId) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'GET_COUNT' });
      return Boolean(res && res.success);
    } catch {
      return false;
    }
  }

  async function _ensureContentScript(tabId) {
    if (await _checkContentScript(tabId)) return true;
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: CONTENT_CSS });
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS });
      return await _checkContentScript(tabId);
    } catch {
      return false;
    }
  }
});
