(function () {
  let searchData = [];
  let isInitialized = false;
  let currentCollection = 'all';
  let selectedIndex = -1;

  const modal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');
  const filterButtons = document.querySelectorAll('#search-modal .filter-btn');

  function getSearchIndexUrl() {
    const metaTag = document.querySelector('meta[name="search-index"]');
    return metaTag ? metaTag.getAttribute('content') : '/index.json';
  }

  async function loadSearchData() {
    if (isInitialized && searchData.length > 0) return;
    try {
      const url = getSearchIndexUrl();
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' loading ' + url);
      searchData = await res.json();
      isInitialized = true;
    } catch (err) {
      console.error('Failed to load search index:', err);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightMatches(text, terms) {
    if (!text) return '';
    let escaped = escapeHtml(text);
    if (!terms || !terms.length) return escaped;

    terms.forEach((term) => {
      if (!term || term.length === 0) return;
      const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
      escaped = escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    });
    return escaped;
  }

  function extractContextSnippet(item, terms, maxLength = 160) {
    const fullText = (item.content || item.summary || '').trim();
    if (!fullText) return '';
    if (!terms || !terms.length) {
      return fullText.length > maxLength
        ? fullText.substring(0, maxLength).trim() + '...'
        : fullText;
    }

    const textLower = fullText.toLowerCase();
    let firstMatchIndex = -1;

    // Find the earliest occurrence of any search term in the body text
    for (const term of terms) {
      const idx = textLower.indexOf(term.toLowerCase());
      if (idx !== -1 && (firstMatchIndex === -1 || idx < firstMatchIndex)) {
        firstMatchIndex = idx;
      }
    }

    // If term is only in title/tags, return the beginning of the text
    if (firstMatchIndex === -1) {
      return fullText.length > maxLength
        ? fullText.substring(0, maxLength).trim() + '...'
        : fullText;
    }

    // Context before and after the matched word
    const contextBefore = 35;
    let start = Math.max(0, firstMatchIndex - contextBefore);
    let end = Math.min(fullText.length, firstMatchIndex + maxLength - contextBefore);

    // Snap start to word boundary
    if (start > 0) {
      const spaceIdx = fullText.lastIndexOf(' ', start);
      if (spaceIdx !== -1 && spaceIdx > start - 15) {
        start = spaceIdx + 1;
      }
    }

    // Snap end to word boundary
    if (end < fullText.length) {
      const spaceIdx = fullText.indexOf(' ', end);
      if (spaceIdx !== -1 && spaceIdx < end + 20) {
        end = spaceIdx;
      }
    }

    let snippet = fullText.substring(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = '...' + snippet;
    if (end < fullText.length) snippet = snippet + '...';

    return snippet;
  }

  function searchArticles(query, collection) {
    const rawTerms = query ? query.toLowerCase().trim().split(/\s+/).filter(Boolean) : [];
    let items = searchData;

    // Collection filtering
    if (collection && collection !== 'all') {
      items = items.filter(
        (item) => item.collection && item.collection.toLowerCase() === collection.toLowerCase()
      );
    }

    if (!rawTerms.length) {
      return items.map((item) => ({ item, score: 1, terms: [] }));
    }

    const scored = [];

    for (const item of items) {
      const titleLower = (item.title || '').toLowerCase();
      const summaryLower = (item.summary || '').toLowerCase();
      const contentLower = (item.content || '').toLowerCase();
      const tagsLower = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : '';

      let score = 0;
      let matchedAll = true;

      for (const term of rawTerms) {
        let termScore = 0;

        if (titleLower.includes(term)) {
          termScore += titleLower === term ? 100 : titleLower.startsWith(term) ? 60 : 40;
        }
        if (tagsLower.includes(term)) {
          termScore += 30;
        }
        if (summaryLower.includes(term)) {
          termScore += 20;
        }
        if (contentLower.includes(term)) {
          termScore += 10;
        }

        // Every term MUST match in at least one field (Title, Tags, Summary, or Content)
        if (termScore === 0) {
          matchedAll = false;
          break;
        }

        score += termScore;
      }

      if (matchedAll && score > 0) {
        scored.push({ item, score, terms: rawTerms });
      }
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  function renderModalResults(results) {
    if (!resultsContainer) return;
    selectedIndex = -1;

    if (results.length === 0) {
      resultsContainer.innerHTML =
        '<div class="search-empty">No articles found matching your query.</div>';
      return;
    }

    const html = results
      .slice(0, 12)
      .map((r, index) => {
        const item = r.item;
        const collectionClass =
          item.collection === 'tech'
            ? 'badge-tech'
            : item.collection === 'dnd'
            ? 'badge-dnd'
            : '';
        const highlightedTitle = highlightMatches(item.title, r.terms);
        const snippetText = extractContextSnippet(item, r.terms, 150);
        const highlightedSnippet = highlightMatches(snippetText, r.terms);

        return `
        <li>
          <a href="${item.url}" class="search-result-item" data-index="${index}">
            <div class="search-result-header">
              <span class="search-result-title">${highlightedTitle}</span>
              ${
                item.collection
                  ? `<span class="collection-badge ${collectionClass}">${escapeHtml(
                      item.collection
                    )}</span>`
                  : ''
              }
            </div>
            ${
              highlightedSnippet
                ? `<div class="search-result-snippet">${highlightedSnippet}</div>`
                : ''
            }
          </a>
        </li>
      `;
      })
      .join('');

    resultsContainer.innerHTML = html;
  }

  async function performModalSearch() {
    await loadSearchData();
    const query = searchInput ? searchInput.value.trim() : '';
    const results = searchArticles(query, currentCollection);
    renderModalResults(results);
  }

  function openSearchModal() {
    if (!modal) return;
    modal.classList.add('open');
    loadSearchData().then(() => {
      performModalSearch();
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  function closeSearchModal() {
    if (!modal) return;
    modal.classList.remove('open');
    if (searchInput) searchInput.value = '';
    selectedIndex = -1;
  }

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

  // Keyboard Navigation
  document.addEventListener('keydown', (e) => {
    // ⌘K / Ctrl+K or / to open
    if (
      (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
      (e.key === '/' &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA')
    ) {
      e.preventDefault();
      openSearchModal();
      return;
    }

    if (e.key === 'Escape' && modal && modal.classList.contains('open')) {
      closeSearchModal();
      return;
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
        window.location.href = items[selectedIndex].getAttribute('href');
      }
    }
  });

  // Event Listeners for Modal
  if (searchInput) {
    searchInput.addEventListener('input', performModalSearch);
  }

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCollection = btn.getAttribute('data-collection') || 'all';
      performModalSearch();
    });
  });

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeSearchModal();
      }
    });
  }

  // Attach search trigger buttons
  document.querySelectorAll('.search-trigger-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchModal();
    });
  });

  // Standalone Search Page logic (if present on /search/)
  const pageInput = document.getElementById('search-page-input');
  const pageResults = document.getElementById('search-page-results');
  const pageFilterBtns = document.querySelectorAll('.search-page-view .filter-btn');

  if (pageInput && pageResults) {
    let pageCollection = 'all';

    function renderPageResults(results) {
      if (results.length === 0) {
        pageResults.innerHTML = '<div class="search-empty">No results found matching your query.</div>';
        return;
      }

      pageResults.innerHTML = results
        .map((r) => {
          const item = r.item;
          const collectionClass =
            item.collection === 'tech'
              ? 'badge-tech'
              : item.collection === 'dnd'
              ? 'badge-dnd'
              : '';
          const highlightedTitle = highlightMatches(item.title, r.terms);
          const snippetText = extractContextSnippet(item, r.terms, 180);
          const highlightedSnippet = highlightMatches(snippetText, r.terms);

          return `
          <li style="margin-bottom: 0.75rem; list-style: none;">
            <a href="${item.url}" class="post-item">
              <div class="post-item-meta">
                ${
                  item.collection
                    ? `<span class="collection-badge ${collectionClass}">${escapeHtml(
                        item.collection
                      )}</span>`
                    : ''
                }
                <span>${escapeHtml(item.date || '')}</span>
              </div>
              <h3 class="post-item-title">${highlightedTitle}</h3>
              ${
                highlightedSnippet
                  ? `<p class="post-item-summary">${highlightedSnippet}</p>`
                  : ''
              }
            </a>
          </li>
        `;
        })
        .join('');
    }

    async function performPageSearch() {
      await loadSearchData();
      const q = pageInput.value.trim();
      const results = searchArticles(q, pageCollection);
      renderPageResults(results);
    }

    pageInput.addEventListener('input', performPageSearch);

    pageFilterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        pageFilterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        pageCollection = btn.getAttribute('data-collection') || 'all';
        performPageSearch();
      });
    });

    loadSearchData().then(() => performPageSearch());
  }

  // Pre-fetch on idle
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => loadSearchData());
  } else {
    setTimeout(loadSearchData, 500);
  }
})();
