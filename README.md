# Reading

A personal library with a built-in reader for markdown. Import `.md` files, read them with a
searchable index rail, and keep highlights, inline notes and bookmarks that are stored in this
repository alongside the documents.

- `library/` — the documents, one `.md` per entry (frontmatter `title`, `added`, `tags` optional)
- `annotations/` — one JSON file per document: highlights, notes and bookmarks, anchored by quoted text
- `src/` — the app (Vite + React + TypeScript)

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. Out of the box the app stores everything in the browser (IndexedDB).
To read from and write to this repository instead, open **Settings → GitHub repository** and enter:

| Field | Value |
| --- | --- |
| Owner | your GitHub user |
| Repository | `reading` |
| Branch | `main` |
| Token | a fine-grained personal access token limited to this repository with **Contents: Read and write** |

Create the token at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained.
It is kept in the browser's localStorage and sent only to `api.github.com`.
Every import and every batch of annotation edits becomes a commit.

## Reader

| Key | Action |
| --- | --- |
| `/` | Search (this document, or the whole library from the Library page) |
| `[` | Show or hide the index rail |
| `]` | Show or hide the annotations rail |
| `h` / `n` / `b` | Highlight, highlight with a note, or bookmark the current selection |
| `Esc` | Clear search, close panels |

Select any text for the highlight toolbar (four colours, note, bookmark, copy). Hover a heading
for its bookmark button. Headings of the form `[12]. Title` turn `[12]` references in the text
into links with hover previews.

Search ranks sections (each heading and the text under it), marks every hit in the text, and can
hide the sections that do not match. The Library search runs the same ranking across every document
and every note; opening a result carries the query into the reader.

## Build

```bash
npm run build
```

`dist/` is a static site; serve it from anywhere (the app talks to GitHub directly from the browser).
