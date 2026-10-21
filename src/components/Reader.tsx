import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLibrary } from '../lib/library'
import { hrefFor, navigate, type Route } from '../lib/router'
import { readingTime } from '../lib/markdown'
import { buildIndex, describeRange, headingText, locate, sectionAt, unwrapAll, wrapRange } from '../lib/anchor'
import { markIn, reEsc, tokenize, search as runSearch } from '../lib/search'
import { docItems } from '../lib/items'
import { pref, setPref } from '../lib/settings'
import { uid } from '../lib/slug'
import type { Annotation, Color } from '../lib/types'
import { SearchBox } from './SearchBox'
import { AnnotationCard } from './Notes'

type R = Route & { page: 'read' }

const COLORS: { c: Color; name: string }[] = [
  { c: 'y', name: 'Yellow' },
  { c: 'g', name: 'Green' },
  { c: 'b', name: 'Blue' },
  { c: 'p', name: 'Pink' },
]

interface Toolbar {
  x: number
  y: number
  range: Range
}

export function ReaderSearch({ route, state }: { route: R; state: ReaderState }) {
  const { docs, rendered, annotations } = useLibrary()
  const doc = docs.find((d) => d.slug === route.slug)
  const items = useMemo(() => (doc ? docItems(doc, rendered(doc), annotations[doc.slug] || []) : []), [doc, rendered, annotations])
  if (!doc) return null
  return (
    <SearchBox
      items={items}
      placeholder="Search this document…"
      value={state.q}
      onChange={state.setQ}
      onPick={(h) => {
        if (h.item.sectionId) state.goTo(h.item.sectionId)
        if (h.item.annotationId) state.goToAnnotation(h.item.annotationId)
      }}
      marks={state.marks}
      header={() => (
        <label>
          <input type="checkbox" checked={state.only} onChange={(e) => state.setOnly(e.target.checked)} /> Show only matching sections
        </label>
      )}
    />
  )
}

export interface ReaderState {
  q: string
  setQ: (q: string) => void
  only: boolean
  setOnly: (b: boolean) => void
  marks: number
  setMarks: (n: number) => void
  goTo: (id: string) => void
  goToAnnotation: (id: string) => void
  toc: boolean
  setToc: (b: boolean) => void
  notes: boolean
  setNotes: (b: boolean) => void
}

export function useReaderState(route: R): ReaderState {
  const [q, setQ] = useState(route.q)
  const [only, setOnly] = useState(false)
  const [marks, setMarks] = useState(0)
  const [toc, setTocState] = useState<boolean>(() => (matchMedia('(max-width: 900px)').matches ? false : pref('toc', true)))
  const [notes, setNotesState] = useState<boolean>(() => (matchMedia('(max-width: 1180px)').matches ? false : pref('notes', true)))
  useEffect(() => setQ(route.q), [route.q, route.slug])
  const setToc = (b: boolean) => {
    setTocState(b)
    if (!matchMedia('(max-width: 900px)').matches) setPref('toc', b)
  }
  const setNotes = (b: boolean) => {
    setNotesState(b)
    if (!matchMedia('(max-width: 1180px)').matches) setPref('notes', b)
  }
  const goTo = (id: string) => {
    scrollToId(id)
    navigate({ ...route, at: id, q }, true)
  }
  const goToAnnotation = (id: string) => {
    const el = document.querySelector(`.article [data-id="${CSS.escape(id)}"]`) as HTMLElement | null
    if (el) flash(el)
    document.dispatchEvent(new CustomEvent('reader:select', { detail: id }))
  }
  return { q, setQ, only, setOnly, marks, setMarks, goTo, goToAnnotation, toc, setToc, notes, setNotes }
}

function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const sec = el.closest('.sec') as HTMLElement | null
  if (sec) {
    sec.classList.add('flash')
    setTimeout(() => sec.classList.remove('flash'), 1600)
  }
}
function flash(el: HTMLElement) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1600)
}

