# Pixiv Album Viewer

Local viewer for gallery-dl Pixiv folders with inspector metadata.

## Features
- Artist filter (`All artists` + each artist ID)
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

### Optional
If you run from a different directory, set `WORKS_ROOT`:

```bash
WORKS_ROOT=/path/to/Pixiv/Works node server.js
```
