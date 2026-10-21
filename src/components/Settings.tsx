import { useState } from 'react'
import { useLibrary } from '../lib/library'
import type { Settings as S } from '../lib/settings'

export function SettingsPage() {
  const { settings, updateSettings, docs, store } = useLibrary()
  const [form, setForm] = useState<S>(settings)
  const [msg, setMsg] = useState<string | null>(null)
  const set = (k: keyof S, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const test = async () => {
    setMsg('Testing…')
    try {
      const res = await fetch(`https://api.github.com/repos/${form.owner}/${form.repo}/branches/${encodeURIComponent(form.branch || 'main')}`, {
        headers: { Authorization: `Bearer ${form.token}`, Accept: 'application/vnd.github+json' },
      })
      if (res.ok) setMsg(`Connected to ${form.owner}/${form.repo}@${form.branch || 'main'}.`)
      else if (res.status === 404) setMsg('Repository or branch not found (an empty repository has no branch yet: import a document and the first commit creates it).')
      else setMsg(`GitHub replied ${res.status}: ${(await res.json().catch(() => ({})) as { message?: string }).message || ''}`)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <main className="page">
      <div className="wrap narrow">
        <h1 className="sect-title">Settings</h1>
        <p className="muted">
          Currently {store.kind === 'github' ? `reading from GitHub (${settings.owner}/${settings.repo})` : 'storing in this browser only'} · {docs.length} documents.
        </p>

        <section className="card">
          <h2>Storage</h2>
          <label className="radio">
            <input type="radio" checked={form.mode === 'local'} onChange={() => set('mode', 'local')} /> <b>This browser</b>
            <span className="muted"> — IndexedDB. No setup, but nothing leaves this machine.</span>
          </label>
          <label className="radio">
            <input type="radio" checked={form.mode === 'github'} onChange={() => set('mode', 'github')} /> <b>GitHub repository</b>
            <span className="muted"> — documents in <code>library/</code>, annotations in <code>annotations/</code>, one commit per save.</span>
          </label>

          <div className={'fields' + (form.mode === 'github' ? '' : ' off')}>
            <label>
              Owner <input value={form.owner} onChange={(e) => set('owner', e.target.value.trim())} placeholder="robdhyman" />
            </label>
            <label>
              Repository <input value={form.repo} onChange={(e) => set('repo', e.target.value.trim())} placeholder="reading" />
            </label>
            <label>
              Branch <input value={form.branch} onChange={(e) => set('branch', e.target.value.trim())} placeholder="main" />
            </label>
            <label>
              Fine-grained token
              <input type="password" value={form.token} onChange={(e) => set('token', e.target.value.trim())} placeholder="github_pat_…" autoComplete="off" />
            </label>
            <p className="muted small">
              Create one at GitHub → Settings → Developer settings → Fine-grained tokens. Limit it to this one repository and grant <b>Contents: Read and write</b> only. It is kept in this browser's localStorage and sent only to api.github.com.
            </p>
            <div className="row">
              <button className="btn" type="button" onClick={test} disabled={!form.owner || !form.repo || !form.token}>Test connection</button>
              {msg && <span className="muted small">{msg}</span>}
            </div>
          </div>

          <div className="row">
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                updateSettings(form)
                setMsg('Saved.')
              }}
            >
              Save
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Keyboard</h2>
          <table className="keys">
            <tbody>
              <tr><td><kbd>/</kbd></td><td>Search</td></tr>
              <tr><td><kbd>[</kbd></td><td>Show or hide the index rail</td></tr>
              <tr><td><kbd>]</kbd></td><td>Show or hide the notes rail</td></tr>
              <tr><td><kbd>h</kbd></td><td>Highlight the selection</td></tr>
              <tr><td><kbd>n</kbd></td><td>Highlight the selection and add a note</td></tr>
              <tr><td><kbd>b</kbd></td><td>Bookmark the selection</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Clear search, close panels</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
