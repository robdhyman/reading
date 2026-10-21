import { get, set, del, keys } from 'idb-keyval'
import type { Annotation, DocMeta } from '../types'
import { LIB_DIR, type Store } from './types'

const D = 'doc:'
const A = 'ann:'

export class LocalStore implements Store {
  readonly kind = 'local' as const

  async list(): Promise<DocMeta[]> {
    const ks = (await keys()) as string[]
    return ks
      .filter((k) => typeof k === 'string' && k.startsWith(D))
      .map((k) => k.slice(D.length))
      .sort()
      .map((slug) => ({ slug, path: `${LIB_DIR}/${slug}.md` }))
  }
  async read(meta: DocMeta): Promise<string> {
    return (await get<string>(D + meta.slug)) ?? ''
  }
  async write(slug: string, markdown: string): Promise<DocMeta> {
    await set(D + slug, markdown)
    return { slug, path: `${LIB_DIR}/${slug}.md`, size: markdown.length }
  }
  async remove(slug: string): Promise<void> {
    await del(D + slug)
    await del(A + slug)
  }
  async readAnnotations(slug: string): Promise<Annotation[]> {
    return (await get<Annotation[]>(A + slug)) ?? []
  }
  async writeAnnotations(slug: string, annotations: Annotation[]): Promise<void> {
    await set(A + slug, annotations)
  }
}
