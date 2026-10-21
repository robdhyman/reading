import type { TextQuote } from './types'

/**
 * Text-quote anchoring over a rendered article.
 *
 * The article's text nodes are concatenated into one string with an offset map,
 * so a highlight is described by what it says (exact + prefix + suffix) rather
 * than by DOM position. That survives re-rendering, search marks splitting text
 * nodes, and even small edits to the markdown.
 */

export interface TextIndex {
  text: string
  nodes: { node: Text; start: number }[]
}

const SKIP = 'script,style,[data-ui]'

export function buildIndex(root: Element): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentNode as Element).closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  const nodes: TextIndex['nodes'] = []
  let text = ''
  let n: Node | null
  while ((n = walker.nextNode())) {
    nodes.push({ node: n as Text, start: text.length })
    text += (n as Text).nodeValue || ''
  }
  return { text, nodes }
}

function pointToOffset(idx: TextIndex, container: Node, offset: number): number {
  if (container.nodeType === 3) {
    const e = idx.nodes.find((x) => x.node === container)
    return e ? e.start + offset : -1
  }
  // element: take the first text node at/after the child boundary
  const kids = container.childNodes
  for (let i = offset; i < kids.length; i++) {
    const first = firstText(kids[i])
    if (first) {
      const e = idx.nodes.find((x) => x.node === first)
      if (e) return e.start
    }
  }
  // past the end: use the last text node before
  for (let i = offset - 1; i >= 0; i--) {
    const last = lastText(kids[i])
    if (last) {
      const e = idx.nodes.find((x) => x.node === last)
      if (e) return e.start + (last.nodeValue?.length || 0)
    }
  }
  return -1
}
function firstText(n: Node): Text | null {
  if (n.nodeType === 3) return n as Text
  for (const k of Array.from(n.childNodes)) {
    const t = firstText(k)
    if (t) return t
  }
  return null
}
function lastText(n: Node): Text | null {
  if (n.nodeType === 3) return n as Text
  for (const k of Array.from(n.childNodes).reverse()) {
    const t = lastText(k)
    if (t) return t
  }
  return null
}

const CTX = 32

/** Describe a live selection Range as a text quote (or null if it is empty / outside root). */
export function describeRange(root: Element, range: Range): (TextQuote & { start: number; end: number }) | null {
  if (!root.contains(range.commonAncestorContainer)) return null
  const idx = buildIndex(root)
  const start = pointToOffset(idx, range.startContainer, range.startOffset)
  const end = pointToOffset(idx, range.endContainer, range.endOffset)
  if (start < 0 || end < 0 || end <= start) return null
  const exact = idx.text.slice(start, end)
  if (!exact.trim()) return null
  return {
    exact,
    prefix: idx.text.slice(Math.max(0, start - CTX), start),
    suffix: idx.text.slice(end, end + CTX),
    start,
    end,
  }
}

/** Find the best offset for a quote: exact match, disambiguated by context; falls back to whitespace-insensitive search. */
export function locate(idx: TextIndex, q: TextQuote): { start: number; end: number } | null {
  const { text } = idx
  const candidates: number[] = []
  let i = text.indexOf(q.exact)
  while (i >= 0 && candidates.length < 200) {
    candidates.push(i)
    i = text.indexOf(q.exact, i + 1)
  }
  if (!candidates.length) {
    // whitespace-insensitive fallback
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    const target = norm(q.exact)
    if (!target) return null
    // build a map from normalised offsets back to raw offsets
    const map: number[] = []
    let out = ''
    let ws = false
    for (let k = 0; k < text.length; k++) {
      const c = text[k]
      if (/\s/.test(c)) {
        if (!ws && out.length) {
          out += ' '
          map.push(k)
        }
        ws = true
      } else {
        out += c
        map.push(k)
        ws = false
      }
    }
    const j = out.indexOf(target)
    if (j < 0) return null
    return { start: map[j], end: map[j + target.length - 1] + 1 }
  }
  if (candidates.length === 1) return { start: candidates[0], end: candidates[0] + q.exact.length }
  let best = candidates[0]
  let bestScore = -1
  for (const c of candidates) {
    const pre = text.slice(Math.max(0, c - CTX), c)
    const suf = text.slice(c + q.exact.length, c + q.exact.length + CTX)
    const score = commonSuffix(pre, q.prefix) + commonPrefix(suf, q.suffix)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return { start: best, end: best + q.exact.length }
}
function commonPrefix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}
function commonSuffix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

/**
 * Wrap the text between two global offsets in elements produced by `make()`.
 * Splits boundary text nodes; one wrapper per text node touched.
 * NOTE: this mutates the DOM, so the caller's TextIndex is stale afterwards.
 */
export function wrapRange(idx: TextIndex, start: number, end: number, make: () => HTMLElement): HTMLElement[] {
  const made: HTMLElement[] = []
  for (const { node, start: ns } of idx.nodes) {
    const len = node.nodeValue?.length || 0
    const ne = ns + len
    if (ne <= start || ns >= end) continue
    const from = Math.max(0, start - ns)
    const to = Math.min(len, end - ns)
    let target: Text = node
    if (from > 0) target = target.splitText(from)
    if (to - from < (target.nodeValue?.length || 0)) target.splitText(to - from)
    if (!target.nodeValue?.trim() && target.nodeValue?.includes('\n')) continue // skip pure newline between blocks
    const w = make()
    target.parentNode?.replaceChild(w, target)
    w.appendChild(target)
    made.push(w)
  }
  return made
}

/** Remove wrappers matching `selector`, merging text back together. */
export function unwrapAll(root: Element, selector: string) {
  root.querySelectorAll(selector).forEach((el) => {
    const p = el.parentNode
    if (!p) return
    while (el.firstChild) p.insertBefore(el.firstChild, el)
    p.removeChild(el)
    p.normalize()
  })
}

/** Visible text of a heading, ignoring injected UI such as the bookmark button. */
export function headingText(h: Element): string {
  const c = h.cloneNode(true) as Element
  c.querySelectorAll('[data-ui]').forEach((x) => x.remove())
  return (c.textContent || '').replace(/\s+/g, ' ').trim()
}

/** Heading id of the section containing a global offset. */
export function sectionAt(idx: TextIndex, root: Element, offset: number): { id: string; title: string } | null {
  // prefer the node that *contains* the offset; a boundary offset belongs to the following node
  const hit = idx.nodes.find(({ node, start }) => offset >= start && offset < start + (node.nodeValue?.length || 0)) || idx.nodes.find(({ node, start }) => offset >= start && offset <= start + (node.nodeValue?.length || 0))
  for (const { node } of hit ? [hit] : []) {
    {
      const sec = (node.parentNode as Element).closest('.sec') as HTMLElement | null
      if (!sec) return null
      const h = sec.querySelector('h1,h2,h3,h4,h5,h6')
      return { id: sec.dataset.sec || '', title: h ? headingText(h) : '' }
    }
  }
  const _ = root
  void _
  return null
}
