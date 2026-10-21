import { useEffect, useState } from 'react'

export type Route =
  | { page: 'library'; q: string }
  | { page: 'read'; slug: string; at?: string; q: string; ann?: string }
  | { page: 'notes'; q: string }
  | { page: 'settings' }

export function parseHash(h = location.hash): Route {
  const [pathPart, qs = ''] = h.replace(/^#\/?/, '').split('?')
  const params = new URLSearchParams(qs)
  const q = params.get('q') || ''
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'read' && parts[1]) return { page: 'read', slug: parts[1], at: parts[2], q, ann: params.get('ann') || undefined }
  if (parts[0] === 'notes') return { page: 'notes', q }
  if (parts[0] === 'settings') return { page: 'settings' }
  return { page: 'library', q }
}

export function hrefFor(r: Route): string {
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? '?' + s : ''
  }
  switch (r.page) {
    case 'library':
      return '#/' + qs({ q: r.q })
    case 'read':
      return `#/read/${encodeURIComponent(r.slug)}${r.at ? '/' + encodeURIComponent(r.at) : ''}` + qs({ q: r.q, ann: r.ann })
    case 'notes':
      return '#/notes' + qs({ q: r.q })
    case 'settings':
      return '#/settings'
  }
}

export function navigate(r: Route, replace = false) {
  const h = hrefFor(r)
  if (replace) history.replaceState(null, '', h)
  else location.hash = h
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(parseHash)
  useEffect(() => {
    const on = () => setR(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}
