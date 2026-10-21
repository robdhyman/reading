import type { Annotation, DocMeta } from '../types'

/**
 * A Store is where the library lives. Two implementations:
 *  - LocalStore: IndexedDB in this browser (zero setup; good for trying the app)
 *  - GitHubStore: a repository, `library/<slug>.md` + `annotations/<slug>.json`, one commit per save
 */
export interface Store {
  readonly kind: 'local' | 'github'
  /** List every document in the library (cheap: no content). */
  list(): Promise<DocMeta[]>
  /** Markdown source of one document. */
  read(meta: DocMeta): Promise<string>
  /** Create or replace a document. */
  write(slug: string, markdown: string, message?: string): Promise<DocMeta>
  remove(slug: string): Promise<void>
  readAnnotations(slug: string): Promise<Annotation[]>
  writeAnnotations(slug: string, annotations: Annotation[]): Promise<void>
}

export const LIB_DIR = 'library'
export const ANN_DIR = 'annotations'
