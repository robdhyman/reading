export interface Frontmatter {
  title?: string
  tags: string[]
  added?: string
  body: string
  raw: Record<string, string>
}

/** Minimal YAML-ish frontmatter: `key: value` lines between `---` fences. */
export function parseFrontmatter(md: string): Frontmatter {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const raw: Record<string, string> = {}
  if (!m) return { tags: [], body: md, raw }
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (kv) raw[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  const tags = (raw.tags || '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
  return { title: raw.title, tags, added: raw.added || raw.date, body: md.slice(m[0].length), raw }
}

export function withFrontmatter(md: string, fields: Record<string, string>): string {
  const fm = parseFrontmatter(md)
  const merged = { ...fm.raw, ...fields }
  const lines = Object.entries(merged).map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---\n\n${fm.body.replace(/^\s+/, '')}`
}
