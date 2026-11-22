import type { Route } from './route'

/** The three places of the site: 谱库, 乐队 and 我的. */
export type Section = 'library' | 'band' | 'me'

/** Which of the three places a page belongs to (the tab that is lit while it shows). */
export function sectionOf(route: Route): Section {
  switch (route.kind) {
    case 'band':
    case 'bandSong':
    case 'ensembles':
    case 'invite':
      return 'band'
    case 'upload':
      return route.personal ? 'me' : 'band'
    case 'account':
    case 'users':
    case 'mine':
    case 'favorites':
    case 'daily':
      return 'me'
    default:
      return 'library'
  }
}
