const THEME_COLORS = {
  sunflower: '#FFF9C4', peach: '#FFE0B2', mint: '#DCEDC8',
  sky: '#E1F5FE', lavender: '#EDE7F6', rose: '#FCE4EC',
  slate: '#ECEFF1', cream: '#FFFDE7', snow: '#FAFAFA'
};

let allNotes = {}; // { url: [notes] }
let activeColorFilters = new Set();
let activeSort = 'newest';
let currentView = 'all-notes';
let selectedNoteIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllNotes();
  setupViewTabs();
  setupKeyboardShortcuts();
  setupSearch();
  setupFilterDropdown();
  setupExportDropdown();
  switchView(currentView);

  // Real-time sync
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local') {
      let needsUpdate = false;
      for (const [key, change] of Object.entries(changes)) {
        if (key.startsWith(Storage.NOTES_PREFIX)) {
          needsUpdate = true;
          const url = key.replace(Storage.NOTES_PREFIX, '');
          if (change.newValue && change.newValue.length > 0) {
            allNotes[url] = change.newValue;
          } else {
            delete allNotes[url];
          }
        }
      }
      if (needsUpdate) {
        switchView(currentView);
      }
    }
  });
});

function setupViewTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.view);
    });
  });
}

function switchView(viewId) {
  currentView = viewId;
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewId);
  });
  document.querySelectorAll('.view-container').forEach(container => {
    container.classList.toggle('active', container.id === `view-${viewId}`);
  });
  
  // Clear selection when switching views
  selectedNoteIds.clear();
  updateMultiSelectUI();

  // Re-render based on view
  const q = document.getElementById('search').value.trim();
  if (viewId === 'all-notes') renderAllNotes(q);
  else if (viewId === 'by-site') renderBySite(q);
  else if (viewId === 'stats') renderStats();
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.target.blur();
        e.target.value = '';
        e.target.dispatchEvent(new Event('input'));
      }
      return;
    }

    if (e.key === '1') switchView('all-notes');
    if (e.key === '2') switchView('by-site');
    if (e.key === '3') switchView('stats');
    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('search').focus();
    }
  });
}

async function loadAllNotes() {
  const skel = document.getElementById('loading-skeleton');
  const grid = document.getElementById('all-notes-grid');
  
  if (skel) skel.style.display = 'grid';
  if (grid) grid.style.display = 'none';

  const data = await Storage.getAllData();
  allNotes = {};
  for (const [key, notes] of Object.entries(data)) {
    if (!key.startsWith(Storage.NOTES_PREFIX)) continue;
    const url = key.replace(Storage.NOTES_PREFIX, '');
    allNotes[url] = notes;
  }
  
  // Fake a small delay to show off the skeleton (often storage is instant)
  await new Promise(r => setTimeout(r, 200));
  
  if (skel) skel.style.display = 'none';
  if (grid) grid.style.display = 'block';
}

