import { get, set } from 'idb-keyval'
import type { Annotation, DocMeta } from '../types'
import { ANN_DIR, LIB_DIR, type Store } from './types'

export interface GitHubConfig {
  owner: string
  repo: string
  branch: string
  token: string
}

interface TreeEntry {
  path: string
  sha: string
  size?: number
  type: string
}

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * GitHub-backed library. Reads use the Git Trees + Blobs API (sha-addressed, so content
 * caches in IndexedDB forever by sha); writes use the Contents API (one commit per file).
 */
export class GitHubStore implements Store {
  readonly kind = 'github' as const
  private tree: TreeEntry[] | null = null
  private cfg: GitHubConfig

  constructor(cfg: GitHubConfig) {
    this.cfg = cfg
  }

  private get base() {
    return `https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}`
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(this.base + path, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    })
    if (res.status === 204) return undefined as T
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new GitHubError(res.status, (body as { message?: string }).message || `GitHub ${res.status}`)
    return body as T
  }

  private async loadTree(force = false): Promise<TreeEntry[]> {
    if (this.tree && !force) return this.tree
    try {
      const t = await this.api<{ tree: TreeEntry[]; truncated: boolean }>(`/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`)
      this.tree = t.tree.filter((e) => e.type === 'blob')
    } catch (e) {
      // empty repository or missing branch → empty library
      if (e instanceof GitHubError && (e.status === 404 || e.status === 409)) this.tree = []
      else throw e
    }
    return this.tree!
  }

  private entry(path: string): TreeEntry | undefined {
    return this.tree?.find((e) => e.path === path)
  }

  async list(): Promise<DocMeta[]> {
    const tree = await this.loadTree(true)
    return tree
      .filter((e) => e.path.startsWith(LIB_DIR + '/') && /\.(md|markdown)$/i.test(e.path))
      .map((e) => ({ slug: e.path.slice(LIB_DIR.length + 1).replace(/\.(md|markdown)$/i, ''), path: e.path, sha: e.sha, size: e.size }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
  }

  private async blob(sha: string): Promise<string> {
    const cached = await get<string>('blob:' + sha)
    if (cached !== undefined) return cached
    const b = await this.api<{ content: string; encoding: string }>(`/git/blobs/${sha}`)
    const text = b.encoding === 'base64' ? b64decode(b.content) : b.content
    await set('blob:' + sha, text)
    return text
  }

  async read(meta: DocMeta): Promise<string> {
    let sha = meta.sha
    if (!sha) {
      await this.loadTree()
      sha = this.entry(meta.path)?.sha
    }
    if (!sha) throw new GitHubError(404, `No such document: ${meta.path}`)
    return this.blob(sha)
  }

  private async put(path: string, content: string, message: string, retry = true): Promise<{ sha: string }> {
    await this.loadTree()
    const existing = this.entry(path)
    try {
      const r = await this.api<{ content: { sha: string } }>(`/contents/${encodePath(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: b64encode(content), branch: this.cfg.branch, ...(existing ? { sha: existing.sha } : {}) }),
      })
      const sha = r.content.sha
      if (existing) existing.sha = sha
      else this.tree!.push({ path, sha, type: 'blob', size: content.length })
      await set('blob:' + sha, content)
      return { sha }
    } catch (e) {
      // stale sha → refresh the tree and retry once
      if (retry && e instanceof GitHubError && (e.status === 409 || e.status === 422)) {
        await this.loadTree(true)
        return this.put(path, content, message, false)
      }
      throw e
    }
  }

  async write(slug: string, markdown: string, message?: string): Promise<DocMeta> {
    const path = `${LIB_DIR}/${slug}.md`
    const { sha } = await this.put(path, markdown, message || `Add ${slug}`)
    return { slug, path, sha, size: markdown.length }
  }

  private async rm(path: string) {
    await this.loadTree()
    const e = this.entry(path)
    if (!e) return
    await this.api(`/contents/${encodePath(path)}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: `Remove ${path}`, sha: e.sha, branch: this.cfg.branch }),
    })
    this.tree = this.tree!.filter((x) => x.path !== path)
  }

  async remove(slug: string): Promise<void> {
    await this.rm(`${LIB_DIR}/${slug}.md`)
    await this.rm(`${ANN_DIR}/${slug}.json`)
  }

  async readAnnotations(slug: string): Promise<Annotation[]> {
    await this.loadTree()
    const e = this.entry(`${ANN_DIR}/${slug}.json`)
    if (!e) return []
    try {
      return JSON.parse(await this.blob(e.sha)) as Annotation[]
    } catch {
      return []
    }
  }

  async writeAnnotations(slug: string, annotations: Annotation[]): Promise<void> {
    await this.put(`${ANN_DIR}/${slug}.json`, JSON.stringify(annotations, null, 2) + '\n', `Annotate ${slug}`)
  }
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}
