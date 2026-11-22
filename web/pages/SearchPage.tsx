import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  ScoreFormat,
  ScoreSearchResult,
  ScoreSong,
  ScoreVersion,
} from '@/songs/scoreLibraryTypes'
import { api, errorText, type SearchOptions } from '../lib/api'
import { toggleFavorite, useFavorites } from '../lib/favorites'
import { useHistoryState, useRestoreScroll } from '../lib/scrollMemory'
import { VersionList } from '../components/SongCard'
import { cx, LIST, PILL, SECTION_TITLE } from '../lib/classes'
import { hrefArtist, hrefSearch, hrefViewer } from '../lib/route'
import { useLibrary } from '../lib/libraryContext'
import { useLoad } from '../lib/useLoad'
import { Link } from '../components/Link'
import { BackLink, FormatBadge, MatchTag, Notice } from '../components/ui'

type Sort = NonNullable<SearchOptions['sort']>

/** A song's head row inside its card: title over artist, count or format and a chevron on the right. */
const ROW =
  'flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-[hsl(var(--raised))]'

const FORMATS: ReadonlyArray<readonly [ScoreFormat | '', string]> = [
  ['', '全部格式'],
  ['score', 'GP 谱'],
  ['image', '图片谱'],
  ['pdf', 'PDF'],
  ['text', '文本谱'],
]

const SORTS: ReadonlyArray<readonly [Sort, string]> = [
  ['rel', '最相关'],
  ['ver', '版本最多'],
  ['name', '按歌名'],
]

const FILTER =
  'h-11 min-[861px]:h-[38px] appearance-none rounded-full border border-border bg-card pl-3.5 pr-9 text-[13px] text-foreground transition-colors hover:border-foreground focus:border-primary'

