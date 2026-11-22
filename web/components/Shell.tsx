import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, errorText, type LibraryInfo, type UserInfo } from '../lib/api'
import { cx } from '../lib/classes'
import { useFavorites } from '../lib/favorites'
import { LibraryContext, type LibraryValue } from '../lib/libraryContext'
import { useMe } from '../lib/session'
import { setTheme, useTheme } from '../lib/theme'
import { sectionOf, type Section } from '../lib/sections'
import {
  HREF_ACCOUNT,
  HREF_BAND,
  HREF_DAILY,
  HREF_FAVORITES,
  hrefSearch,
  navigate,
  useRoute,
  type Route,
} from '../lib/route'
import { Link } from './Link'
import { Notice } from './ui'
import { Home } from '../pages/Home'
import { CategoryPage } from '../pages/CategoryPage'
import { ArtistsPage } from '../pages/ArtistsPage'
import { SongsPage } from '../pages/SongsPage'
import { SearchPage } from '../pages/SearchPage'
import { FavoritesPage } from '../pages/FavoritesPage'
import { BandPage } from '../pages/BandPage'
import { BandSongPage } from '../pages/BandSongPage'
import { UploadSongPage } from '../pages/UploadSongPage'
import { EnsemblesPage } from '../pages/EnsemblesPage'
import { AccountPage } from '../pages/AccountPage'
import { UsersPage } from '../pages/UsersPage'
import { DrumEditorPage } from '../pages/DrumEditorPage'
import { CombinePage } from '../pages/CombinePage'
import { DailyPage } from '../pages/DailyPage'
import { InvitePage } from '../pages/InvitePage'
import { MinePage } from '../pages/MinePage'
import { Viewer } from '../viewer/Viewer'
import { PreviewHost } from '../viewer/PreviewPanel'
import { closePreview, usePreview } from '../lib/preview'

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** Pages that read the score library; members without library access get the band page instead. */
const LIBRARY_ROUTES: ReadonlySet<Route['kind']> = new Set<Route['kind']>([
  'home',
  'category',
  'group',
  'artist',
  'search',
  'favorites',
  // 找乐队谱 searches the whole library too.
  'ensembles',
])

/** The signed-in page: the library state (shared by every page), the navigation and the current page. */
export function Shell({ onLoggedOut }: { onLoggedOut: () => void }) {
  const route = useRoute()
  const me = useMe()
  const { items: favorites } = useFavorites()
  const [info, setInfo] = useState<LibraryInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const polling = useRef(false)

  // Members without library access only see the band (their setlists) and their account.
  const libraryHidden = me !== null && me.role === 'member' && !me.libraryAccess

  /** Reads the library until the scan has finished, then refreshes every page. */
  const poll = useCallback(async () => {
    if (polling.current) return
    polling.current = true
    try {
      let next: LibraryInfo
      do {
        await delay(1200)
        next = await api.library()
        setInfo(next)
      } while (next.scanning)
      setError(null)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(errorText(e))
    } finally {
      polling.current = false
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const next = await api.library()
      setInfo(next)
      setError(null)
      if (next.scanning) void poll()
    } catch (e) {
      setError(errorText(e))
    }
  }, [poll])

  useEffect(() => {
    if (!libraryHidden) void load()
  }, [load, libraryHidden])

  // Ctrl/⌘ + K opens 搜索谱 (or focuses its field when it is already open).
  const routeKind = route.kind
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (libraryHidden) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (routeKind === 'search') document.getElementById('song-search')?.focus()
        else navigate(hrefSearch())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [routeKind, libraryHidden])

  const rescan = useCallback(async () => {
    setError(null)
    try {
      await api.rescan()
      setInfo((i) => (i ? { ...i, scanning: true } : i))
      await poll()
    } catch (e) {
      setError(errorText(e))
    }
  }, [poll])

  const logout = () => {
    api
      .logout()
      .catch(() => undefined)
      // A fresh page: favourites, practice and the band from this account are not kept in memory.
      .finally(() => {
        onLoggedOut()
        window.location.reload()
      })
  }

  const scanning = info?.scanning ?? false
  const value: LibraryValue = useMemo(
    () => ({
      info,
      error,
      version,
      scanning,
      reload: () => void load(),
      rescan: () => void rescan(),
    }),
    [info, error, version, scanning, load, rescan],
  )

  const onViewer = route.kind === 'viewer'
  const section = sectionOf(route)
  const previewOpen = usePreview().item !== null
  // The score viewer replaces any quick preview.
  useEffect(() => {
    if (onViewer) closePreview()
  }, [onViewer])
  // Band and account pages do not need the library, so they never wait for it.
  const pageReady = info !== null || onViewer || libraryHidden || !LIBRARY_ROUTES.has(route.kind)

  return (
    <LibraryContext.Provider value={value}>
      <div className="flex min-h-dvh flex-col">
        {!onViewer && (
          <Rail
            current={section}
            libraryHidden={libraryHidden}
            me={me}
            favorites={favorites.length}
            onLogout={logout}
          />
        )}

        <main
          className={cx(
            'mx-auto w-full flex-1',
            // The side rail takes the left 200 px on wide screens.
            !onViewer && 'min-[861px]:pl-[200px]',
            // An open preview takes the right side on wide screens: the list moves over.
            previewOpen && !onViewer && 'min-[861px]:pr-[min(46vw,720px)]',
          )}
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div
            className={cx(
              'mx-auto w-full',
              // The score fills the whole window; every other page sits in the 1180 px column.
              onViewer
                ? 'max-w-none'
                : 'gutter max-w-[1180px] pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 max-[860px]:pb-[calc(76px_+_env(safe-area-inset-bottom,0px))] min-[861px]:px-8',
            )}
          >
            {pageReady ? (
              renderRoute(route, libraryHidden)
            ) : error ? (
              <Notice tone="error">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => value.reload()}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm text-foreground hover:border-foreground"
                >
                  重试
                </button>
              </Notice>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">正在读取谱库…</p>
            )}
          </div>
        </main>

        <PreviewHost />

        {!onViewer && <TabBar current={section} libraryHidden={libraryHidden} />}
      </div>
    </LibraryContext.Provider>
  )
}

