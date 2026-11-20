document.addEventListener('DOMContentLoaded', async () => {
  const notesContainer = document.getElementById('notes-container');
  const searchInput = document.getElementById('search-input');
  const emptyState = document.getElementById('empty-state');

  let allData = {};

  async function loadData() {
    allData = await Storage.getAllData();
    renderNotes(searchInput.value);
  }

  function renderNotes(filterText = '') {
    notesContainer.innerHTML = '';
    let hasNotes = false;

    const lowerFilter = filterText.trim().toLowerCase();

    for (const [key, notes] of Object.entries(allData)) {
      if (!Array.isArray(notes) || notes.length === 0) continue;

      const url = key.replace(Storage.NOTES_PREFIX, '');
      const matchingNotes = notes.filter(note => {
        if (!lowerFilter) return true;
        const titleMatch = note.title && note.title.toLowerCase().includes(lowerFilter);
        const textMatch = note.content && note.content.toLowerCase().includes(lowerFilter);
        const urlMatch = url.toLowerCase().includes(lowerFilter);
        return titleMatch || textMatch || urlMatch;
      });

      if (matchingNotes.length > 0) {
        hasNotes = true;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'url-group';

        const urlTitle = document.createElement('a');
        urlTitle.className = 'url-title';
        urlTitle.textContent = url;
        urlTitle.href = '#';
        urlTitle.addEventListener('click', (e) => {
          e.preventDefault();
          if (UrlUtils.isAccessibleUrl(url)) {
            chrome.tabs.create({ url });
          }
        });

        groupDiv.appendChild(urlTitle);

        matchingNotes.forEach(note => {
          const noteCard = document.createElement('div');
          noteCard.className = 'note-card';

          const noteBody = document.createElement('div');
          noteBody.className = 'note-body';

          const headerRow = document.createElement('div');
          headerRow.className = 'note-header-row';

          const dot = document.createElement('span');
          dot.className = 'note-color-dot';
          dot.style.background = ColorThemes.getTheme(note.color).headerBg;
          headerRow.appendChild(dot);

          if (note.title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'note-title';
            titleEl.textContent = note.title;
            headerRow.appendChild(titleEl);
          } else {
            const titleEl = document.createElement('div');
            titleEl.className = 'note-title';
            titleEl.textContent = 'Untitled';
            headerRow.appendChild(titleEl);
          }

          const noteText = document.createElement('div');
          noteText.className = 'note-text';
          noteText.textContent = note.content || (note.title ? '' : 'Empty note');

          noteBody.appendChild(headerRow);
          if (noteText.textContent) {
            noteBody.appendChild(noteText);
          }

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'delete-btn';
          deleteBtn.innerHTML = '&#10005;';
          deleteBtn.title = 'Delete note';

          let confirmState = false;
          let resetTimeout;

          deleteBtn.addEventListener('click', async () => {
            if (!confirmState) {
              confirmState = true;
              deleteBtn.textContent = 'Sure?';
              deleteBtn.classList.add('confirming');

              resetTimeout = setTimeout(() => {
                confirmState = false;
                deleteBtn.innerHTML = '&#10005;';
                deleteBtn.classList.remove('confirming');
              }, 3000);
            } else {
              clearTimeout(resetTimeout);
              try {
                const latestNotes = await Storage.getNotes(url);
                const updatedNotes = latestNotes.filter(n => n.id !== note.id);
                await Storage.saveNotes(url, updatedNotes);
                if (updatedNotes.length > 0) {
                  const meta = await Storage.getMeta(url);
                  await Storage.saveMeta(url, { ...meta, noteCount: updatedNotes.length });
                }
              } catch (err) {
                console.error('[TabStick] Sidepanel delete failed:', err);
                return;
              }

              // Notify open tabs matching this URL to delete the note from memory and DOM
              try {
                const tabs = await chrome.tabs.query({});
                const normalizedTargetUrl = UrlUtils.normalizeUrl(url);
                for (const tab of tabs) {
                  if (tab.url && UrlUtils.normalizeUrl(tab.url) === normalizedTargetUrl) {
                    chrome.tabs.sendMessage(tab.id, { type: 'DELETE_NOTE', noteId: note.id }, () => {
                      void chrome.runtime.lastError;
                    });
                  }
                }
              } catch (err) {
                console.error('[TabStick] Failed to notify tabs of deletion:', err);
              }

              // Animate out and reload
              noteCard.style.transition = 'opacity 200ms, height 200ms, margin 200ms, padding 200ms';
              noteCard.style.opacity = '0';
              noteCard.style.height = '0';
              noteCard.style.margin = '0';
              noteCard.style.padding = '0';
              noteCard.style.overflow = 'hidden';
              setTimeout(() => loadData(), 300);
            }
          });

          noteCard.appendChild(noteBody);
          noteCard.appendChild(deleteBtn);
          groupDiv.appendChild(noteCard);
        });

        notesContainer.appendChild(groupDiv);
      }
    }

    if (hasNotes) {
      emptyState.style.display = 'none';
      notesContainer.style.display = 'block';
    } else {
      emptyState.style.display = 'block';
      notesContainer.style.display = 'none';
    }
  }

  searchInput.addEventListener('input', (e) => {
    renderNotes(e.target.value);
  });

  const btnGroupTabs = document.getElementById('btn-group-tabs');
  if (btnGroupTabs) {
    btnGroupTabs.addEventListener('click', async () => {
      if (btnGroupTabs.disabled) return;

      btnGroupTabs.disabled = true;
      const originalText = btnGroupTabs.textContent;
      btnGroupTabs.textContent = 'Grouping...';

      try {
        const currentData = await Storage.getAllData();
        const targetUrls = new Map();
        for (const [key, notesList] of Object.entries(currentData)) {
          if (!key.startsWith(Storage.NOTES_PREFIX) || !Array.isArray(notesList) || notesList.length === 0) continue;
          const rawUrl = key.slice(Storage.NOTES_PREFIX.length);
          if (!UrlUtils.isAccessibleUrl(rawUrl)) continue;
          targetUrls.set(UrlUtils.normalizeUrl(rawUrl), rawUrl);
        }

        if (targetUrls.size === 0) {
          btnGroupTabs.textContent = 'No notes found';
          setTimeout(() => {
            btnGroupTabs.disabled = false;
            btnGroupTabs.textContent = originalText;
          }, 2000);
          return;
        }

        const existingTabIds = [];
        const matchedNormUrls = new Set();
        const allTabs = await chrome.tabs.query({});

        allTabs.forEach(t => {
          const tNorm = t.url && UrlUtils.isAccessibleUrl(t.url) ? UrlUtils.normalizeUrl(t.url) : '';
          const pNorm = t.pendingUrl && UrlUtils.isAccessibleUrl(t.pendingUrl) ? UrlUtils.normalizeUrl(t.pendingUrl) : '';

          const matched = (tNorm && targetUrls.has(tNorm)) ? tNorm : (pNorm && targetUrls.has(pNorm)) ? pNorm : null;
          if (matched) {
            matchedNormUrls.add(matched);
            if (!t.pinned) {
              existingTabIds.push(t.id);
            }
          }
        });

        const newTabIds = [];
        for (const [normUrl, originalUrl] of targetUrls.entries()) {
          if (!matchedNormUrls.has(normUrl) && UrlUtils.isAccessibleUrl(originalUrl)) {
            const newTab = await chrome.tabs.create({ url: originalUrl, active: false });
            newTabIds.push(newTab.id);
          }
        }

        const allTabIdsToGroup = [...new Set([...existingTabIds, ...newTabIds])];

        if (allTabIdsToGroup.length > 0) {
          const currentWin = await chrome.windows.getCurrent();
          await chrome.tabs.move(allTabIdsToGroup, { windowId: currentWin.id, index: -1 });

          const groupOptions = { tabIds: allTabIdsToGroup };
          const existingGroups = await chrome.tabGroups.query({ title: 'TabStick', windowId: currentWin.id });

          if (existingGroups.length > 0) {
            groupOptions.groupId = existingGroups[0].id;
          }

          const groupId = await chrome.tabs.group(groupOptions);
          await chrome.tabGroups.update(groupId, { title: 'TabStick', color: 'yellow' });
        }
      } catch (err) {
        console.error('[TabStick] Error grouping tabs:', err);
      } finally {
        btnGroupTabs.disabled = false;
        btnGroupTabs.textContent = originalText;
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      let shouldReload = false;
      for (const key in changes) {
        if (key.startsWith(Storage.NOTES_PREFIX) || key.startsWith('tabstick::')) {
          shouldReload = true;
          break;
        }
      }
      if (shouldReload) {
        loadData();
      }
    }
  });

  loadData();
});
