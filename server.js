const http = require('http');
const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_PER_PAGE = new Set([20, 50, 100, 200, 500]);
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 4579);

function isNumericName(name) {
  return /^\d+$/.test(name);
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function hasNumericArtistDirs(dirPath) {
  const entries = safeReadDir(dirPath);
  return entries.some((entry) => entry.isDirectory() && isNumericName(entry.name));
}

function pickWorksRoot() {
  if (process.env.WORKS_ROOT) {
    return path.resolve(process.env.WORKS_ROOT);
  }

  const candidates = new Set();
  const cwd = path.resolve(process.cwd());
  const scriptDir = path.resolve(__dirname);
  const scriptParent = path.dirname(scriptDir);
  const scriptGrandParent = path.dirname(scriptParent);

  candidates.add(cwd);
  candidates.add(path.dirname(cwd));
  candidates.add(scriptDir);
  candidates.add(scriptParent);
  candidates.add(scriptGrandParent);

  for (const candidate of candidates) {
    if (hasNumericArtistDirs(candidate)) {
      return candidate;
    }
  }

  const cwdBase = path.basename(cwd);
  if (isNumericName(cwdBase)) {
    return path.dirname(cwd);
  }

  return cwd;
}

const WORKS_ROOT = pickWorksRoot();

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function safeJsonParse(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function readMetadata(imagePath) {
  const metaPath = `${imagePath}.json`;
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const text = fs.readFileSync(metaPath, 'utf8');
    return safeJsonParse(text);
  } catch {
    return null;
  }
}

function toIsoDate(meta) {
  if (!meta) return null;
  if (meta.create_date) return meta.create_date;
  if (meta.date) return meta.date;
  return null;
}

function numericFromName(name) {
  const match = name.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function parsePostGrouping(fileName, metaId) {
  const base = path.basename(fileName, path.extname(fileName));
  const metaIdNum = Number(metaId || 0);
  const metaIdText = metaIdNum > 0 ? String(metaIdNum) : '';

  if (/^\d+$/.test(base) && metaIdText && base.startsWith(metaIdText)) {
    const suffix = base.slice(metaIdText.length);
    const parsedSuffix = suffix && /^\d+$/.test(suffix) ? Number(suffix) : 0;
    return {
      postId: metaIdNum,
      pageIndex: Number.isFinite(parsedSuffix) ? parsedSuffix : 0,
    };
  }

  const patterns = [
    /^(\d+)_p(\d+)$/i,
    /^(\d+)-p(\d+)$/i,
    /^(\d+)[_-](\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = base.match(pattern);
    if (match) {
      return {
        postId: Number(match[1]),
        pageIndex: Number(match[2]),
      };
    }
  }

  const fallbackId = Number(metaId || numericFromName(base) || 0);
  return {
    postId: fallbackId || null,
    pageIndex: 0,
  };
}

function scanArtist(artistId, artistPath) {
  const entries = safeReadDir(artistPath);
  const images = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()));

  const items = images.map((fileName) => {
    const absolutePath = path.join(artistPath, fileName);
    const meta = readMetadata(absolutePath) || {};
    const creation = toIsoDate(meta);
    const grouping = parsePostGrouping(fileName, meta.id);

    return {
      artistId,
      fileName,
      imageUrl: `/media/${encodeURIComponent(artistId)}/${encodeURIComponent(fileName)}`,
      id: meta.id || numericFromName(fileName),
      postId: grouping.postId,
      pageIndex: grouping.pageIndex,
      title: meta.title || '',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      createDate: creation,
      likes: typeof meta.total_bookmarks === 'number' ? meta.total_bookmarks : null,
      views: typeof meta.total_view === 'number' ? meta.total_view : null,
      caption: meta.caption || '',
      comments: Array.isArray(meta.comments) ? meta.comments : [],
      rawMeta: meta,
    };
  });

  items.sort((a, b) => {
    const aTime = a.createDate ? Date.parse(a.createDate) : 0;
    const bTime = b.createDate ? Date.parse(b.createDate) : 0;
    if (bTime !== aTime) return bTime - aTime;
    const postDelta = (b.postId || 0) - (a.postId || 0);
    if (postDelta !== 0) return postDelta;
    return (a.pageIndex || 0) - (b.pageIndex || 0);
  });

  return items;
}

function scanLibrary() {
  const rootEntries = safeReadDir(WORKS_ROOT);
  const artistDirs = rootEntries.filter((entry) => entry.isDirectory() && isNumericName(entry.name));

  const artists = new Map();

  if (artistDirs.length > 0) {
    for (const dir of artistDirs) {
      const artistId = dir.name;
      const artistPath = path.join(WORKS_ROOT, artistId);
      artists.set(artistId, scanArtist(artistId, artistPath));
    }
  } else {
    const artistId = isNumericName(path.basename(WORKS_ROOT)) ? path.basename(WORKS_ROOT) : 'single';
    artists.set(artistId, scanArtist(artistId, WORKS_ROOT));
  }

  const artistList = [...artists.keys()].sort();
  const itemsByArtist = {};
  const artistProfiles = {};
  const artistPreviews = {};
  const allItems = [];

  for (const artistId of artistList) {
    const items = artists.get(artistId) || [];
    itemsByArtist[artistId] = items;
    const firstWithUser = items.find((item) => item?.rawMeta?.user) || null;
    const user = firstWithUser?.rawMeta?.user || {};
    artistProfiles[artistId] = {
      name: typeof user.name === 'string' && user.name.trim() ? user.name : artistId,
      username: typeof user.account === 'string' && user.account.trim() ? user.account : '',
    };
    const latest = items[0] || null;
    artistPreviews[artistId] = latest
      ? {
        imageUrl: latest.imageUrl,
        title: latest.title || '',
      }
      : null;
    allItems.push(...items);
  }

  allItems.sort((a, b) => {
    const aTime = a.createDate ? Date.parse(a.createDate) : 0;
    const bTime = b.createDate ? Date.parse(b.createDate) : 0;
    return bTime - aTime;
  });

  return {
    worksRoot: WORKS_ROOT,
    artistList,
    totals: {
      artists: artistList.length,
      pictures: allItems.length,
    },
    artistCounts: Object.fromEntries(
      artistList.map((artistId) => [artistId, (itemsByArtist[artistId] || []).length]),
    ),
    artistProfiles,
    artistPreviews,
    itemsByArtist,
    allItems,
  };
}

function parsePage(rawPage) {
  const parsed = Number.parseInt(rawPage || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function parsePerPage(rawPerPage) {
  if (rawPerPage === 'all') {
    return { mode: 'all', value: null };
  }

  const parsed = Number.parseInt(rawPerPage || '', 10);
  if (ALLOWED_PER_PAGE.has(parsed)) {
    return { mode: 'numeric', value: parsed };
  }

  return { mode: 'numeric', value: 100 };
}

function parseTagFilters(searchParams) {
  const rawEntries = searchParams.getAll('tag');
  const seen = new Set();
  const normalized = [];

  for (const entry of rawEntries) {
    const parts = String(entry || '').split(',');
    for (const part of parts) {
      const tag = String(part || '').trim().toLowerCase();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      normalized.push(tag);
    }
  }

  return normalized;
}

function itemMatchesTags(item, normalizedTags) {
  if (!normalizedTags.length) return true;
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  const lowered = tags.map((tag) => String(tag).toLowerCase());
  return normalizedTags.every((needle) => lowered.some((tag) => tag.includes(needle)));
}

function parseTitleFilter(rawTitle) {
  return String(rawTitle || '').trim().toLowerCase();
}

function parseGroupByPost(rawValue) {
  const normalized = String(rawValue || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function itemMatchesTitle(item, normalizedTitle) {
  if (!normalizedTitle) return true;
  const title = String(item?.title || '').toLowerCase();
  return title.includes(normalizedTitle);
}

function groupItemsByPost(items) {
  const groups = new Map();

  for (const item of items) {
    const fallbackPostId = item.id || numericFromName(item.fileName) || 0;
    const key = `${item.artistId}:${item.postId || fallbackPostId}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }

  const grouped = [];
  for (const group of groups.values()) {
    group.sort((a, b) => (a.pageIndex || 0) - (b.pageIndex || 0));
    const first = group[0];
    grouped.push({
      ...first,
      groupCount: group.length,
      groupImages: group.map((entry) => ({
        imageUrl: entry.imageUrl,
        fileName: entry.fileName,
        pageIndex: entry.pageIndex || 0,
        id: entry.id,
        title: entry.title,
      })),
    });
  }

  grouped.sort((a, b) => {
    const aTime = a.createDate ? Date.parse(a.createDate) : 0;
    const bTime = b.createDate ? Date.parse(b.createDate) : 0;
    if (bTime !== aTime) return bTime - aTime;
    return (b.postId || 0) - (a.postId || 0);
  });

  return grouped;
}

function sendJson(res, data, status = 200) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': guessContentType(filePath),
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

function resolveStaticPath(urlPath) {
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  const targetPath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!targetPath.startsWith(PUBLIC_DIR)) {
    return null;
  }
  return targetPath;
}

function resolveMediaPath(urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  if (parts.length < 3) return null;

  const artistId = decodeURIComponent(parts[1]);
  const fileName = decodeURIComponent(parts.slice(2).join('/'));
  const targetPath = path.normalize(path.join(WORKS_ROOT, artistId, fileName));

  if (!targetPath.startsWith(WORKS_ROOT)) {
    return null;
  }

  return targetPath;
}

const server = http.createServer((req, res) => {
  const method = req.method || 'GET';
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/api/library') {
    const selectedArtist = requestUrl.searchParams.get('artist') || 'all';
    const requestedPage = parsePage(requestUrl.searchParams.get('page'));
    const perPageInfo = parsePerPage(requestUrl.searchParams.get('perPage'));
    const tags = parseTagFilters(requestUrl.searchParams);
    const title = parseTitleFilter(requestUrl.searchParams.get('title'));
    const groupByPost = parseGroupByPost(requestUrl.searchParams.get('groupByPost'));
    const library = scanLibrary();

    const validArtist = selectedArtist === 'all' || library.artistList.includes(selectedArtist);
    const artist = validArtist ? selectedArtist : 'all';
    const sourceItems = (artist === 'all' ? library.allItems : library.itemsByArtist[artist] || [])
      .filter((item) => itemMatchesTags(item, tags))
      .filter((item) => itemMatchesTitle(item, title));
    const viewItems = groupByPost ? groupItemsByPost(sourceItems) : sourceItems;
    const totalItems = viewItems.length;
    const perPage = perPageInfo.mode === 'all' ? totalItems || 1 : perPageInfo.value;
    const totalPages = perPageInfo.mode === 'all' ? 1 : Math.max(1, Math.ceil(totalItems / perPage));
    const page = Math.min(requestedPage, totalPages);
    const start = perPageInfo.mode === 'all' ? 0 : (page - 1) * perPage;
    const end = perPageInfo.mode === 'all' ? totalItems : start + perPage;
    const items = viewItems.slice(start, end);

    sendJson(res, {
      worksRoot: library.worksRoot,
      artistList: library.artistList,
      totals: library.totals,
      artistCounts: library.artistCounts,
      artistProfiles: library.artistProfiles,
      artistPreviews: library.artistPreviews,
      selectedArtist: artist,
      tag: tags[0] || '',
      tags,
      title,
      groupByPost,
      page,
      perPage: perPageInfo.mode === 'all' ? 'all' : perPage,
      totalItems,
      totalPages,
      items,
    });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/media/')) {
    const mediaPath = resolveMediaPath(pathname);
    if (!mediaPath) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }
    sendFile(res, mediaPath);
    return;
  }

  if (method === 'GET') {
    const staticPath = resolveStaticPath(pathname);
    if (!staticPath) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }

    if (fs.existsSync(staticPath)) {
      sendFile(res, staticPath);
      return;
    }

    sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Album app listening on http://localhost:${PORT}`);
  console.log(`Scanning works root: ${WORKS_ROOT}`);
});
