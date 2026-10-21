import { useEffect, useState } from 'react'
import { LibraryProvider, useLibrary } from './lib/library'
import { useRoute } from './lib/router'
import { pref, setPref } from './lib/settings'
import { TopBar } from './components/TopBar'
import { LibraryPage, LibrarySearch } from './components/Library'
import { NotesPage, NotesSearch } from './components/Notes'
import { SettingsPage } from './components/Settings'
import { ReaderPage, ReaderSearch, useReaderState } from './components/Reader'
import type { Route } from './lib/router'

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => pref<'light' | 'dark' | null>('theme', null) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return { theme, toggle: () => setTheme((t) => { const n = t === 'dark' ? 'light' : 'dark'; setPref('theme', n); return n }) }
}

function Shell() {
  const route = useRoute()
  const { theme, toggle } = useTheme()
  const { docs } = useLibrary()
  const readRoute = route.page === 'read' ? route : null
  const reader = useReaderState(readRoute || { page: 'read', slug: '', q: '' })

  let subtitle = `${docs.length} documents`
  let search: React.ReactNode = null
  let rails: React.ReactNode = null
  let body: React.ReactNode = null
  if (route.page === 'read') {
    const d = docs.find((x) => x.slug === route.slug)
    subtitle = d?.title || route.slug
    search = <ReaderSearch route={route} state={reader} />
    rails = (
      <>
        <button className={'iconbtn railbtn' + (reader.toc ? ' on' : '')} onClick={() => reader.setToc(!reader.toc)} aria-label="Toggle index" aria-expanded={reader.toc} title="Index ([)">☰</button>
      </>
    )
    body = <ReaderPage route={route} state={reader} />
  } else if (route.page === 'notes') {
    subtitle = 'all annotations'
    search = <NotesSearch route={route} />
    body = <NotesPage route={route} />
  } else if (route.page === 'settings') {
    subtitle = 'settings'
    body = <SettingsPage />
  } else {
    search = <LibrarySearch route={route as Route & { page: 'library' }} />
    body = <LibraryPage route={route as Route & { page: 'library' }} />
  }

  useEffect(() => {
    document.title = route.page === 'read' ? `${subtitle} · Reading` : 'Reading'
  }, [route.page, subtitle])

  return (
    <>
      <TopBar
        route={route}
        subtitle={subtitle}
        search={search}
        theme={theme}
        onTheme={toggle}
        rails={
          route.page === 'read' ? (
            <>
              {rails}
              <button className={'iconbtn railbtn right' + (reader.notes ? ' on' : '')} onClick={() => reader.setNotes(!reader.notes)} aria-label="Toggle annotations" aria-expanded={reader.notes} title="Annotations (])">✎</button>
            </>
          ) : null
        }
      />
      {body}
    </>
  )
}

export default function App() {
  return (
    <LibraryProvider>
      <Shell />
    </LibraryProvider>
  )
}
