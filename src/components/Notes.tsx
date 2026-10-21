import { useState } from 'react'
import { useLibrary } from '../lib/library'
import { navigate, type Route } from '../lib/router'
import { tokenize } from '../lib/search'
import { kindLabel } from '../lib/items'
import type { Annotation } from '../lib/types'
import { useLibraryItems } from './Library'
import { SearchBox } from './SearchBox'

type Filter = 'all' | 'highlight' | 'note' | 'bookmark'

export function NotesSearch({ route }: { route: Route & { page: 'notes' } }) {
  const items = useLibraryItems().filter((i) => i.annotationId)
  return (
    <SearchBox
      items={items}
      placeholder="Search highlights, notes and bookmarks…"
      value={route.q}
      onChange={(q) => navigate({ page: 'notes', q }, true)}
      onPick={(h) => navigate({ page: 'read', slug: h.item.slug, q: '', ann: h.item.annotationId })}
      groupLabel={(h) => h.item.groupTitle}
    />
  )
}

/** Every annotation in the library, grouped by document, filterable by kind and text. */
export function NotesPage({ route }: { route: Route & { page: 'notes' } }) {
  const { docs, annotations } = useLibrary()
  const [filter, setFilter] = useState<Filter>('all')
  const toks = tokenize(route.q)
  const passes = (a: Annotation) => {
    if (filter === 'bookmark' && a.kind !== 'bookmark') return false
    if (filter === 'note' && !a.note) return false
    if (filter === 'highlight' && (a.kind !== 'highlight' || a.note)) return false
    if (toks.length) {
      const hay = (a.exact + ' ' + (a.note || '') + ' ' + (a.sectionTitle || '')).toLowerCase()
      if (!toks.every((t) => hay.includes(t))) return false
    }
    return true
  }
  const groups = docs
    .map((d) => ({ doc: d, anns: (annotations[d.slug] || []).filter(passes).sort((a, b) => b.updated.localeCompare(a.updated)) }))
    .filter((g) => g.anns.length)
  const total = groups.reduce((n, g) => n + g.anns.length, 0)

  return (
    <main className="page">
      <div className="wrap">
        <div className="libhead">
          <h1 className="sect-title">Notes</h1>
          <div className="fgroup" role="group" aria-label="Filter">
            {(['all', 'highlight', 'note', 'bookmark'] as Filter[]).map((f) => (
              <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'highlight' ? 'Highlights' : f === 'note' ? 'Notes' : 'Bookmarks'}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small">{total} annotations across {groups.length} documents, newest first.</p>
        {!total && <div className="empty"><p className="muted">Nothing yet. Select text in a document to highlight it, add a note, or bookmark it.</p></div>}
        {groups.map(({ doc, anns }) => (
          <section className="sect" key={doc.slug}>
            <h2>
              <a href={`#/read/${encodeURIComponent(doc.slug)}`}>{doc.title}</a> <span className="muted small">{anns.length}</span>
            </h2>
            <ul className="annlist">
              {anns.map((a) => (
                <AnnotationCard key={a.id} a={a} onOpen={() => navigate({ page: 'read', slug: doc.slug, q: '', ann: a.id })} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}

export function AnnotationCard({ a, onOpen, children, selected }: { a: Annotation; onOpen: () => void; children?: React.ReactNode; selected?: boolean }) {
  return (
    <li className={'ann ' + (a.kind === 'bookmark' ? 'bm' : 'c-' + (a.color || 'y')) + (selected ? ' sel' : '')} data-ann={a.id}>
      <button className="annq" onClick={onOpen} title="Go to this passage">
        <span className="rk">{kindLabel(a)}</span>
        {a.sectionTitle && <span className="annsec">{a.sectionTitle}</span>}
        <q>{a.exact.replace(/\s+/g, ' ').slice(0, 220)}{a.exact.length > 220 ? '…' : ''}</q>
      </button>
      {a.note && !children && <p className="annnote">{a.note}</p>}
      {children}
    </li>
  )
}
