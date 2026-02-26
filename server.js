const http = require('http');
const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
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

    return {
      artistId,
      fileName,
      imageUrl: `/media/${encodeURIComponent(artistId)}/${encodeURIComponent(fileName)}`,
      id: meta.id || numericFromName(fileName),
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
    return bTime - aTime;
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
  const allItems = [];

  for (const artistId of artistList) {
    const items = artists.get(artistId) || [];
    itemsByArtist[artistId] = items;
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
    itemsByArtist,
    allItems,
  };
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
    const library = scanLibrary();
    sendJson(res, library);
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
