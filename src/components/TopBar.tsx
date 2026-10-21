import type { ReactNode } from 'react'
import { useLibrary } from '../lib/library'
import { hrefFor, type Route } from '../lib/router'

interface Props {
  route: Route
  subtitle: string
  search?: ReactNode
  theme: 'light' | 'dark'
  onTheme: () => void
  rails?: ReactNode
}

export function TopBar({ route, subtitle, search, theme, onTheme, rails }: Props) {
  const { status, settings } = useLibrary()
  const s = status.state
  return (
    <header className="top">
      {rails}
      <a className="brand" href={hrefFor({ page: 'library', q: '' })}>
        Reading<small>{subtitle}</small>
      </a>
      {search}
      <nav className="topnav" aria-label="Pages">
        <a className={route.page === 'library' ? 'on' : ''} href={hrefFor({ page: 'library', q: '' })}>Library</a>
        <a className={route.page === 'notes' ? 'on' : ''} href={hrefFor({ page: 'notes', q: '' })}>Notes</a>
        <a className={route.page === 'settings' ? 'on' : ''} href={hrefFor({ page: 'settings' })}>Settings</a>
      </nav>
      <span className={'sync ' + s} title={status.message || (settings.mode === 'github' ? `${settings.owner}/${settings.repo}` : 'Stored in this browser')}>
        <span className="dot" />
        {s === 'saving' ? 'Saving' : s === 'error' ? 'Error' : settings.mode === 'github' ? 'GitHub' : 'Local'}
      </span>
      <button className="iconbtn" onClick={onTheme} aria-label="Toggle colour theme" title="Toggle light/dark">
        {theme === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" /></svg>
        )}
      </button>
    </header>
  )
}