const SECTIONS: ReadonlyArray<{ id: Section; label: string; href: string }> = [
  { id: 'library', label: '谱库', href: '#/' },
  { id: 'band', label: '乐队', href: HREF_BAND },
  { id: 'me', label: '我的', href: HREF_ACCOUNT },
]

function SectionIcon({ id }: { id: Section | 'search' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {id === 'library' && (
        <>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
          <path d="M5 17a3 3 0 0 1 3-3h11" />
        </>
      )}
      {id === 'band' && (
        <>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
          <circle cx="17.5" cy="9" r="2.4" />
          <path d="M17 14.6c2.4.2 4 1.9 4 4.4" />
        </>
      )}
      {id === 'me' && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </>
      )}
      {id === 'search' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </>
      )}
    </svg>
  )
}

const RAIL_ROW =
  'flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 text-sm transition-colors'

/** Wide screens: the side rail. 谱库 / 乐队 / 我的, the search, and the quiet tools at the bottom. */
function Rail({
  current,
  libraryHidden,
  me,
  favorites,
  onLogout,
}: {
  current: Section
  libraryHidden: boolean
  me: UserInfo | null
  favorites: number
  onLogout: () => void
}) {
  const theme = useTheme()
  const sections = libraryHidden ? SECTIONS.filter((s) => s.id !== 'library') : SECTIONS
  return (
    <nav
      aria-label="主导航"
      className="fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col gap-1 border-r border-border bg-background px-3 pb-4 pt-5 min-[861px]:flex"
      style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))' }}
    >
      <Link
        href={libraryHidden ? HREF_BAND : '#/'}
        className="px-2.5 pb-4 pt-1 font-display text-xl font-black tracking-[0.02em]"
      >
        谱库
      </Link>

      {!libraryHidden && (
        <Link
          href={hrefSearch()}
          className={cx(
            RAIL_ROW,
            'mb-2 border border-border text-muted-foreground hover:bg-card hover:text-foreground',
          )}
        >
          <SectionIcon id="search" />
          <span className="flex-1">搜索谱</span>
          <kbd className="mono rounded-[4px] border border-border px-1.5 text-[11px]">Ctrl K</kbd>
        </Link>
      )}

      {sections.map((s) => {
        const on = s.id === current
        return (
          <Link
            key={s.id}
            href={s.href}
            ariaCurrent={on ? 'page' : undefined}
            className={cx(
              RAIL_ROW,
              'font-bold',
              on
                ? 'bg-accent text-primary'
                : 'text-muted-foreground hover:bg-card hover:text-foreground',
            )}
          >
            <SectionIcon id={s.id} />
            {s.label}
          </Link>
        )
      })}

      <div className="mt-4 border-t border-border pt-3">
        {!libraryHidden && (
          <Link
            href={HREF_FAVORITES}
            className={cx(RAIL_ROW, 'text-muted-foreground hover:bg-card hover:text-foreground')}
          >
            <span className="flex-1">我的收藏</span>
            <span className="mono text-xs">{favorites}</span>
          </Link>
        )}
        <Link
          href={HREF_DAILY}
          className={cx(RAIL_ROW, 'text-muted-foreground hover:bg-card hover:text-foreground')}
        >
          每日一练
        </Link>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className={cx(RAIL_ROW, 'text-muted-foreground hover:bg-card hover:text-foreground')}
      >
        {theme === 'dark' ? '换成浅色' : '换成深色'}
      </button>
      {me && (
        <div className="flex items-center gap-1 border-t border-border pt-3">
          <Link
            href={HREF_ACCOUNT}
            ariaLabel={`我的账号：${me.displayName}`}
            className="min-w-0 flex-1 truncate rounded-[10px] px-2.5 py-2 text-sm text-foreground hover:bg-card"
          >
            {me.displayName}
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-11 shrink-0 rounded-[10px] px-2.5 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            退出
          </button>
        </div>
      )}
    </nav>
  )
}