export function ReaderPage({ route, state }: { route: R; state: ReaderState }) {
  const { docs, rendered, annotations, setAnnotations } = useLibrary()
  const doc = docs.find((d) => d.slug === route.slug)
  const r = useMemo(() => (doc ? rendered(doc) : null), [doc, rendered])
  const anns = useMemo(() => annotations[route.slug] || [], [annotations, route.slug])
  const article = useRef<HTMLDivElement>(null)
  const [toolbar, setToolbar] = useState<Toolbar | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, number>>({})
  const [noteFilter, setNoteFilter] = useState<'all' | 'highlight' | 'note' | 'bookmark'>('all')
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null)
  const toks = useMemo(() => tokenize(state.q), [state.q])
  const toksRef = useRef(toks)
  toksRef.current = toks
  const setMarks = state.setMarks

  // remember that this doc was opened
  useEffect(() => {
    if (doc) setPref(`opened:${doc.slug}`, new Date().toISOString())
  }, [doc])

  // ---- apply search marks (+ section filtering) ----
  const applyMarks = useCallback(() => {
    const root = article.current
    if (!root || !r) return
    unwrapAll(root, 'mark.hit')
    const t = toksRef.current
    const secs = Array.from(root.querySelectorAll<HTMLElement>('.sec'))
    if (!t.length) {
      secs.forEach((s) => (s.hidden = false))
      setMarks(0)
      return
    }
    const hits = new Set(runSearch(r.sections.map((s, i) => ({ id: s.id, kind: '', title: s.title, text: s.text, order: i })), t, 100000).map((h) => h.item.id))
    const re = new RegExp(t.map(reEsc).join('|'), 'gi')
    let n = 0
    secs.forEach((s) => {
      const hit = hits.has(s.dataset.sec || '')
      s.hidden = state.only && !hit
      if (hit) n += markIn(s, re)
    })
    setMarks(n)
  }, [r, state.only, setMarks])

  // ---- render article + annotations ----
  useEffect(() => {
    const root = article.current
    if (!root || !r) return
    root.innerHTML = r.html
    const pos: Record<string, number> = {}
    for (const a of anns) {
      const idx = buildIndex(root)
      const loc = locate(idx, a)
      if (!loc) continue
      pos[a.id] = loc.start
      const made = wrapRange(idx, loc.start, loc.end, () => {
        const s = document.createElement('span')
        s.className = a.kind === 'bookmark' ? 'bm' : 'hl c-' + (a.color || 'y')
        s.dataset.id = a.id
        return s
      })
      if (made.length) {
        made[0].classList.add('first')
        made[made.length - 1].classList.add('last')
        if (a.note) made[made.length - 1].classList.add('noted')
      }
    }
    setPositions(pos)
    applyMarks()

    // active heading tracking for the index rail
    const io = new IntersectionObserver(
      (es) => {
        for (const en of es) if (en.isIntersecting) setActive((en.target as HTMLElement).id)
      },
      { rootMargin: '-70px 0px -75% 0px' },
    )
    root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => io.observe(h))
    return () => io.disconnect()
  }, [r, anns, applyMarks])

  useEffect(() => applyMarks(), [applyMarks, toks])

  // ---- initial scroll: ?at= heading, ?ann= annotation, or remembered position ----
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!r) return
    const key = route.slug + '|' + (route.at || '') + '|' + (route.ann || '')
    if (scrolledFor.current === key) return
    scrolledFor.current = key
    const t = setTimeout(() => {
      if (route.ann) {
        state.goToAnnotation(route.ann)
        setSelected(route.ann)
      } else if (route.at) {
        document.getElementById(route.at)?.scrollIntoView({ block: 'start' })
      } else {
        const saved = pref<string | null>(`pos:${route.slug}`, null)
        if (saved) document.getElementById(saved)?.scrollIntoView({ block: 'start' })
      }
    }, 30)
    return () => clearTimeout(t)
  }, [r, route.slug, route.at, route.ann, state])

  // remember reading position (first heading below the top bar)
  useEffect(() => {
    let tmr: number | null = null
    const on = () => {
      if (tmr) return
      tmr = window.setTimeout(() => {
        tmr = null
        const root = article.current
        if (!root) return
        const hs = root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')
        let best: string | null = null
        for (const h of hs) {
          if (h.getBoundingClientRect().top <= 80) best = h.id
          else break
        }
        if (best) setPref(`pos:${route.slug}`, best)
      }, 400)
    }
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [route.slug])

  // ---- selection toolbar ----
  useEffect(() => {
    const onUp = () => {
      setTimeout(() => {
        const sel = getSelection()
        const root = article.current
        if (!sel || sel.isCollapsed || !root || !sel.rangeCount) return setToolbar(null)
        const range = sel.getRangeAt(0)
        if (!root.contains(range.commonAncestorContainer)) return setToolbar(null)
        const rect = range.getBoundingClientRect()
        setToolbar({ x: Math.min(innerWidth - 300, Math.max(8, rect.left + rect.width / 2 - 140)), y: rect.top - 48, range: range.cloneRange() })
      }, 0)
    }
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.seltool')) setToolbar(null)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey) onUp()
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])

  const save = useCallback((next: Annotation[]) => setAnnotations(route.slug, next), [route.slug, setAnnotations])

  const addFromRange = useCallback(
    (range: Range, kind: Annotation['kind'], color: Color = 'y', withNote = false) => {
      const root = article.current
      if (!root) return
      const d = describeRange(root, range)
      if (!d) return
      const sec = sectionAt(buildIndex(root), root, d.start)
      const now = new Date().toISOString()
      const a: Annotation = {
        id: uid(),
        kind,
        color: kind === 'highlight' ? color : undefined,
        exact: d.exact,
        prefix: d.prefix,
        suffix: d.suffix,
        section: sec?.id,
        sectionTitle: sec?.title,
        created: now,
        updated: now,
      }
      save([...anns, a])
      getSelection()?.removeAllRanges()
      setToolbar(null)
      setSelected(a.id)
      if (withNote) {
        setEditing(a.id)
        state.setNotes(true)
      }
    },
    [anns, save, state],
  )

  const bookmarkHeading = useCallback(
    (id: string) => {
      const h = document.getElementById(id)
      const root = article.current
      if (!h || !root) return
      const existing = anns.find((a) => a.kind === 'bookmark' && a.section === id && a.exact.replace(/\s+/g, ' ').trim() === headingText(h))
      if (existing) {
        save(anns.filter((a) => a.id !== existing.id))
        return
      }
      const range = document.createRange()
      range.selectNodeContents(h)
      const ui = h.querySelector('[data-ui]')
      if (ui) range.setEndBefore(ui)
      addFromRange(range, 'bookmark')
    },
    [anns, save, addFromRange],
  )

  // keyboard shortcuts
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (/input|textarea|select/.test(tag) || (document.activeElement as HTMLElement)?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') {
        e.preventDefault()
        state.setToc(!state.toc)
      } else if (e.key === ']') {
        e.preventDefault()
        state.setNotes(!state.notes)
      } else if (e.key === 'Escape') {
        setToolbar(null)
        setSelected(null)
        setEditing(null)
      } else if (toolbar && (e.key === 'h' || e.key === 'n' || e.key === 'b')) {
        e.preventDefault()
        addFromRange(toolbar.range, e.key === 'b' ? 'bookmark' : 'highlight', 'y', e.key === 'n')
      }
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [state, toolbar, addFromRange])

  // external selection (from search results / notes page)
  useEffect(() => {
    const on = (e: Event) => {
      setSelected((e as CustomEvent<string>).detail)
      state.setNotes(true)
    }
    document.addEventListener('reader:select', on)
    return () => document.removeEventListener('reader:select', on)
  }, [state])

  // clicks inside the article: in-doc links, highlights, heading bookmarks
  const onArticleClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    const bm = t.closest('button.hbm') as HTMLElement | null
    if (bm) {
      e.preventDefault()
      bookmarkHeading(bm.dataset.bm || '')
      return
    }
    const hl = t.closest('.hl,.bm') as HTMLElement | null
    if (hl && !t.closest('a')) {
      const id = hl.dataset.id || null
      setSelected(id)
      setEditing(null)
      state.setNotes(true)
      return
    }
    const a = t.closest('a[href^="#"]') as HTMLAnchorElement | null
    if (a) {
      const id = decodeURIComponent(a.getAttribute('href')!.slice(1))
      if (id.startsWith('/')) return // app route
      e.preventDefault()
      state.goTo(id)
      setTip(null)
    }
  }

  // citation tooltips
  const onArticleOver = (e: React.MouseEvent) => {
    const ref = (e.target as HTMLElement).closest('a.ref') as HTMLElement | null
    if (!ref || !r) {
      if (tip) setTip(null)
      return
    }
    const info = r.refs[ref.dataset.ref || '']
    if (!info) return
    const rect = ref.getBoundingClientRect()
    setTip({ x: rect.left, y: rect.bottom + 8, html: `<b>${esc(info.title)}</b>${esc(info.text)}` })
  }

  const update = (id: string, patch: Partial<Annotation>) => save(anns.map((a) => (a.id === id ? { ...a, ...patch, updated: new Date().toISOString() } : a)))
  const remove = (id: string) => {
    save(anns.filter((a) => a.id !== id))
    if (selected === id) setSelected(null)
  }

  // keep the selected annotation visible in the rail
  useEffect(() => {
    if (!selected) return
    const el = document.querySelector(`.notes [data-ann="${CSS.escape(selected)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!doc || !r) {
    return (
      <main className="page">
        <div className="wrap">
          <p className="muted">{docs.length ? 'No such document.' : 'Loading…'}</p>
        </div>
      </main>
    )
  }

  const sorted = anns
    .filter((a) => (noteFilter === 'all' ? true : noteFilter === 'bookmark' ? a.kind === 'bookmark' : noteFilter === 'note' ? !!a.note : a.kind === 'highlight' && !a.note))
    .sort((a, b) => (positions[a.id] ?? 1e12) - (positions[b.id] ?? 1e12))
  const counts = {
    highlight: anns.filter((a) => a.kind === 'highlight' && !a.note).length,
    note: anns.filter((a) => a.note).length,
    bookmark: anns.filter((a) => a.kind === 'bookmark').length,
  }

  return (
    <div className={'layout' + (state.toc ? ' has-toc' : '') + (state.notes ? ' has-notes' : '')}>
      <nav className={'toc' + (state.toc ? ' open' : '')} id="toc" aria-label="Index">
        <div className="tochead">
          <span>Index</span>
          <button className="link-btn" onClick={() => state.setToc(false)} title="Hide index ([)">Hide</button>
        </div>
        <TocList headings={r.headings} active={active} route={route} q={state.q} onPick={(id) => { state.goTo(id); if (matchMedia('(max-width: 900px)').matches) state.setToc(false) }} />
      </nav>
      {state.toc && <div className="scrim" onClick={() => state.setToc(false)} />}

      <main id="main">
        <div className="wrap">
          <div className="meta-row">
            <span className="pill">{doc.words.toLocaleString()} words · {readingTime(doc.words)}</span>
            {doc.added && <span className="pill">added {doc.added}</span>}
            {anns.length > 0 && (
              <span className="pill">
                {counts.highlight} highlights · {counts.note} notes · {counts.bookmark} bookmarks
              </span>
            )}
            {doc.tags.map((t) => (
              <span className="pill" key={t}>{t}</span>
            ))}
          </div>
          <div className="article prose" ref={article} onClick={onArticleClick} onMouseOver={onArticleOver} />
        </div>
        <button className="iconbtn totop" onClick={() => scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">↑</button>
      </main>

      <aside className={'notes' + (state.notes ? ' open' : '')} aria-label="Annotations">
        <div className="tochead">
          <span>Annotations · {anns.length}</span>
          <button className="link-btn" onClick={() => state.setNotes(false)} title="Hide annotations (])">Hide</button>
        </div>
        <div className="fgroup small">
          {(['all', 'highlight', 'note', 'bookmark'] as const).map((f) => (
            <button key={f} className="chip" aria-pressed={noteFilter === f} onClick={() => setNoteFilter(f)}>
              {f === 'all' ? `All` : f === 'highlight' ? `Highlights ${counts.highlight}` : f === 'note' ? `Notes ${counts.note}` : `Bookmarks ${counts.bookmark}`}
            </button>
          ))}
        </div>
        {!anns.length && <p className="muted small pad">Select any text to highlight it, add a note or bookmark it. Hover a heading for its bookmark button.</p>}
        <ul className="annlist">
          {sorted.map((a) => (
            <AnnotationCard
              key={a.id}
              a={a}
              selected={selected === a.id}
              onOpen={() => {
                setSelected(a.id)
                state.goToAnnotation(a.id)
              }}
            >
              {selected === a.id || editing === a.id ? (
                <div className="annedit">
                  {a.kind === 'highlight' && (
                    <div className="swatches">
                      {COLORS.map((c) => (
                        <button key={c.c} className={'sw c-' + c.c + (a.color === c.c ? ' on' : '')} title={c.name} onClick={() => update(a.id, { color: c.c })} />
                      ))}
                    </div>
                  )}
                  <textarea
                    autoFocus={editing === a.id}
                    placeholder="Add a note…"
                    defaultValue={a.note || ''}
                    rows={3}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== (a.note || '')) update(a.id, { note: v || undefined })
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur()
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur()
                    }}
                  />
                  <div className="row between">
                    <span className="muted small">{a.updated.slice(0, 10)}</span>
                    <button className="link-btn danger" onClick={() => remove(a.id)}>Delete</button>
                  </div>
                </div>
              ) : (
                a.note && <p className="annnote">{a.note}</p>
              )}
            </AnnotationCard>
          ))}
        </ul>
      </aside>

      {toolbar && (
        <div className="seltool" style={{ left: toolbar.x, top: Math.max(64, toolbar.y) }} role="toolbar" aria-label="Annotate selection">
          {COLORS.map((c) => (
            <button key={c.c} className={'sw c-' + c.c} title={`Highlight ${c.name.toLowerCase()} (h)`} onMouseDown={(e) => e.preventDefault()} onClick={() => addFromRange(toolbar.range, 'highlight', c.c)} />
          ))}
          <span className="sep" />
          <button title="Highlight and add a note (n)" onMouseDown={(e) => e.preventDefault()} onClick={() => addFromRange(toolbar.range, 'highlight', 'y', true)}>Note</button>
          <button title="Bookmark this passage (b)" onMouseDown={(e) => e.preventDefault()} onClick={() => addFromRange(toolbar.range, 'bookmark')}>Bookmark</button>
          <button title="Copy" onMouseDown={(e) => e.preventDefault()} onClick={() => { void navigator.clipboard.writeText(toolbar.range.toString()); setToolbar(null) }}>Copy</button>
        </div>
      )}
      {tip && <div className="tip on" style={{ left: Math.min(tip.x, innerWidth - 380), top: tip.y }} dangerouslySetInnerHTML={{ __html: tip.html }} />}
    </div>
  )
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

function TocList({ headings, active, route, q, onPick }: { headings: { id: string; level: number; title: string }[]; active: string | null; route: R; q: string; onPick: (id: string) => void }) {
  // nest by level: a heading is a child of the nearest previous heading with a smaller level
  const shown = headings.filter((h) => h.level <= 3)
  const minLevel = Math.min(...shown.map((h) => h.level), 6)
  type Node = { h: (typeof shown)[number]; kids: Node[] }
  const roots: Node[] = []
  const stack: Node[] = []
  for (const h of shown) {
    const n: Node = { h, kids: [] }
    while (stack.length && stack[stack.length - 1].h.level >= h.level) stack.pop()
    if (stack.length) stack[stack.length - 1].kids.push(n)
    else roots.push(n)
    stack.push(n)
  }
  const render = (ns: Node[]) => (
    <ul>
      {ns.map((n) => (
        <li key={n.h.id}>
          <a
            className={active === n.h.id ? 'active' : ''}
            href={hrefFor({ ...route, at: n.h.id, q })}
            onClick={(e) => {
              e.preventDefault()
              onPick(n.h.id)
            }}
          >
            {n.h.title}
          </a>
          {n.kids.length > 0 && render(n.kids)}
        </li>
      ))}
    </ul>
  )
  void minLevel
  return render(roots)
}
