export interface Settings {
  mode: 'local' | 'github'
  owner: string
  repo: string
  branch: string
  token: string
}

const KEY = 'reading.settings'

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { mode: 'local', owner: '', repo: '', branch: 'main', token: '', ...s }
  } catch {
    return { mode: 'local', owner: '', repo: '', branch: 'main', token: '' }
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function pref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('reading.' + key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
export function setPref<T>(key: string, value: T) {
  localStorage.setItem('reading.' + key, JSON.stringify(value))
}
