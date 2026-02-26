const state = {
  library: null,
  selectedArtist: 'all',
  currentItems: [],
  currentIndex: 0,
  viewMode: 'focus',
  gridColumns: 5,
  gridScrollTop: 0,
  gridScrollLeft: 0,
  lastGridIndex: 0,
};

const artistSelect = document.getElementById('artist-select');
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
  if (!state.library) return;
  if (state.selectedArtist === 'all') {
    state.currentItems = state.library.allItems || [];
  } else {
    state.currentItems = state.library.itemsByArtist[state.selectedArtist] || [];
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
  allOption.textContent = `All artists (${state.library.totals.pictures})`;
  artistSelect.appendChild(allOption);

  artists.forEach((artistId) => {
    const count = (state.library.itemsByArtist[artistId] || []).length;
    const option = document.createElement('option');
    option.value = artistId;
    option.textContent = `${artistId} (${count})`;
    artistSelect.appendChild(option);
  });

  artistSelect.value = state.selectedArtist;
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
  prevBtn.disabled = isGrid;
  nextBtn.disabled = isGrid;
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
    state.lastGridIndex = state.currentIndex;
  }

  state.viewMode = nextMode;
  viewModeEl.value = nextMode;
  updateViewerMode();

  if (nextMode === 'focus') {
    renderList();
  } else {
    updateGridSelection();
  }

  if (nextMode === 'grid') {
    window.requestAnimationFrame(() => {
      if (state.currentIndex === state.lastGridIndex) {
        gridEl.scrollTop = state.gridScrollTop;
        gridEl.scrollLeft = state.gridScrollLeft;
      } else {
        const activeTile = gridEl.querySelector('.grid-tile.active');
        if (activeTile) {
          activeTile.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
      }
    });
  }
}

function renderEmpty() {
  mainImage.removeAttribute('src');
  mainImage.alt = 'No image';
  positionEl.textContent = '0 / 0';
  countsEl.textContent = 'No pictures found.';
  metaEl.innerHTML = '<p>No metadata.</p>';
  commentsEl.innerHTML = '<p>No comments.</p>';
  listEl.innerHTML = '';
  gridEl.innerHTML = '';
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
  countsEl.textContent = `Artists: ${state.library.totals.artists} | Pictures: ${state.library.totals.pictures}`;

  if (state.viewMode === 'grid') {
    if (!preserveGrid) {
      renderGrid();
    } else {
      updateGridSelection();
    }
  } else {
    renderList();
    renderGrid();
  }
  renderInspector(item);
  updateViewerMode();
}

function move(delta) {
  if (!state.currentItems.length) return;
  const length = state.currentItems.length;
  state.currentIndex = (state.currentIndex + delta + length) % length;
  renderCurrent();
}

async function loadLibrary() {
  const res = await fetch('/api/library');
  if (!res.ok) throw new Error('Failed to load library');
  state.library = await res.json();

  renderArtistOptions();
  setCurrentItems();
  renderCurrent();
}

artistSelect.addEventListener('change', () => {
  state.selectedArtist = artistSelect.value;
  state.currentIndex = 0;
  state.lastGridIndex = 0;
  state.gridScrollTop = 0;
  state.gridScrollLeft = 0;
  setCurrentItems();
  renderCurrent();
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
