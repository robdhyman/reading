import { useEffect, useRef, useState, type ReactNode } from 'react'
import { search, snippet, tokenize, type Hit, type Searchable } from '../lib/search'

interface Props<T extends Searchable> {
  items: T[]
  placeholder: string
  value: string
  onChange: (q: string) => void
  onPick: (hit: Hit<T>) => void
  /** extra controls in the results header (e.g. "show only matching") */
  header?: (hits: Hit<T>[]) => ReactNode
  /** total in-document mark count, shown in the header */
  marks?: number
  groupLabel?: (hit: Hit<T>) => string | undefined
}

/**
 * The reference reader's search box: `/` focuses it, results drop down ranked with
 * snippets, arrow keys move the selection, Enter opens, Escape clears.
 */
export function SearchBox<T extends Searchable>({ items, placeholder, value, onChange, onPick, header, marks, groupLabel }: Props<T>) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(-1)
  const [text, setText] = useState(value)
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const toks = tokenize(value)
  const hits = value.trim().length >= 2 ? search(items, toks) : []

  useEffect(() => setText(value), [value])

  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== value) {
        onChange(text)
        setSel(-1)
      }
    }, 160)
    return () => clearTimeout(t)
  }, [text, value, onChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (e.key === '/' && document.activeElement !== input.current && !/input|textarea/.test(tag) && !(document.activeElement as HTMLElement)?.isContentEditable) {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  const pick = (h: Hit<T>) => {
    onPick(h)
    setOpen(false)
  }

  const showing = open && value.trim().length >= 2
  let lastGroup: string | undefined
  return (
    <div className="search" role="search" ref={box}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={input}
        type="search"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!hits.length) return
            const n = (sel + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length
            setSel(n)
            setOpen(true)
            box.current?.querySelectorAll('.ritem')[n]?.scrollIntoView({ block: 'nearest' })
          } else if (e.key === 'Enter') {
            const h = hits[sel < 0 ? 0 : sel]
            if (h) pick(h)
          } else if (e.key === 'Escape') {
            if (text) {
              setText('')
              onChange('')
            }
            setOpen(false)
            input.current?.blur()
          }
        }}
      />
      <kbd>/</kbd>
      <div className={'results' + (showing ? ' open' : '')} role="listbox">
        <div className="rhead">
          <span>
            {hits.length} {hits.length === 1 ? 'result' : 'results'}
            {marks !== undefined ? ` · ${marks} highlights in text` : ''}
          </span>
          {header?.(hits)}
        </div>
        {!hits.length && <div className="rempty">No matches for “{value}”. Try fewer words, or quote a phrase.</div>}
        {hits.slice(0, 80).map((h, i) => {
          const g = groupLabel?.(h)
          const showGroup = g && g !== lastGroup
          lastGroup = g
          return (
            <div key={h.item.id}>
              {showGroup && <div className="rgroup">{g}</div>}
              <a
                className={'ritem' + (i === sel ? ' sel' : '')}
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  pick(h)
                }}
              >
                <span className="rk">{h.item.kind}</span>
                <span className="rt">{h.item.title}</span>
                <span className="rs" dangerouslySetInnerHTML={{ __html: snippet(h.item.text, toks) }} />
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
