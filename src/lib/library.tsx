import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Annotation, Doc, DocMeta } from './types'
import { loadSettings, saveSettings, type Settings } from './settings'
import { makeStore, type Store } from './storage'
import { parseFrontmatter, withFrontmatter } from './frontmatter'
import { docTitle, render, type Rendered } from './markdown'
import { slugify } from './slug'

export type SyncStatus = { state: 'idle' | 'loading' | 'saving' | 'saved' | 'error'; message?: string }

interface LibraryApi {
  settings: Settings
  updateSettings: (s: Settings) => void
  store: Store
  docs: Doc[]
  loading: boolean
  error: string | null
  status: SyncStatus
  annotations: Record<string, Annotation[]>
  rendered: (doc: Doc) => Rendered
  renderedIfReady: (slug: string) => Rendered | undefined
  importFiles: (files: FileList | File[]) => Promise<string[]>
  importText: (name: string, markdown: string) => Promise<string>
  deleteDoc: (slug: string) => Promise<void>
  setAnnotations: (slug: string, next: Annotation[]) => void
  reload: () => Promise<void>
}

const Ctx = createContext<LibraryApi | null>(null)

function toDoc(meta: DocMeta, markdown: string): Doc {
  const fm = parseFrontmatter(markdown)
  return {
    ...meta,
    markdown,
    title: docTitle(markdown, meta.slug),
    tags: fm.tags,
    added: fm.added,
    words: fm.body.split(/\s+/).filter(Boolean).length,
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const store = useMemo(() => makeStore(settings), [settings])
  const [docs, setDocs] = useState<Doc[]>([])
  const [annotations, setAnn] = useState<Record<string, Annotation[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle' })
  const renderCache = useRef(new Map<string, Rendered>())
  const [, bump] = useState(0)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const metas = await store.list()
      const loaded = await Promise.all(metas.map(async (m) => toDoc(m, await store.read(m))))
      setDocs(loaded)
      const anns: Record<string, Annotation[]> = {}
      await Promise.all(loaded.map(async (d) => (anns[d.slug] = await store.readAnnotations(d.slug))))
      setAnn(anns)
    } catch (e) {
      setError((e as Error).message || String(e))
    } finally {
      setLoading(false)
    }
  }, [store])

  useEffect(() => {
    void reload()
  }, [reload])

  // Render documents lazily in idle time so cross-library search has sections to work with.
  useEffect(() => {
    let cancelled = false
    const queue = docs.filter((d) => !renderCache.current.has(d.slug + ':' + (d.sha || d.markdown.length)))
    const step = () => {
      if (cancelled) return
      const d = queue.shift()
      if (!d) return
      renderCache.current.set(d.slug + ':' + (d.sha || d.markdown.length), render(d.markdown))
      bump((n) => n + 1)
      setTimeout(step, 0)
    }
    const t = setTimeout(step, 50)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [docs])

  const rendered = useCallback((doc: Doc) => {
    const key = doc.slug + ':' + (doc.sha || doc.markdown.length)
    let r = renderCache.current.get(key)
    if (!r) {
      r = render(doc.markdown)
      renderCache.current.set(key, r)
    }
    return r
  }, [])
  const renderedIfReady = useCallback(
    (slug: string) => {
      const d = docs.find((x) => x.slug === slug)
      return d ? renderCache.current.get(d.slug + ':' + (d.sha || d.markdown.length)) : undefined
    },
    [docs],
  )

  const updateSettings = useCallback((s: Settings) => {
    saveSettings(s)
    setSettings(s)
  }, [])

  const importText = useCallback(
    async (name: string, markdown: string) => {
      const base = slugify(name.replace(/\.(md|markdown|txt)$/i, ''))
      let slug = base
      let i = 2
      while (docs.some((d) => d.slug === slug)) slug = `${base}-${i++}`
      const fm = parseFrontmatter(markdown)
      const md = fm.added ? markdown : withFrontmatter(markdown, { added: new Date().toISOString().slice(0, 10) })
      setStatus({ state: 'saving', message: `Importing ${name}` })
      try {
        const meta = await store.write(slug, md, `Add ${docTitle(md, slug)}`)
        setDocs((ds) => [...ds, toDoc(meta, md)])
        setAnn((a) => ({ ...a, [slug]: [] }))
        setStatus({ state: 'saved' })
      } catch (e) {
        setStatus({ state: 'error', message: (e as Error).message })
        throw e
      }
      return slug
    },
    [docs, store],
  )

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const out: string[] = []
      for (const f of Array.from(files)) {
        if (!/\.(md|markdown|txt)$/i.test(f.name)) continue
        out.push(await importText(f.name, await f.text()))
      }
      return out
    },
    [importText],
  )

  const deleteDoc = useCallback(
    async (slug: string) => {
      setStatus({ state: 'saving', message: 'Deleting' })
      try {
        await store.remove(slug)
        setDocs((ds) => ds.filter((d) => d.slug !== slug))
        setAnn((a) => {
          const n = { ...a }
          delete n[slug]
          return n
        })
        setStatus({ state: 'saved' })
      } catch (e) {
        setStatus({ state: 'error', message: (e as Error).message })
        throw e
      }
    },
    [store],
  )

  // Debounced annotation persistence: optimistic in memory, one write per burst of edits.
  const pending = useRef(new Map<string, Annotation[]>())
  const timer = useRef<number | null>(null)
  const flush = useCallback(async () => {
    timer.current = null
    const batch = Array.from(pending.current.entries())
    pending.current.clear()
    if (!batch.length) return
    setStatus({ state: 'saving', message: 'Saving notes' })
    try {
      for (const [slug, anns] of batch) await store.writeAnnotations(slug, anns)
      setStatus({ state: 'saved' })
    } catch (e) {
      setStatus({ state: 'error', message: (e as Error).message })
      for (const [slug, anns] of batch) if (!pending.current.has(slug)) pending.current.set(slug, anns)
    }
  }, [store])
  const setAnnotations = useCallback(
    (slug: string, next: Annotation[]) => {
      setAnn((a) => ({ ...a, [slug]: next }))
      pending.current.set(slug, next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, 1200)
    },
    [flush],
  )
  useEffect(() => {
    const onHide = () => {
      if (pending.current.size) void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onHide)
    }
  }, [flush])

  const api: LibraryApi = {
    settings,
    updateSettings,
    store,
    docs,
    loading,
    error,
    status,
    annotations,
    rendered,
    renderedIfReady,
    importFiles,
    importText,
    deleteDoc,
    setAnnotations,
    reload,
  }
  if (import.meta.env.DEV) (window as unknown as { __reading: LibraryApi }).__reading = api
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useLibrary(): LibraryApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLibrary outside provider')
  return v
}
