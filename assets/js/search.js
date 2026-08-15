(function () {
  let fuse = null;
  let searchData = [];
  let currentCollection = 'all';
  let selectedIndex = -1;

  const modal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');
  const filterButtons = document.querySelectorAll('.filter-btn');

  // Load search index
  async function initSearch() {
    if (fuse) return;
    try {
      const res = await fetch('/index.json');
      if (!res.ok) throw new Error('Failed to load search index');
      searchData = await res.json();
      fuse = new Fuse(searchData, {
        keys: [
          { name: 'title', weight: 0.5 },
          { name: 'tags', weight: 0.2 },
          { name: 'summary', weight: 0.15 },
          { name: 'content', weight: 0.15 },
        ],
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
      });
    } catch (err) {
      console.error('Error initializing search:', err);
    }
  }

  function openSearch() {
    if (!modal) return;
    modal.classList.add('open');
    initSearch();
    setTimeout(() => {
      if (searchInput) {
        searchInput.focus();
        performSearch();
      }
    }, 50);
  }

  function closeSearch() {
    if (!modal) return;
    modal.classList.remove('open');
    if (searchInput) searchInput.value = '';
    selectedIndex = -1;
  }

  function performSearch() {
    if (!resultsContainer) return;
    const query = searchInput ? searchInput.value.trim() : '';

    let results = [];
    if (!query) {
      // Show latest articles in current collection when query is empty
      results = searchData.map((item) => ({ item }));
    } else if (fuse) {
      results = fuse.search(query);
    }

    // Filter by collection if selected
    if (currentCollection !== 'all') {
      results = results.filter(
        (r) =>
          r.item.collection &&
          r.item.collection.toLowerCase() === currentCollection.toLowerCase()
      );
    }

    renderResults(results);
  }

  function renderResults(results) {
    if (!resultsContainer) return;
    selectedIndex = -1;

    if (results.length === 0) {
      resultsContainer.innerHTML =
        '<div class="search-empty">No articles found matching your criteria.</div>';
      return;
    }

    const html = results
      .slice(0, 15)
      .map((r, index) => {
        const item = r.item;
        const collectionClass =
          item.collection === 'tech'
            ? 'badge-tech'
            : item.collection === 'dnd'
            ? 'badge-dnd'
            : '';
        return `
        <li>
          <a href="${item.url}" class="search-result-item" data-index="${index}">
            <div class="search-result-header">
              <span class="search-result-title">${escapeHtml(item.title)}</span>
              ${
                item.collection
                  ? `<span class="collection-badge ${collectionClass}">${escapeHtml(
                      item.collection
                    )}</span>`
                  : ''
              }
            </div>
            ${
              item.summary
                ? `<div class="search-result-snippet">${escapeHtml(
                    item.summary
                  )}</div>`
                : ''
            }
          </a>
        </li>
      `;
      })
      .join('');

    resultsContainer.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Keyboard navigation
  function updateSelection(items) {
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  // Event Listeners
  document.addEventListener('keydown', (e) => {
    // Open modal with Cmd+K or Ctrl+K or / (when not typing in an input)
    if (
      (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
      (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA')
    ) {
      e.preventDefault();
      openSearch();
    }

    if (e.key === 'Escape' && modal && modal.classList.contains('open')) {
      closeSearch();
    }

    if (modal && modal.classList.contains('open')) {
      const items = resultsContainer.querySelectorAll('.search-result-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelection(items);
      } else if (e.key === 'Enter' && selectedIndex >= 0 && items[selectedIndex]) {
        e.preventDefault();
        items[selectedIndex].click();
      }
    }
  });

  // Search input typing
  if (searchInput) {
    searchInput.addEventListener('input', performSearch);
  }

  // Collection filter buttons
  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCollection = btn.getAttribute('data-collection') || 'all';
      performSearch();
    });
  });

  // Modal backdrop click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeSearch();
      }
    });
  }

  // Global trigger buttons
  document.querySelectorAll('.search-trigger-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSearch();
    });
  });

  // Pre-fetch search index on idle
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => initSearch());
  } else {
    setTimeout(initSearch, 1500);
  }
})();
