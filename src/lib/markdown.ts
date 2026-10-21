import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Section } from './types'
import { slugify } from './slug'
import { parseFrontmatter } from './frontmatter'

export interface Rendered {
  html: string
  sections: Section[]
  /** nested-by-level list for the index rail (flat, with level) */
  headings: { id: string; level: number; title: string }[]
  title: string
  words: number
  /** `[N]` citation targets: number -> heading id */
  refs: Record<string, { id: string; title: string; text: string }>
}

marked.setOptions({ gfm: true, breaks: false })

/**
 * Markdown -> sanitised HTML, post-processed in a detached DOM:
 *  - every heading gets a stable, unique id
 *  - content is wrapped into flat `<section class="sec">` blocks, one per heading
 *  - tables get a scroll wrapper
 *  - `[N]` citations become links when a heading `[N]. …` exists
 *  - a bookmark button is attached to each heading (marked data-ui so text indexing skips it)
 */
export function render(markdown: string): Rendered {
  const fm = parseFrontmatter(markdown)
  const rawHtml = marked.parse(fm.body, { async: false }) as string
  const clean = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'] })
  const doc = new DOMParser().parseFromString(`<div id="root">${clean}</div>`, 'text/html')
  const root = doc.getElementById('root')!

  // headings: ids
  const seen = new Set<string>()
  const headings: Rendered['headings'] = []
  const refs: Rendered['refs'] = {}
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const title = h.textContent?.trim() || 'Untitled'
    let id = slugify(title)
    let i = 2
    while (seen.has(id)) id = `${slugify(title)}-${i++}`
    seen.add(id)
    h.id = id
    const level = +h.tagName[1]
    headings.push({ id, level, title })
    const r = title.match(/^\[(\d+)\]\.?\s/)
    if (r) refs[r[1]] = { id, title, text: '' }
  })

  // flat sections
  const sections: Section[] = []
  const wrapper = doc.createElement('div')
  let cur: HTMLElement | null = null
  let curSec: Section | null = null
  const startSection = (id: string, level: number, title: string) => {
    cur = doc.createElement('section')
    cur.className = 'sec'
    cur.dataset.sec = id
    wrapper.appendChild(cur)
    curSec = { id, level, title, text: '' }
    sections.push(curSec)
  }
  const children = Array.from(root.childNodes)
  const first = children.find((n) => n.nodeType === 1 || (n.nodeType === 3 && n.nodeValue?.trim()))
  if (!first || first.nodeType !== 1 || !/^H[1-6]$/.test((first as Element).tagName)) {
    startSection('top', 0, fm.title || 'Preface')
  }
  for (const n of children) {
    if (n.nodeType === 1 && /^H[1-6]$/.test((n as Element).tagName)) {
      const h = n as HTMLElement
      startSection(h.id, +h.tagName[1], h.textContent?.trim() || '')
    }
    cur!.appendChild(n)
  }
  for (const s of sections) {
    const el = wrapper.querySelector(`[data-sec="${CSS.escape(s.id)}"]`)!
    s.text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    const r = s.title.match(/^\[(\d+)\]\.?\s/)
    if (r && refs[r[1]]) refs[r[1]].text = s.text.slice(s.title.length).trim().slice(0, 260)
  }

  // tables
  wrapper.querySelectorAll('table').forEach((t) => {
    const w = doc.createElement('div')
    w.className = 'table-wrap'
    t.replaceWith(w)
    w.appendChild(t)
  })
  // external links open in a new tab
  wrapper.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener')
  })

  // citations [N] / [N, M]
  if (Object.keys(refs).length) {
    const walker = doc.createTreeWalker(wrapper, 1 /* ELEMENT */ | 4 /* TEXT */)
    const textNodes: Text[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3 && !(node.parentNode as Element).closest('a,code,pre,h1,h2,h3,h4,h5,h6')) textNodes.push(node as Text)
    }
    const re = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g
    for (const t of textNodes) {
      const s = t.nodeValue || ''
      if (!re.test(s)) continue
      re.lastIndex = 0
      const frag = doc.createDocumentFragment()
      let i = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(s))) {
        const nums = m[1].split(/\s*[,–-]\s*/)
        if (!nums.every((n) => refs[n])) continue
        frag.appendChild(doc.createTextNode(s.slice(i, m.index) + '['))
        nums.forEach((n, k) => {
          if (k) frag.appendChild(doc.createTextNode(m![1].includes('–') || m![1].includes('-') ? '–' : ', '))
          const a = doc.createElement('a')
          a.className = 'ref'
          a.href = '#' + refs[n].id
          a.dataset.ref = n
          a.textContent = n
          frag.appendChild(a)
        })
        frag.appendChild(doc.createTextNode(']'))
        i = m.index + m[0].length
      }
      if (i === 0) continue
      frag.appendChild(doc.createTextNode(s.slice(i)))
      t.replaceWith(frag)
    }
  }

  // heading bookmark buttons
  wrapper.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const b = doc.createElement('button')
    b.className = 'hbm'
    b.dataset.ui = '1'
    b.dataset.bm = h.id
    b.title = 'Bookmark this section'
    b.setAttribute('aria-label', 'Bookmark this section')
    b.textContent = '🔖'
    h.appendChild(b)
  })

  const words = fm.body.split(/\s+/).filter(Boolean).length
  const title = fm.title || headings.find((h) => h.level === 1)?.title || headings[0]?.title || 'Untitled'
  return { html: wrapper.innerHTML, sections, headings, title, words, refs }
}

export function docTitle(markdown: string, fallback: string): string {
  const fm = parseFrontmatter(markdown)
  if (fm.title) return fm.title
  const h = fm.body.match(/^#\s+(.+)$/m)
  return h ? h[1].trim().replace(/[*_`]/g, '') : fallback
}

export function readingTime(words: number): string {
  const m = Math.max(1, Math.round(words / 230))
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}
