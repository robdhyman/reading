export type AnnotationKind = 'highlight' | 'bookmark'
export type Color = 'y' | 'g' | 'b' | 'p'

/** A W3C-style text-quote selector: `exact` plus a little context either side to disambiguate. */
export interface TextQuote {
  exact: string
  prefix: string
  suffix: string
}

export interface Annotation extends TextQuote {
  id: string
  kind: AnnotationKind
  color?: Color
  /** id of the heading section the quote sits in (for context + fallback scrolling) */
  section?: string
  sectionTitle?: string
  note?: string
  created: string
  updated: string
}

export interface DocMeta {
  slug: string
  path: string
  sha?: string
  size?: number
}

export interface Doc extends DocMeta {
  markdown: string
  title: string
  tags: string[]
  added?: string
  words: number
}

export interface Section {
  id: string
  level: number
  title: string
  text: string
}