function renderAllNotes(searchQuery = '') {
  const container = document.getElementById('all-notes-grid');
  const emptyState = document.getElementById('empty-state');
  container.innerHTML = '';
  
  let allFlatNotes = [];
  for (const url in allNotes) {
    allNotes[url].forEach(n => {
      allFlatNotes.push({ ...n, _url: url });
    });
  }

  // Filter
  const q = searchQuery.toLowerCase();
  if (activeColorFilters.size > 0) {
    allFlatNotes = allFlatNotes.filter(n => activeColorFilters.has(n.color));
  }
  if (q) {
    allFlatNotes = allFlatNotes.filter(n => {
      const text = `${n.title || ''} ${stripHtml(n.content || '')} ${n._url}`.toLowerCase();
      return text.includes(q);
    });
  }

  // Sort
  allFlatNotes.sort((a, b) => {
    if (activeSort === 'newest') return (b.updatedAt || 0) - (a.updatedAt || 0);
    if (activeSort === 'oldest') return (a.updatedAt || 0) - (b.updatedAt || 0);
    if (activeSort === 'az') return (a.title || '').localeCompare(b.title || '');
    if (activeSort === 'site') return a._url.localeCompare(b._url);
    return 0;
  });

  if (allFlatNotes.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  const grid = document.createElement('div');
  grid.className = 'card-grid';

  allFlatNotes.forEach(note => {
    const card = createNoteCard(note, note._url, q);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

function renderBySite(searchQuery = '') {
  const container = document.getElementById('by-site-list');
  const emptyState = document.getElementById('empty-state');
  container.innerHTML = '';

  const q = searchQuery.toLowerCase();

  // Sort URLs by most recently edited note
  const sortedUrls = Object.keys(allNotes).sort((a, b) => {
    const latestA = Math.max(...allNotes[a].map(n => n.updatedAt || 0));
    const latestB = Math.max(...allNotes[b].map(n => n.updatedAt || 0));
    return latestB - latestA;
  });

  let totalCards = 0;

  sortedUrls.forEach(url => {
    let notes = allNotes[url];

    // Filter
    if (activeColorFilters.size > 0) {
      notes = notes.filter(n => activeColorFilters.has(n.color));
    }
    if (q) {
      notes = notes.filter(n => {
        const text = `${n.title || ''} ${stripHtml(n.content || '')} ${url}`.toLowerCase();
        return text.includes(q);
      });
    }

    if (notes.length === 0) return;
    totalCards += notes.length;

    const group = document.createElement('div');
    group.className = 'url-group';

    const header = document.createElement('div');
    header.className = 'url-group-header';
    header.innerHTML = `
      <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      <span class="hostname">${escapeHtml(url)}</span>
      <span class="count-badge">${notes.length} note${notes.length !== 1 ? 's' : ''}</span>
      <div class="site-actions">
        <button class="site-action-btn" title="Open Site">↗</button>
        <button class="site-action-btn del" title="Delete All on Site">✕</button>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'url-group-body';

    const grid = document.createElement('div');
    grid.className = 'card-grid';

    notes.forEach(note => {
      const card = createNoteCard(note, url, q);
      card.classList.add('compact');
      grid.appendChild(card);
    });

    body.appendChild(grid);
    group.appendChild(header);
    group.appendChild(body);
    container.appendChild(group);

    // Accordion toggle
    header.addEventListener('click', (e) => {
      if (e.target.closest('.site-action-btn')) return;
      const isCollapsed = group.classList.toggle('collapsed');
      if (!isCollapsed) {
        body.style.height = body.scrollHeight + 'px';
        setTimeout(() => body.style.height = 'auto', 300);
      } else {
        body.style.height = body.scrollHeight + 'px';
        body.offsetHeight; // force reflow
        body.style.height = '0px';
      }
    });

    // Site actions
    header.querySelector('.site-action-btn[title="Open Site"]').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url });
    });

    header.querySelector('.site-action-btn.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      const oldNotes = [...allNotes[url]];
      group.style.opacity = '0';
      group.style.transform = 'scale(0.98)';
      setTimeout(() => group.remove(), 200);
      delete allNotes[url];
      
      showDashboardToast(`Deleted ${oldNotes.length} notes from site`, async () => {
        allNotes[url] = oldNotes;
        switchView(currentView);
      }, async () => {
        await Storage.deleteAllForUrl(url);
      });
    });
  });

  emptyState.style.display = totalCards === 0 ? 'block' : 'none';
}

function createNoteCard(note, url, q) {
  const card = document.createElement('div');
  const isPinned = note.pinned ? 'pinned' : '';
  card.className = `note-card ${isPinned}`;
  card.dataset.id = note.id;
  if (selectedNoteIds.has(note.id)) {
    card.classList.add('selected');
  }

  const bg = THEME_COLORS[note.color] || THEME_COLORS.sunflower;
  card.style.backgroundColor = bg;

  const title = note.title || 'Untitled';
  const content = stripHtml(note.content || '');
  const created = note.createdAt ? fmtDate(note.createdAt) : '';
  const edited = note.updatedAt ? fmtDate(note.updatedAt) : '';

  card.innerHTML = `
    <input type="checkbox" class="card-checkbox" ${selectedNoteIds.has(note.id) ? 'checked' : ''}>
    <div class="card-actions">
      <button class="card-action-btn btn-pin" aria-label="${note.pinned ? 'Unpin' : 'Pin'}" title="${note.pinned ? 'Unpin' : 'Pin'}">
        <svg viewBox="0 0 24 24" fill="${note.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"/><path d="M5 17h14"/><path d="M7 11l-2 6h14l-2-6"/></svg>
      </button>
      <button class="card-action-btn btn-del" aria-label="Delete" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="card-title">${q ? highlight(title, q) : escapeHtml(title)}</div>
    <div class="card-content">${q ? highlight(content, q) : escapeHtml(content)}</div>
    <div class="card-meta">
      <span>Created ${created} · Edited ${edited}</span>
      <button class="card-edit-btn" data-url="${escapeHtml(url)}">Edit →</button>
    </div>
  `;

  // Selection
  const checkbox = card.querySelector('.card-checkbox');
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) selectedNoteIds.add(note.id);
    else selectedNoteIds.delete(note.id);
    card.classList.toggle('selected', e.target.checked);
    updateMultiSelectUI();
  });

  // Pin
  card.querySelector('.btn-pin').addEventListener('click', async (e) => {
    e.stopPropagation();
    note.pinned = !note.pinned;
    // Update local storage
    const notes = allNotes[url];
    const idx = notes.findIndex(n => n.id === note.id);
    if (idx !== -1) notes[idx].pinned = note.pinned;
    await Storage.saveNotes(url, notes);
    renderAllNotes(document.getElementById('search').value.trim()); // Re-render to show updated pin state
  });

  // Delete
  card.querySelector('.btn-del').addEventListener('click', async (e) => {
    e.stopPropagation();
    
    // Optimistically remove from DOM
    card.style.opacity = '0';
    card.style.transform = 'scale(0.9)';
    setTimeout(() => {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 200);

    const snapshot = { ...note };
    const oldNotes = [...allNotes[url]];

    // Optimistically remove from in-memory state
    const newNotes = allNotes[url].filter(n => n.id !== note.id);
    allNotes[url] = newNotes;
    
    // Update Multi-select
    selectedNoteIds.delete(note.id);
    updateMultiSelectUI();

    showDashboardToast('Note deleted', async () => {
      // UNDO
      allNotes[url] = oldNotes;
      switchView(currentView); // re-render
    }, async () => {
      // CONFIRM DELETE
      if (newNotes.length === 0) await Storage.deleteAllForUrl(url);
      else await Storage.saveNotes(url, newNotes);
      
      if (newNotes.length > 0) {
        const meta = await Storage.getMeta(url);
        await Storage.saveMeta(url, { ...meta, noteCount: newNotes.length });
      }
    });
  });

  card.querySelector('.card-edit-btn').addEventListener('click', () => {
    chrome.tabs.create({ url });
  });
  
  return card;
}

let toastStack = [];

function showDashboardToast(message, onUndo, onConfirm) {
  const toastId = Date.now() + Math.random();
  const toast = document.createElement('div');
  toast.className = 'dashboard-toast';
  toast.innerHTML = `
    <span>${message}</span>
    <span style="opacity:0.5">·</span>
    <button class="toast-undo-btn">Undo</button>
    <div class="toast-progress"></div>
  `;
  
  document.body.appendChild(toast);
  
  // Stacking offset
  const offset = toastStack.length * 60;
  setTimeout(() => {
    toast.style.transform = `translateX(-50%) translateY(-${24 + offset}px)`;
    toast.style.opacity = '1';
  }, 10);
  
  toastStack.push({ id: toastId, el: toast });

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.style.opacity = '0';
    toast.style.transform = `translateX(-50%) translateY(20px)`;
    setTimeout(() => toast.remove(), 300);
    toastStack = toastStack.filter(t => t.id !== toastId);
    // Reposition remaining
    toastStack.forEach((t, i) => {
      t.el.style.transform = `translateX(-50%) translateY(-${24 + i * 60}px)`;
    });
  };

  toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
    dismiss();
    if (onUndo) onUndo();
  });

  timer = setTimeout(() => {
    dismiss();
    if (onConfirm) onConfirm();
  }, 4000);
}

function renderStats() {
  let totalNotes = 0;
  let totalSites = Object.keys(allNotes).length;
  let thisWeek = 0;
  let pinnedCount = 0;
  let minimizedCount = 0;
  const colorCounts = {};
  const siteCounts = [];
  const activityMap = {}; // YYYY-MM-DD -> count

  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  
  // Initialize last 30 days for heatmap
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    activityMap[key] = 0;
  }

  for (const [url, notes] of Object.entries(allNotes)) {
    totalNotes += notes.length;
    siteCounts.push({ url, count: notes.length });

    notes.forEach(n => {
      if (n.pinned) pinnedCount++;
      if (n.minimized) minimizedCount++;

      // Weekly
      if (n.updatedAt && (now - n.updatedAt < oneWeek)) thisWeek++;

      // Colors
      colorCounts[n.color] = (colorCounts[n.color] || 0) + 1;

      // Activity
      if (n.updatedAt) {
        const d = new Date(n.updatedAt);
        const key = d.toISOString().split('T')[0];
        if (activityMap[key] !== undefined) {
          activityMap[key]++;
        }
      }
    });
  }

  document.getElementById('stat-total-notes').textContent = totalNotes;
  document.getElementById('stat-total-sites').textContent = totalSites;
  document.getElementById('stat-this-week').textContent = thisWeek;
  document.getElementById('stat-pinned').textContent = pinnedCount;
  document.getElementById('stat-minimized').textContent = minimizedCount;

  // Top color
  let topColor = '-';
  let maxColor = 0;
  for (const [c, count] of Object.entries(colorCounts)) {
    if (count > maxColor) { maxColor = count; topColor = c; }
  }
  document.getElementById('stat-top-color').textContent = topColor.charAt(0).toUpperCase() + topColor.slice(1);

  // Heatmap
  const heatmapGrid = document.getElementById('heatmap-grid');
  heatmapGrid.innerHTML = '';
  const tooltip = document.getElementById('heatmap-tooltip');
  
  Object.entries(activityMap).forEach(([date, count]) => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    let opacity = 0.05;
    if (count > 0) {
      // Scale opacity roughly based on count (max out around 5 notes per day)
      opacity = Math.min(0.2 + (count * 0.15), 1);
      cell.style.backgroundColor = `rgba(245,158,11, ${opacity})`;
    }
    
    cell.addEventListener('mouseenter', (e) => {
      tooltip.textContent = `${count} note${count !== 1 ? 's' : ''} on ${date}`;
      const rect = cell.getBoundingClientRect();
      const parentRect = heatmapGrid.getBoundingClientRect();
      tooltip.style.left = (rect.left - parentRect.left + rect.width / 2) + 'px';
      tooltip.style.top = (rect.top - parentRect.top) + 'px';
      tooltip.style.opacity = '1';
    });
    cell.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });
    
    heatmapGrid.appendChild(cell);
  });

  // Color Distro
  const distroGrid = document.getElementById('color-distro');
  distroGrid.innerHTML = '';
  Object.entries(colorCounts).sort((a,b) => b[1] - a[1]).forEach(([color, count], idx) => {
    const row = document.createElement('div');
    row.className = 'color-bar-wrap';
    const pct = totalNotes > 0 ? (count / totalNotes * 100) : 0;
    row.innerHTML = `
      <div class="color-bar-label">${color}</div>
      <div class="color-bar-bg"><div class="color-bar-fill" style="background:${THEME_COLORS[color]}; transition-delay:${idx*0.1}s"></div></div>
      <div class="color-bar-val">${count}</div>
    `;
    distroGrid.appendChild(row);
    // Animate
    setTimeout(() => { row.querySelector('.color-bar-fill').style.width = pct + '%'; }, 50);
  });

  // Active Sites
  const activeList = document.getElementById('active-sites-list');
  activeList.innerHTML = '';
  siteCounts.sort((a,b) => b.count - a.count).slice(0, 5).forEach(site => {
    const row = document.createElement('div');
    row.className = 'site-row';
    const pct = siteCounts[0].count > 0 ? (site.count / siteCounts[0].count * 100) : 0;
    row.innerHTML = `
      <div class="site-row-name" title="${escapeHtml(site.url)}">${escapeHtml(site.url)}</div>
      <div class="site-row-bar-bg"><div class="site-row-bar-fill"></div></div>
      <div class="site-row-val">${site.count}</div>
    `;
    activeList.appendChild(row);
    setTimeout(() => { row.querySelector('.site-row-bar-fill').style.width = pct + '%'; }, 50);
  });
}

function updateMultiSelectUI() {
  const bar = document.getElementById('multi-action-bar');
  const countSpan = document.getElementById('multi-count');
  const main = document.querySelector('.main-content');
  const selectAllBtn = document.getElementById('select-all-btn');
  const expandAllBtn = document.getElementById('expand-all-btn');
  const collapseAllBtn = document.getElementById('collapse-all-btn');

  if (selectedNoteIds.size > 0) {
    bar.classList.add('visible');
    countSpan.textContent = `${selectedNoteIds.size} selected`;
    main.classList.add('multi-select-active');
  } else {
    bar.classList.remove('visible');
    main.classList.remove('multi-select-active');
  }

  // View specific toolbar buttons
  selectAllBtn.style.display = currentView === 'all-notes' ? 'inline-block' : 'none';
  expandAllBtn.style.display = currentView === 'by-site' ? 'inline-block' : 'none';
  collapseAllBtn.style.display = currentView === 'by-site' ? 'inline-block' : 'none';

  // Update Select All text
  if (currentView === 'all-notes') {
    const totalVisible = document.querySelectorAll('#all-notes-grid .note-card').length;
    if (totalVisible > 0 && selectedNoteIds.size === totalVisible) {
      selectAllBtn.textContent = 'Deselect All';
    } else {
      selectAllBtn.textContent = 'Select All';
    }
  }
}

function setupSearch() {
  const input = document.getElementById('search');
  const clearBtn = document.getElementById('clear-search-btn');
  let timer;
  input.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'flex' : 'none';
    clearTimeout(timer);
    timer = setTimeout(() => switchView(currentView), 300);
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    switchView(currentView);
  });
}

function setupFilterDropdown() {
  const btn = document.getElementById('filter-btn');
  const dropdown = document.getElementById('filter-dropdown');
  const sortBtn = document.getElementById('sort-btn');
  const sortDropdown = document.getElementById('sort-dropdown');
  const selectAllBtn = document.getElementById('select-all-btn');

  // Toggle Dropdowns
  const toggleDropdown = (trigger, drop, otherDrop) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
      if (otherDrop) otherDrop.style.display = 'none';
    });
  };
  toggleDropdown(btn, dropdown, sortDropdown);
  if (sortBtn) toggleDropdown(sortBtn, sortDropdown, dropdown);

  document.addEventListener('click', () => { 
    dropdown.style.display = 'none'; 
    if (sortDropdown) sortDropdown.style.display = 'none';
  });

  // Color Filter Logic
  dropdown.querySelectorAll('.filter-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation(); // keep dropdown open for multi-select
      const color = opt.dataset.color;
      
      if (color === 'all') {
        activeColorFilters.clear();
      } else {
        if (activeColorFilters.has(color)) activeColorFilters.delete(color);
        else activeColorFilters.add(color);
      }

      // Update UI
      dropdown.querySelectorAll('.filter-opt').forEach(o => {
        if (o.dataset.color === 'all') {
          o.classList.toggle('selected', activeColorFilters.size === 0);
        } else {
          o.classList.toggle('selected', activeColorFilters.has(o.dataset.color));
        }
      });

      if (activeColorFilters.size === 0) btn.textContent = 'Filter by color ▾';
      else if (activeColorFilters.size === 1) btn.textContent = `${[...activeColorFilters][0]} ▾`;
      else btn.textContent = `${activeColorFilters.size} colors ▾`;

      switchView(currentView);
    });
  });

  // Sort Logic
  if (sortDropdown) {
    sortDropdown.querySelectorAll('.sort-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        activeSort = opt.dataset.sort;
        sortBtn.textContent = `Sort: ${opt.textContent.trim()} ▾`;
        sortDropdown.style.display = 'none';
        switchView(currentView);
      });
    });
  }

  // Select All logic
  selectAllBtn.addEventListener('click', () => {
    const cards = document.querySelectorAll('#all-notes-grid .note-card');
    const isAllSelected = selectedNoteIds.size > 0 && selectedNoteIds.size === cards.length;
    
    if (isAllSelected) {
      selectedNoteIds.clear();
      document.querySelectorAll('.card-checkbox').forEach(cb => cb.checked = false);
      cards.forEach(c => c.classList.remove('selected'));
    } else {
      cards.forEach(c => {
        selectedNoteIds.add(c.dataset.id);
        c.classList.add('selected');
        c.querySelector('.card-checkbox').checked = true;
      });
    }
    updateMultiSelectUI();
  });

  // Multi-action listeners
  document.getElementById('multi-close-btn').addEventListener('click', () => {
    selectedNoteIds.clear();
    document.querySelectorAll('.card-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.note-card').forEach(c => c.classList.remove('selected'));
    updateMultiSelectUI();
  });

  document.getElementById('multi-delete-btn').addEventListener('click', async () => {
    // Delete all selected notes
    for (const id of selectedNoteIds) {
      // Find the URL for this note
      let urlKey = null;
      for (const url in allNotes) {
        if (allNotes[url].some(n => n.id === id)) {
          urlKey = url;
          break;
        }
      }
      if (urlKey) {
        const notes = allNotes[urlKey].filter(n => n.id !== id);
        allNotes[urlKey] = notes;
        if (notes.length === 0) await Storage.deleteAllForUrl(urlKey);
        else await Storage.saveNotes(urlKey, notes);
        
        if (notes.length > 0) {
          const meta = await Storage.getMeta(urlKey);
          await Storage.saveMeta(urlKey, { ...meta, noteCount: notes.length });
        }
      }
    }
    selectedNoteIds.clear();
    updateMultiSelectUI();
    switchView(currentView);
  });

  document.getElementById('multi-export-btn').addEventListener('click', () => {
    // Export selected notes as JSON
    const urls = {};
    for (const url in allNotes) {
      const selected = allNotes[url].filter(n => selectedNoteIds.has(n.id));
      if (selected.length > 0) urls[url] = selected;
    }
    const out = { exported_at: new Date().toISOString(), version: 2, urls };
    downloadFile(JSON.stringify(out, null, 2), 'tabstick-selected-export.json', 'application/json');
    
    // Clear selection
    selectedNoteIds.clear();
    document.querySelectorAll('.card-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.note-card').forEach(c => c.classList.remove('selected'));
    updateMultiSelectUI();
  });

  document.getElementById('expand-all-btn').addEventListener('click', () => {
    document.querySelectorAll('.url-group').forEach(group => {
      group.classList.remove('collapsed');
      const body = group.querySelector('.url-group-body');
      body.style.height = 'auto';
    });
  });

  document.getElementById('collapse-all-btn').addEventListener('click', () => {
    document.querySelectorAll('.url-group').forEach(group => {
      if (!group.classList.contains('collapsed')) {
        const body = group.querySelector('.url-group-body');
        body.style.height = body.scrollHeight + 'px';
        body.offsetHeight; // force reflow
        body.style.height = '0px';
        group.classList.add('collapsed');
      }
    });
  });
}

function setupExportDropdown() {
  const btn = document.getElementById('export-btn');
  const dropdown = document.getElementById('export-dropdown');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { dropdown.style.display = 'none'; });

  const getDateStr = () => formatDate(new Date());

  document.getElementById('export-json').addEventListener('click', async () => {
    dropdown.style.display = 'none';
    const data = await Storage.getAllData();
    const urls = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith(Storage.NOTES_PREFIX)) urls[k.replace(Storage.NOTES_PREFIX, '')] = v;
    }
    const out = { exported_at: new Date().toISOString(), version: 2, urls };
    downloadFile(JSON.stringify(out, null, 2), `tabstick-export-${getDateStr()}.json`, 'application/json');
  });

  document.getElementById('export-md').addEventListener('click', async () => {
    dropdown.style.display = 'none';
    const data = await Storage.getAllData();
    let md = `# TabStick Export\nExported: ${new Date().toLocaleString()}\n\n---\n\n`;
    for (const [key, notes] of Object.entries(data)) {
      if (!key.startsWith(Storage.NOTES_PREFIX)) continue;
      const url = key.replace(Storage.NOTES_PREFIX, '');
      md += `## ${url}\n\n`;
      for (const note of notes) {
        md += `### ${note.title || 'Untitled'}\n`;
        md += `> Created ${fmtDate(note.createdAt)} · Edited ${fmtDate(note.updatedAt)}\n\n`;
        md += `${htmlToMd(note.content || '')}\n\n`;
      }
      md += `---\n\n`;
    }
    downloadFile(md, `tabstick-export-${getDateStr()}.md`, 'text/markdown');
  });

  document.getElementById('export-txt').addEventListener('click', async () => {
    dropdown.style.display = 'none';
    const data = await Storage.getAllData();
    let txt = `TabStick Export\nExported: ${new Date().toLocaleString()}\n\n=================================================\n\n`;
    for (const [key, notes] of Object.entries(data)) {
      if (!key.startsWith(Storage.NOTES_PREFIX)) continue;
      const url = key.replace(Storage.NOTES_PREFIX, '');
      txt += `SITE: ${url}\n-------------------------------------------------\n\n`;
      for (const note of notes) {
        txt += `TITLE: ${note.title || 'Untitled'}\n`;
        txt += `DATE: Created ${fmtDate(note.createdAt)} / Edited ${fmtDate(note.updatedAt)}\n\n`;
        txt += `${stripHtml(note.content || '')}\n\n`;
        txt += `-------------------------------------------------\n\n`;
      }
      txt += `=================================================\n\n`;
    }
    downloadFile(txt, `tabstick-export-${getDateStr()}.txt`, 'text/plain');
  });
}

// ── Helpers ──
function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(text, query) {
  if (!query) return escapeHtml(text);
  
  // Find all matches case-insensitive
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  
  // We need to escape HTML first, but our regex matching needs to happen on the plain text.
  // The easiest way is to split by regex, escape each part, and wrap matches in <mark>.
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // Matched group
      return `<mark>${escapeHtml(part)}</mark>`;
    }
    return escapeHtml(part);
  }).join('');
}

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function htmlToMd(html) {
  return html
    .replace(/<b>|<strong>/gi, '**').replace(/<\/b>|<\/strong>/gi, '**')
    .replace(/<i>|<em>/gi, '*').replace(/<\/i>|<\/em>/gi, '*')
    .replace(/<li>/gi, '- ').replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '').trim();
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