/** 搜索谱: one wide field, three pill filters, and each result as a card that opens its versions. */
export function SearchPage({ q }: { q: string }) {
  const { info, version } = useLibrary()
  const [text, setText] = useState(q)
  const [query, setQuery] = useState(q.trim())
  const [fmt, setFmt] = useHistoryState<ScoreFormat | ''>('fmt', '')
  const [cat, setCat] = useHistoryState('cat', '')
  const [sort, setSort] = useHistoryState<Sort>('sort', 'rel')
  const field = useRef<HTMLInputElement>(null)

  // The route's q changed (a tab, Ctrl K, back): show that instead.
  useEffect(() => {
    setText(q)
    setQuery(q.trim())
  }, [q])

  // Searching waits 200 ms after the last key, so typing does not fetch every letter.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(text.trim()), 200)
    return () => window.clearTimeout(t)
  }, [text])

  // The address keeps the query, replaced rather than pushed per keystroke.
  useEffect(() => {
    const hash = hrefSearch(query)
    if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash)
  }, [query])

  const opts: SearchOptions = { fmt, cat, sort }
  const state = useLoad(
    (signal) => (query ? api.search(query, opts, signal) : api.top(opts, signal)),
    `search\n${query}\n${fmt}\n${cat}\n${sort}\n${version}`,
  )
  useRestoreScroll(state.status === 'ready')

  const files = info?.files ?? 0
  const placeholder = info
    ? `搜索 ${files.toLocaleString('zh-CN')} 份谱：歌名、歌手、拼音、首字母`
    : '搜索歌名、歌手、拼音、首字母'

  return (
    <>
      <div className="flex flex-col gap-3 pb-1 pt-3 min-[861px]:pt-5">
        <div className="flex flex-col">
          <BackLink label="‹ 谱库" fallback="#/" />
          <h1 className="m-0 whitespace-nowrap font-display text-[26px] font-bold leading-tight min-[861px]:text-[30px]">
            搜索谱
          </h1>
        </div>
        <label className="relative block">
          <span className="sr-only">搜索谱</span>
          <svg
            aria-hidden
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
          </svg>
          <input
            id="song-search"
            ref={field}
            type="search"
            autoFocus
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-[56px] w-full rounded-[14px] border border-border bg-card pl-[50px] pr-12 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary min-[861px]:text-lg [&::-webkit-search-cancel-button]:appearance-none"
          />
          {text && (
            <button
              type="button"
              aria-label="清空"
              onClick={() => {
                setText('')
                setQuery('')
                field.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            >
              <span aria-hidden>✕</span>
            </button>
          )}
        </label>
      </div>

      <div className="flex flex-wrap gap-2 pb-1.5 pt-3">
        <Pill
          label="格式"
          value={fmt}
          on={fmt !== ''}
          onChange={(v) => setFmt(v as ScoreFormat | '')}
        >
          {FORMATS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Pill>
        <Pill label="分类" value={cat} on={cat !== ''} onChange={setCat}>
          <option value="">全部分类</option>
          {(info?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Pill>
        <Pill label="排序" value={sort} on={sort !== 'rel'} onChange={(v) => setSort(v as Sort)}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Pill>
      </div>

      {state.status === 'loading' && (
        <p className="py-10 text-center text-sm text-muted-foreground">正在搜索…</p>
      )}
      {state.status === 'error' && (
        <div className="py-4">
          <Notice tone="error">{state.message}</Notice>
        </div>
      )}

      {state.status === 'ready' && <Results query={query} data={state.data} />}
    </>
  )
}

/** A native select drawn as a pill; pen-blue when it is not at the default. */
function Pill({
  label,
  value,
  on,
  onChange,
  children,
}: {
  label: string
  value: string
  on: boolean
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(FILTER, on && 'border-primary text-primary')}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-muted-foreground"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </label>
  )
}

/**
 * Artist chips, then one card per song: a song with one score opens it, one with
 * several opens its versions in place (each with ☆, 预览 and 看谱).
 */
function Results({ query, data }: { query: string; data: ScoreSearchResult }) {
  const { artists, songs, moreSongs } = data
  const [openIds, setOpenIds] = useHistoryState<string[]>('open', [])
  const open = useMemo(() => new Set(openIds), [openIds])
  const toggle = (id: string) =>
    setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const { items: favorites } = useFavorites()
  const starred = useMemo(() => new Set(favorites.map((f) => f.path)), [favorites])
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const star = async (song: ScoreSong, v: ScoreVersion, artist: string) => {
    if (busyPath) return
    setBusyPath(v.file.path)
    setError(null)
    try {
      await toggleFavorite({
        path: v.file.path,
        format: v.file.format,
        pages: v.pages?.map((p) => p.path) ?? [],
        title: song.unknownTitle ? v.label : song.title,
        artist,
      })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusyPath(null)
    }
  }

  if (artists.length === 0 && songs.length === 0) {
    return (
      <div className="py-6">
        <Notice>没找到。试试拼音首字母（例如 zjl），或者少打几个字。</Notice>
      </div>
    )
  }

  return (
    <>
      {artists.length > 0 && (
        <section aria-label="歌手" className="pt-5">
          <h2 className={cx(SECTION_TITLE, 'mb-2.5')}>歌手</h2>
          <div className="flex flex-wrap gap-2">
            {artists.map((a) => (
              <Link
                key={a.id}
                href={hrefArtist(a)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                {a.name}
                <span className="mono text-[11px] text-muted-foreground">{a.files}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {songs.length > 0 && (
        <h2 className={cx(SECTION_TITLE, 'mb-2.5 mt-6')}>
          {query ? `${songs.length}${moreSongs ? '+' : ''} 首歌` : '版本最多的谱'}
        </h2>
      )}

      <ol className="m-0 flex list-none flex-col gap-2.5 p-0 pb-28">
        {songs.map(({ song, artistName, match }) => {
          const best = song.versions[0]
          if (!best) return null
          const title = song.unknownTitle ? best.label : song.title
          const count = song.versions.length
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block break-words font-bold leading-snug">
                  {title}
                  {match !== 'name' && <MatchTag match={match} />}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {artistName}
                </span>
              </span>
              {count > 1 ? (
                <span className={PILL} title={`${count} 个版本`}>
                  {count} 个谱
                </span>
              ) : (
                <FormatBadge format={best.file.format} />
              )}
              <span
                aria-hidden
                className={cx(
                  'shrink-0 text-lg text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                  count > 1 && open.has(song.id) && 'rotate-90',
                )}
              >
                ›
              </span>
            </>
          )
          return (
            <li key={song.id} className={LIST}>
              {count > 1 ? (
                <button
                  type="button"
                  aria-expanded={open.has(song.id)}
                  onClick={() => toggle(song.id)}
                  className={ROW}
                >
                  {body}
                </button>
              ) : (
                <Link
                  href={hrefViewer({
                    path: best.file.path,
                    format: best.file.format,
                    pages: best.pages?.map((p) => p.path),
                    title,
                    artist: artistName,
                  })}
                  className={ROW}
                >
                  {body}
                </Link>
              )}
              {count > 1 && open.has(song.id) && (
                <VersionList
                  song={song}
                  artistName={artistName}
                  isStarred={(path) => starred.has(path)}
                  busyPath={busyPath}
                  onStar={(sg, v) => void star(sg, v, artistName)}
                />
              )}
            </li>
          )
        })}
      </ol>

      {error && (
        <p role="alert" className="px-1 pb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {moreSongs && (
        <p className="px-1 pb-24 text-xs text-muted-foreground">
          结果较多，只显示前 200 个。输入更完整的歌名可以缩小范围。
        </p>
      )}
    </>
  )
}
