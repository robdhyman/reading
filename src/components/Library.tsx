import { useMemo, useRef, useState } from 'react'
import { useLibrary } from '../lib/library'
import { navigate, type Route } from '../lib/router'
import { readingTime } from '../lib/markdown'
import { tokenize, search as runSearch } from '../lib/search'
import { docItems, type LibItem } from '../lib/items'
import { SearchBox } from './SearchBox'
import { pref, setPref } from '../lib/settings'

export function useLibraryItems(): LibItem[] {
  const { docs, annotations, renderedIfReady } = useLibrary()
  return useMemo(() => docs.flatMap((d) => docItems(d, renderedIfReady(d.slug), annotations[d.slug] || [])), [docs, annotations, renderedIfReady])
}

export function LibrarySearch({ route }: { route: Route & { page: 'library' } }) {
  const items = useLibraryItems()
  return (
    <SearchBox
      items={items}
      placeholder="Search every document and note…"
      value={route.q}
      onChange={(q) => navigate({ page: 'library', q }, true)}
      onPick={(h) => navigate({ page: 'read', slug: h.item.slug, at: h.item.sectionId, q: route.q, ann: h.item.annotationId })}
      groupLabel={(h) => h.item.groupTitle}
    />
  )
}

export function LibraryPage({ route }: { route: Route & { page: 'library' } }) {
  const { docs, annotations, loading, error, importFiles, deleteDoc, store } = useLibrary()
  const [sort, setSort] = useState<'recent' | 'title' | 'length'>(() => pref('sort', 'recent'))
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const items = useLibraryItems()
  const toks = tokenize(route.q)

  const matching = useMemo(() => {
    if (route.q.trim().length < 2) return null
    const set = new Map<string, number>()
    for (const h of runSearch(items, toks, 100000)) set.set(h.item.slug, (set.get(h.item.slug) || 0) + h.score)
    return set
  }, [items, toks, route.q])

  const shown = docs
    .filter((d) => !matching || matching.has(d.slug))
    .sort((a, b) => {
      if (matching) return (matching.get(b.slug) || 0) - (matching.get(a.slug) || 0)
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'length') return b.words - a.words
      const la = pref(`opened:${a.slug}`, a.added || '')
      const lb = pref(`opened:${b.slug}`, b.added || '')
      return lb.localeCompare(la) || a.title.localeCompare(b.title)
    })

  const doImport = async (files: FileList | File[]) => {
    setBusy('Importing…')
    try {
      const slugs = await importFiles(files)
      if (slugs.length === 1) navigate({ page: 'read', slug: slugs[0], q: '' })
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const totalWords = docs.reduce((n, d) => n + d.words, 0)
  const totalAnn = Object.values(annotations).reduce((n, a) => n + a.length, 0)

  return (
    <main
      className={'page' + (drag ? ' drag' : '')}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        void doImport(e.dataTransfer.files)
      }}
    >
      <div className="wrap">
        <div className="meta-row">
          <span className="pill">{docs.length} documents</span>
          <span className="pill">{totalWords.toLocaleString()} words · {readingTime(totalWords)}</span>
          <span className="pill">{totalAnn} annotations</span>
          <span className="pill">{store.kind === 'github' ? 'GitHub' : 'This browser'}</span>
        </div>
        <div className="libhead">
          <h1 className="sect-title">Library</h1>
          <div className="row">
            <label className="muted small">
              Sort{' '}
              <select
                value={sort}
                onChange={(e) => {
                  const v = e.target.value as typeof sort
                  setSort(v)
                  setPref('sort', v)
                }}
              >
                <option value="recent">Recently opened</option>
                <option value="title">Title</option>
                <option value="length">Length</option>
              </select>
            </label>
            <input ref={file} type="file" accept=".md,.markdown,.txt" multiple hidden onChange={(e) => e.target.files && void doImport(e.target.files)} />
            <button className="btn primary" onClick={() => file.current?.click()} disabled={!!busy}>
              {busy || 'Import .md'}
            </button>
          </div>
        </div>

        {error && <div className="alert">Could not load the library: {error}</div>}
        {loading && <p className="muted">Loading…</p>}
        {!loading && !docs.length && (
          <div className="empty">
            <p>
              <b>Nothing here yet.</b> Drop markdown files anywhere on this page, or use <i>Import .md</i>.
            </p>
            <p className="muted small">Each file becomes a document with its own index, search, highlights, notes and bookmarks.</p>
          </div>
        )}
        {matching && !shown.length && !loading && <p className="muted">No documents match “{route.q}”.</p>}

        <ul className="doclist">
          {shown.map((d) => {
            const anns = annotations[d.slug] || []
            const hl = anns.filter((a) => a.kind === 'highlight' && !a.note).length
            const notes = anns.filter((a) => a.note).length
            const bm = anns.filter((a) => a.kind === 'bookmark').length
            const opened = pref<string>(`opened:${d.slug}`, '')
            return (
              <li key={d.slug} className="docrow">
                <a className="doctitle" href={`#/read/${encodeURIComponent(d.slug)}${route.q ? '?q=' + encodeURIComponent(route.q) : ''}`}>
                  {d.title}
                </a>
                <div className="docmeta">
                  <span>{d.words.toLocaleString()} words · {readingTime(d.words)}</span>
                  {d.added && <span>added {d.added}</span>}
                  {opened && <span>opened {opened.slice(0, 10)}</span>}
                  {d.tags.map((t) => (
                    <span className="tag" key={t}>{t}</span>
                  ))}
                </div>
                <div className="doccounts">
                  {hl > 0 && <span className="cnt hl-y" title="Highlights">{hl}</span>}
                  {notes > 0 && <span className="cnt note" title="Notes">{notes}</span>}
                  {bm > 0 && <span className="cnt bm" title="Bookmarks">{bm}</span>}
                  <button
                    className="link-btn danger"
                    onClick={() => {
                      if (confirm(`Delete “${d.title}” and its ${anns.length} annotations?`)) void deleteDoc(d.slug)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
