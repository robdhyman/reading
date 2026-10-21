import type { Searchable } from './search'
import type { Annotation, Doc } from './types'
import type { Rendered } from './markdown'

export interface LibItem extends Searchable {
  slug: string
  sectionId?: string
  annotationId?: string
}

export function kindLabel(a: Annotation): string {
  return a.kind === 'bookmark' ? 'Bookmark' : a.note ? 'Note' : 'Highlight'
}

/** Searchable items for one document: its sections plus its annotations. */
export function docItems(doc: Doc, r: Rendered | undefined, anns: Annotation[]): LibItem[] {
  const out: LibItem[] = []
  if (r) {
    r.sections.forEach((s, i) =>
      out.push({ id: `${doc.slug}#${s.id}`, slug: doc.slug, sectionId: s.id, kind: s.level ? `H${s.level}` : 'Doc', title: s.title, text: s.text, group: doc.slug, groupTitle: doc.title, order: i }),
    )
  } else {
    out.push({ id: doc.slug, slug: doc.slug, kind: 'Doc', title: doc.title, text: doc.markdown.replace(/\s+/g, ' '), group: doc.slug, groupTitle: doc.title, order: 0 })
  }
  anns.forEach((a, i) =>
    out.push({
      id: `${doc.slug}@${a.id}`,
      slug: doc.slug,
      annotationId: a.id,
      kind: kindLabel(a),
      title: a.note ? a.note.slice(0, 80) : a.exact.replace(/\s+/g, ' ').slice(0, 80),
      text: [a.exact.replace(/\s+/g, ' '), a.note || '', a.sectionTitle || ''].join(' · '),
      group: doc.slug,
      groupTitle: doc.title,
      order: 1000 + i,
    }),
  )
  return out
}
