# Pixiv Album Viewer

Local viewer for gallery-dl Pixiv folders with inspector metadata.

## Features
- Artist filter (`All artists` + each artist ID)
- Tag filter (matches artwork tags, case-insensitive)
- Pagination with per-page selector (`20`, `50`, `100`, `200`, `500`, `All`)
- Arrow key navigation (`Left` / `Right`)
- Right inspector panel with:
  - title
  - tags
  - id
  - creation time
  - likes/bookmarks
  - views
  - caption
  - comments

## Folder Structure
Expected structure at works root:

```text
Works/
  119889363/
    1361546030.jpg
    1361546030.jpg.json
  123456789/
    ...
```

## Run
From `album-app/`:

```bash
node server.js
```

Open `http://localhost:4579`.

`WORKS_ROOT` is auto-detected. If `album-app` sits inside one artist folder (for example `Works/119889363/album-app`), it will automatically scan the parent `Works/` directory.

### Optional
If you run from a different directory, set `WORKS_ROOT`:

```bash
WORKS_ROOT=/path/to/Pixiv/Works node server.js
```

## API
`GET /api/library` supports:
- `artist` (`all` or a numeric artist ID)
- `page` (1-based page number)
- `perPage` (`20`, `50`, `100`, `200`, `500`, or `all`)
- `tag` (case-insensitive substring filter against tags)