/** The phone's bottom navigation: 谱库 / 乐队 / 我的 (no 谱库 without library access). */
function TabBar({ current, libraryHidden }: { current: Section; libraryHidden: boolean }) {
  const sections = libraryHidden ? SECTIONS.filter((s) => s.id !== 'library') : SECTIONS
  return (
    <nav
      aria-label="主导航"
      className={cx(
        'fixed inset-x-0 bottom-0 z-[35] grid border-t border-border bg-background/95 px-4 pt-1.5 backdrop-blur-[12px] min-[861px]:hidden',
        libraryHidden ? 'grid-cols-2' : 'grid-cols-3',
      )}
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      {sections.map((s) => {
        const on = s.id === current
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(s.href)}
            aria-current={on ? 'page' : undefined}
            className={cx(
              'grid min-h-12 justify-items-center gap-0.5 py-1 text-[11px] font-bold transition-colors',
              on ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span
              className={cx(
                'grid h-[30px] w-[56px] place-items-center rounded-full',
                on && 'bg-accent',
              )}
            >
              <SectionIcon id={s.id} />
            </span>
            {s.label}
          </button>
        )
      })}
    </nav>
  )
}

function renderRoute(route: Route, libraryHidden: boolean) {
  if (libraryHidden && LIBRARY_ROUTES.has(route.kind)) return <BandPage />
  switch (route.kind) {
    case 'home':
      return <Home />
    case 'category':
      return <CategoryPage id={route.id} />
    case 'group':
      return <ArtistsPage key={route.id} group={route} />
    case 'artist':
      return <SongsPage key={route.id} artist={route} />
    case 'search':
      return <SearchPage q={route.q} />
    case 'mine':
      return <MinePage />
    case 'favorites':
      return <FavoritesPage />
    case 'band':
      return <BandPage />
    case 'bandSong':
      return <BandSongPage key={route.id} id={route.id} />
    case 'upload':
      return <UploadSongPage id={route.id} band={route.band} personal={route.personal} />
    case 'ensembles':
      return <EnsemblesPage q={route.q} need={route.need} />
    case 'account':
      return <AccountPage />
    case 'users':
      return <UsersPage />
    case 'daily':
      return <DailyPage key={route.day ?? 0} day={route.day} />
    case 'invite':
      return <InvitePage key={route.token} token={route.token} />
    case 'combine':
      return <CombinePage key={route.path + route.id} path={route.path} id={route.id} />
    case 'drums':
      return (
        <DrumEditorPage
          key={route.path}
          path={route.path}
          title={route.title}
          artist={route.artist}
        />
      )
    case 'viewer':
      // The viewer takes the whole route, including `band` (the setlist it was opened from).
      return <Viewer key={route.path} route={route} />
  }
}
