export function tokenize(raw: string): string[] {
  return (raw.toLowerCase().match(/"[^"]+"|\S+/g) || []).map((t) => t.replace(/"/g, '')).filter(Boolean)
}

export function reEsc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export interface Searchable {
  /** stable id */
  id: string
  /** category label shown in the results list, e.g. H2, Note, Doc */
  kind: string
  title: string
  text: string
  /** optional grouping key (document slug) */
  group?: string
  groupTitle?: string
  /** rank adjustment, lower = earlier among equal scores */
  order?: number
}

export interface Hit<T extends Searchable = Searchable> {
  item: T
  score: number
}

/** Every token must appear in title or text; title hits weigh 50, body hits up to 20 per token. */
export function search<T extends Searchable>(items: T[], toks: string[], limit = 120): Hit<T>[] {
  if (!toks.length) return []
  const hits: Hit<T>[] = []
  for (const it of items) {
    const t = it.title.toLowerCase()
    const x = it.text.toLowerCase()
    if (!toks.every((k) => t.includes(k) || x.includes(k))) continue
    let score = 0
    for (const k of toks) {
      if (t.includes(k)) score += 50
      score += Math.min(20, x.split(k).length - 1)
    }
    hits.push({ item: it, score })
  }
  hits.sort((a, b) => b.score - a.score || (a.item.order ?? 0) - (b.item.order ?? 0))
  return hits.slice(0, limit)
}

/** HTML snippet around the first token, with <mark>. */
export function snippet(x: string, toks: string[], width = 150): string {
  const tok = toks.find((t) => x.toLowerCase().includes(t)) || toks[0]
  const i = tok ? x.toLowerCase().indexOf(tok) : -1
  if (i < 0) return esc(x.slice(0, width)) + (x.length > width ? '…' : '')
  const a = Math.max(0, i - Math.floor(width * 0.4))
  const s = (a ? '…' : '') + x.slice(a, i + tok.length + Math.floor(width * 0.6)) + '…'
  const re = new RegExp(toks.map((t) => reEsc(esc(t))).join('|'), 'gi')
  return esc(s).replace(re, (m) => `<mark>${m}</mark>`)
}

/** Mark every token occurrence inside `el`'s text nodes (skips data-ui and existing marks). */
export function markIn(el: Element, re: RegExp): number {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentNode as Element).closest('script,style,[data-ui],mark.hit') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  const nodes: Text[] = []
  while (w.nextNode()) nodes.push(w.currentNode as Text)
  let count = 0
  for (const n of nodes) {
    const s = n.nodeValue || ''
    re.lastIndex = 0
    if (!re.test(s)) continue
    re.lastIndex = 0
    const f = document.createDocumentFragment()
    let i = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) {
      if (m.index > i) f.appendChild(document.createTextNode(s.slice(i, m.index)))
      const mk = document.createElement('mark')
      mk.className = 'hit'
      mk.textContent = m[0]
      f.appendChild(mk)
      count++
      i = m.index + m[0].length
      if (!m[0].length) re.lastIndex++
    }
    if (i < s.length) f.appendChild(document.createTextNode(s.slice(i)))
    n.parentNode?.replaceChild(f, n)
  }
  return count
}
