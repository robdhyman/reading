import type { Settings } from '../settings'
import { GitHubStore } from './github'
import { LocalStore } from './local'
import type { Store } from './types'

export type { Store } from './types'

export function makeStore(s: Settings): Store {
  if (s.mode === 'github' && s.owner && s.repo && s.token) return new GitHubStore({ owner: s.owner, repo: s.repo, branch: s.branch || 'main', token: s.token })
  return new LocalStore()
}
