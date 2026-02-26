const state = {
  library: null,
  selectedArtist: 'all',
  currentItems: [],
  currentIndex: 0,
  page: 1,
  perPage: '100',
  viewMode: 'focus',
  gridColumns: 5,
  gridScrollTop: 0,
  gridScrollLeft: 0,
};

const artistSelect = document.getElementById('artist-select');
const perPageSelect = document.getElementById('per-page-select');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pagePositionEl = document.getElementById('page-position');
const listEl = document.getElementById('list');
const countsEl = document.getElementById('counts');
const mainImage = document.getElementById('main-image');
const positionEl = document.getElementById('position');
const metaEl = document.getElementById('meta');
const commentsEl = document.getElementById('comments');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const appEl = document.querySelector('.app');
const viewModeEl = document.getElementById('view-mode');
const gridColumnsEl = document.getElementById('grid-columns');
const gridColumnsValueEl = document.getElementById('grid-columns-value');
const focusWrapEl = document.getElementById('focus-wrap');
const gridEl = document.getElementById('grid');
const hintEl = document.getElementById('hint');

function formatDate(input) {
  if (!input) return '-';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleString();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeHref(rawHref) {
  if (!rawHref) return null;
  const trimmed = String(rawHref).trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function sanitizeCaptionHtml(input) {
  const source = input == null ? '' : String(input);
  if (!source.trim()) return '-';

  const template = document.createElement('template');
  template.innerHTML = source;

  function sanitizeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      return '<br>';
    }

    const children = Array.from(node.childNodes).map(sanitizeNode).join('');

    if (tag === 'a') {
      const href = normalizeHref(node.getAttribute('href'));
      if (!href) return children;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${children || escapeHtml(href)}</a>`;
    }

    return children;
  }

  const html = Array.from(template.content.childNodes).map(sanitizeNode).join('');
  return html || '-';
}

function setCurrentItems() {
  const pagedItems = state.library?.items;
  if (Array.isArray(pagedItems)) {
    state.currentItems = pagedItems;
  } else {
    const baseItems = state.selectedArtist === 'all'
      ? (state.library?.allItems || [])
      : (state.library?.itemsByArtist?.[state.selectedArtist] || []);
    const totalItems = baseItems.length;
    const perPageRaw = state.library?.perPage || state.perPage;
    const perPage = perPageRaw === 'all' ? (totalItems || 1) : Number(perPageRaw);
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const page = Math.min(Math.max(1, state.page), totalPages);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    state.currentItems = perPageRaw === 'all' ? baseItems : baseItems.slice(start, end);
    state.page = page;
  }
  if (state.currentIndex >= state.currentItems.length) {
    state.currentIndex = 0;
  }
}

function renderArtistOptions() {
  const artists = state.library.artistList || [];
  artistSelect.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = `All artists (${state.library.totals.pictures || 0})`;
  artistSelect.appendChild(allOption);

  artists.forEach((artistId) => {
    const count = state.library.artistCounts?.[artistId] || 0;
    const option = document.createElement('option');
    option.value = artistId;
    option.textContent = `${artistId} (${count})`;
    artistSelect.appendChild(option);
  });

  artistSelect.value = state.library.selectedArtist || state.selectedArtist;
}

function renderPagingControls() {
  const fallbackPerPageRaw = state.library?.perPage || state.perPage;
  const fallbackTotalItems = state.selectedArtist === 'all'
    ? (state.library?.totals?.pictures || 0)
    : (
      state.library?.artistCounts?.[state.selectedArtist]
      || state.library?.itemsByArtist?.[state.selectedArtist]?.length
      || 0
    );
  const fallbackPerPage = fallbackPerPageRaw === 'all'
    ? (fallbackTotalItems || 1)
    : Number(fallbackPerPageRaw);
  const fallbackTotalPages = Math.max(1, Math.ceil(fallbackTotalItems / fallbackPerPage));
  const currentPage = state.library?.page ?? state.page ?? 1;
  const totalPages = state.library?.totalPages ?? fallbackTotalPages;
  const totalItems = state.library?.totalItems ?? fallbackTotalItems;

  pagePositionEl.textContent = `Page ${currentPage} / ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1 || totalItems === 0;
  nextPageBtn.disabled = currentPage >= totalPages || totalItems === 0;
  perPageSelect.value = String(state.library?.perPage || state.perPage);
}

function renderList() {
  listEl.innerHTML = '';

  state.currentItems.forEach((item, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `image-row ${index === state.currentIndex ? 'active' : ''}`;

    row.innerHTML = `
      <img src="${item.imageUrl}" alt="">
      <div>
        <div class="row-title">${escapeHtml(item.title || '(Untitled)')}</div>
        <div class="row-meta">ID ${escapeHtml(item.id ?? '-')} | ${escapeHtml(item.artistId)}</div>
      </div>
    `;

    row.addEventListener('click', () => {
      state.currentIndex = index;
      renderCurrent();
    });

    listEl.appendChild(row);
  });
}

function scrollListToIndex(index) {
  const row = listEl.children[index];
  if (!row) return;
  const listRect = listEl.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const rowTopInList = rowRect.top - listRect.top + listEl.scrollTop;
  const anchorRatio = 0.35;
  const top = rowTopInList - (listEl.clientHeight - rowRect.height) * anchorRatio;
  listEl.scrollTop = Math.max(0, top);
}

function focusListIndex(index) {
  let attempts = 0;
  const maxAttempts = 3;

  function step() {
    scrollListToIndex(index);
    attempts += 1;
    if (attempts < maxAttempts) {
      window.requestAnimationFrame(step);
    }
  }

  window.requestAnimationFrame(step);
}

function renderGrid() {
  gridEl.innerHTML = '';
  gridEl.style.setProperty('--grid-columns', String(state.gridColumns));

  state.currentItems.forEach((item, index) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `grid-tile ${index === state.currentIndex ? 'active' : ''}`;
    tile.innerHTML = `
      <img src="${item.imageUrl}" alt="${escapeHtml(item.title || 'Artwork')}">
      <span class="grid-label">${escapeHtml(item.title || '(Untitled)')}</span>
    `;

    tile.addEventListener('click', () => {
      if (state.viewMode !== 'grid') {
        state.currentIndex = index;
        renderCurrent();
        return;
      }
      if (state.currentIndex === index) {
        setViewMode('focus');
        return;
      }
      state.currentIndex = index;
      renderCurrent({ preserveGrid: true });
    });

    gridEl.appendChild(tile);
  });
}

function updateGridSelection() {
  const tiles = gridEl.children;
  for (let i = 0; i < tiles.length; i += 1) {
    const active = i === state.currentIndex;
    tiles[i].classList.toggle('active', active);
  }
}

function scrollGridToIndex(index) {
  const tile = gridEl.children[index];
  if (!tile) return;

  const top = tile.offsetTop - (gridEl.clientHeight - tile.offsetHeight) / 2;
  const left = tile.offsetLeft - (gridEl.clientWidth - tile.offsetWidth) / 2;

  gridEl.scrollTop = Math.max(0, top);
  gridEl.scrollLeft = Math.max(0, left);
}

function focusGridIndex(index) {
  let attempts = 0;
  const maxAttempts = 4;

  function step() {
    scrollGridToIndex(index);
    attempts += 1;
    if (attempts < maxAttempts) {
      window.requestAnimationFrame(step);
    }
  }

  window.requestAnimationFrame(step);
}

function renderInspector(item) {
  const tags = item.tags || [];
  const tagsHtml = tags.length
    ? `<div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '-';

  metaEl.innerHTML = `
    <div class="item"><div class="label">Title</div><div class="value">${escapeHtml(item.title || '(Untitled)')}</div></div>
    <div class="item"><div class="label">Artist ID</div><div class="value">${escapeHtml(item.artistId)}</div></div>
    <div class="item"><div class="label">Picture ID</div><div class="value">${escapeHtml(item.id ?? '-')}</div></div>
    <div class="item"><div class="label">Created</div><div class="value">${escapeHtml(formatDate(item.createDate))}</div></div>
    <div class="item"><div class="label">Likes (bookmarks)</div><div class="value">${escapeHtml(item.likes ?? '-')}</div></div>
    <div class="item"><div class="label">Views</div><div class="value">${escapeHtml(item.views ?? '-')}</div></div>
    <div class="item"><div class="label">Tags</div><div class="value">${tagsHtml}</div></div>
    <div class="item"><div class="label">Caption</div><div class="value">${sanitizeCaptionHtml(item.caption)}</div></div>
  `;

  const comments = item.comments || [];
  if (!comments.length) {
    commentsEl.innerHTML = '<p>No comments.</p>';
    return;
  }

  commentsEl.innerHTML = comments
    .map((comment) => {
      const username = comment?.user?.name || 'Unknown';
      const content = comment?.comment || '[stamp or empty comment]';
      return `
        <div class="comment">
          <div class="comment-user">${escapeHtml(username)} | ${escapeHtml(formatDate(comment?.date))}</div>
          <div class="comment-text">${escapeHtml(content)}</div>
        </div>
      `;
    })
    .join('');
}

function updateViewerMode() {
  const isGrid = state.viewMode === 'grid';
  appEl.classList.toggle('grid-mode', isGrid);
  focusWrapEl.hidden = isGrid;
  gridEl.hidden = !isGrid;
  prevBtn.disabled = !state.currentItems.length;
  nextBtn.disabled = !state.currentItems.length;
  hintEl.textContent = isGrid
    ? 'Click a tile to inspect it. Use Columns to adjust density.'
    : 'Keyboard: Left/Right arrows navigate images.';
}

function setViewMode(nextMode) {
  if (nextMode !== 'focus' && nextMode !== 'grid') return;
  if (state.viewMode === nextMode) return;

  if (state.viewMode === 'grid') {
    state.gridScrollTop = gridEl.scrollTop;
    state.gridScrollLeft = gridEl.scrollLeft;
  }

  state.viewMode = nextMode;
  viewModeEl.value = nextMode;
  updateViewerMode();

  if (nextMode === 'focus') {
    renderList();
    focusListIndex(state.currentIndex);
  } else {
    updateGridSelection();
  }

  if (nextMode === 'grid') {
    focusGridIndex(state.currentIndex);
  }
}

function renderEmpty() {
  mainImage.removeAttribute('src');
  mainImage.alt = 'No image';
  positionEl.textContent = '0 / 0';
  const artists = state.library?.totals?.artists || 0;
  const totalPictures = state.library?.totals?.pictures || 0;
  const shown = state.selectedArtist === 'all'
    ? (state.library?.totals?.pictures || 0)
    : (state.library?.artistCounts?.[state.selectedArtist] || 0);
  countsEl.textContent = `Artists: ${artists} | Pictures: ${totalPictures} | Showing: ${shown}`;
  metaEl.innerHTML = '<p>No metadata.</p>';
  commentsEl.innerHTML = '<p>No comments.</p>';
  listEl.innerHTML = '';
  gridEl.innerHTML = '';
  renderPagingControls();
  updateViewerMode();
}

function renderCurrent(options = {}) {
  const preserveGrid = options.preserveGrid === true;
  if (!state.currentItems.length) {
    renderEmpty();
    return;
  }

  const item = state.currentItems[state.currentIndex];
  mainImage.src = item.imageUrl;
  mainImage.alt = item.title || 'Artwork';

  positionEl.textContent = `${state.currentIndex + 1} / ${state.currentItems.length}`;
  const totalItems = state.library.totalItems ?? (
    state.selectedArtist === 'all'
      ? (state.library.totals?.pictures || 0)
      : (state.library.artistCounts?.[state.selectedArtist] || 0)
  );
  const page = state.library.page || 1;
  const perPage = state.library.perPage || state.perPage;
  const perPageValue = perPage === 'all' ? totalItems : Number(perPage);
  const from = totalItems ? (page - 1) * perPageValue + 1 : 0;
  const to = totalItems ? from + state.currentItems.length - 1 : 0;
  countsEl.textContent = `Artists: ${state.library.totals.artists} | Pictures: ${state.library.totals.pictures} | Showing ${from}-${to} of ${totalItems}`;

  if (state.viewMode === 'grid') {
    if (!preserveGrid) {
      renderGrid();
    } else {
      updateGridSelection();
    }
  } else {
    renderList();
    focusListIndex(state.currentIndex);
    renderGrid();
  }
  renderInspector(item);
  renderPagingControls();
  updateViewerMode();
}

function move(delta) {
  if (!state.currentItems.length) return;
  const length = state.currentItems.length;
  state.currentIndex = (state.currentIndex + delta + length) % length;
  renderCurrent();
}

async function loadLibrary() {
  const params = new URLSearchParams();
  params.set('artist', state.selectedArtist);
  params.set('page', String(state.page));
  params.set('perPage', state.perPage);

  const res = await fetch(`/api/library?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to load library');
  state.library = await res.json();
  state.selectedArtist = state.library.selectedArtist || state.selectedArtist;
  if (typeof state.library.page === 'number' && Number.isFinite(state.library.page) && state.library.page >= 1) {
    state.page = state.library.page;
  }
  if (state.library.perPage != null) {
    state.perPage = String(state.library.perPage);
  } else if (!state.perPage) {
    state.perPage = '100';
  }

  renderArtistOptions();
  setCurrentItems();
  renderCurrent();
}

artistSelect.addEventListener('change', () => {
  state.selectedArtist = artistSelect.value;
  state.page = 1;
  state.currentIndex = 0;
  state.gridScrollTop = 0;
  state.gridScrollLeft = 0;
  loadLibrary().catch((error) => {
    console.error(error);
    countsEl.textContent = 'Failed to load library.';
    renderEmpty();
  });
});

perPageSelect.addEventListener('change', () => {
  state.perPage = perPageSelect.value;
  state.page = 1;
  state.currentIndex = 0;
  state.gridScrollTop = 0;
  state.gridScrollLeft = 0;
  loadLibrary().catch((error) => {
    console.error(error);
    countsEl.textContent = 'Failed to load library.';
    renderEmpty();
  });
});

prevPageBtn.addEventListener('click', () => {
  if (state.page <= 1) return;
  state.page -= 1;
  state.currentIndex = 0;
  state.gridScrollTop = 0;
  state.gridScrollLeft = 0;
  loadLibrary().catch((error) => {
    console.error(error);
    countsEl.textContent = 'Failed to load library.';
    renderEmpty();
  });
});

nextPageBtn.addEventListener('click', () => {
  const totalItems = state.library?.totalItems ?? (
    state.selectedArtist === 'all'
      ? (state.library?.totals?.pictures || 0)
      : (
        state.library?.artistCounts?.[state.selectedArtist]
        || state.library?.itemsByArtist?.[state.selectedArtist]?.length
        || 0
      )
  );
  const perPageRaw = state.library?.perPage || state.perPage;
  const perPage = perPageRaw === 'all' ? (totalItems || 1) : Number(perPageRaw);
  const totalPages = state.library?.totalPages || Math.max(1, Math.ceil(totalItems / perPage));
  if (state.page >= totalPages) return;
  state.page += 1;
  state.currentIndex = 0;
  state.gridScrollTop = 0;
  state.gridScrollLeft = 0;
  loadLibrary().catch((error) => {
    console.error(error);
    countsEl.textContent = 'Failed to load library.';
    renderEmpty();
  });
});

viewModeEl.addEventListener('change', () => {
  setViewMode(viewModeEl.value);
});

gridColumnsEl.addEventListener('input', () => {
  state.gridColumns = Number(gridColumnsEl.value);
  gridColumnsValueEl.textContent = String(state.gridColumns);
  if (state.viewMode === 'grid') {
    state.gridScrollTop = gridEl.scrollTop;
    state.gridScrollLeft = gridEl.scrollLeft;
  }
  renderGrid();
});

prevBtn.addEventListener('click', () => move(-1));
nextBtn.addEventListener('click', () => move(1));

document.addEventListener('keydown', (event) => {
  if (state.viewMode === 'grid') return;
  if (event.key === 'ArrowLeft') {
    move(-1);
  } else if (event.key === 'ArrowRight') {
    move(1);
  }
});

gridEl.addEventListener('scroll', () => {
  if (state.viewMode !== 'grid') return;
  state.gridScrollTop = gridEl.scrollTop;
  state.gridScrollLeft = gridEl.scrollLeft;
});

loadLibrary().catch((error) => {
  console.error(error);
  countsEl.textContent = 'Failed to load library.';
  renderEmpty();
});
