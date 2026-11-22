import { useEffect, useMemo, useState } from 'react'
import type { ScoreSearchResult, ScoreVersion } from '@/songs/scoreLibraryTypes'
import {
  api,
  errorText,
  type BandSong,
  type MemberProgress,
  type UploadSong,
} from '../../lib/api'
import { addSong, STATUS_LABELS } from '../../lib/band'
import { buttonClass, cx, LIST, LIST_ROW, SECTION_TITLE } from '../../lib/classes'
import { fmtDuration } from '../../lib/practice'
import { hrefBandSong, hrefEnsembles, hrefUpload } from '../../lib/route'
import { FormatBadge, Notice } from '../../components/ui'
import { Link } from '../../components/Link'
import { ICON_BUTTON, STATUS_CLASS } from './shared'

/** One song of the band's setlist as a card: title and my part, status, practice, parts, order. */
export function SongCard({
  song,
  index,
  total,
  progress,
  meId,
  nameOf,
  busy,
  sorting,
  onStatus,
  onMove,
}: {
  song: BandSong
  index: number
  total: number
  progress: MemberProgress[]
  meId: string | null
  nameOf: (id: string) => string
  busy: boolean
  /** Shows the 上移 / 下移 buttons. */
  sorting: boolean
  onStatus: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const practice =
    progress.length === 0
      ? '还没有练习记录'
      : progress
          .map(
            (p) =>
              `${nameOf(p.userId)} ${fmtDuration(p.totalSeconds)}${p.maxSpeedPct ? ` · ${p.maxSpeedPct}%` : ''}`,
          )
          .join(' · ')

  const counts = new Map<string, number>()
  for (const userId of Object.values(song.parts)) counts.set(userId, (counts.get(userId) ?? 0) + 1)
  const parts =
    counts.size === 0
      ? '声部未分配'
      : [...counts].map(([userId, n]) => `${nameOf(userId)} ${n} 轨`).join(' · ')
  const mine = meId ? (counts.get(meId) ?? 0) : 0
  const sub = [
    song.artist,
    counts.size === 0 ? null : mine > 0 ? `我负责 ${mine} 轨` : '我没有声部',
  ].filter(Boolean)

  return (
    <li className="overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="flex items-center gap-2 py-1.5 pl-3.5 pr-2.5 transition-colors hover:bg-[hsl(var(--raised))]">
        <span className="mono w-6 shrink-0 text-[13px] font-bold text-muted-foreground">
          {index + 1}
        </span>
        <Link
          href={hrefBandSong(song.id)}
          className="group flex min-h-[52px] min-w-0 flex-1 flex-col justify-center py-1"
        >
          <b className="block break-words text-base font-bold leading-snug transition-colors group-hover:text-primary">
            {song.title || '未识别的曲名'}
          </b>
          {sub.length > 0 && (
            <span className="block truncate text-[13px] text-muted-foreground">
              {sub.join(' · ')}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onStatus}
          disabled={busy}
          aria-label={`状态：${STATUS_LABELS[song.status]}，点按切换`}
          title="点一下切换状态"
          className={cx(
            'inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-xs font-bold transition-colors disabled:opacity-50 min-[861px]:min-h-8',
            STATUS_CLASS[song.status],
          )}
        >
          {STATUS_LABELS[song.status]}
        </button>
      </div>
      <div className="flex items-end gap-2 border-t border-border px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="mono m-0 break-words text-[11px] leading-relaxed text-muted-foreground">
            {practice}
          </p>
          <p className="mono m-0 break-words text-[11px] leading-relaxed text-muted-foreground">
            声部：{parts}
          </p>
        </div>
        {sorting && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="上移"
              title="上移"
              disabled={busy || index <= 0}
              onClick={() => onMove(-1)}
              className={ICON_BUTTON}
            >
              <span aria-hidden>↑</span>
            </button>
            <button
              type="button"
              aria-label="下移"
              title="下移"
              disabled={busy || index >= total - 1}
              onClick={() => onMove(1)}
              className={ICON_BUTTON}
            >
              <span aria-hidden>↓</span>
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/** 自己的谱: a new uploaded song, and uploaded songs that no band song uses yet. */
export function OwnScores({ used }: { used: Set<string> }) {
  const [list, setList] = useState<UploadSong[]>([])

  useEffect(() => {
    let alive = true
    api.uploads().then(
      (all) => {
        if (alive) setList(all)
      },
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])

  const unlisted = list.filter((u) => !used.has(u.id))
  return (
    <section aria-labelledby="band-upload" className="pt-8">
      <h2 id="band-upload" className={cx(SECTION_TITLE, 'mb-2.5')}>
        自己的谱
      </h2>
      <ul className={cx(LIST, 'm-0 list-none p-0')}>
        <li>
          <Link href={hrefUpload()} className={LIST_ROW}>
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary/15 text-lg font-bold text-primary"
            >
              ＋
            </span>
            <span className="min-w-0 flex-1">
              <b className="block font-bold">新建歌曲（上传自己的谱）</b>
              <span className="block text-[13px] text-muted-foreground">
                谱库里的谱都不合适时，自己上传吉他、贝斯、鼓等各个声部的谱
              </span>
            </span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
        </li>
      </ul>
      {unlisted.length > 0 && (
        <>
          <h3 className={cx(SECTION_TITLE, 'mb-2.5 mt-5')}>自己上传、还没加入歌单的歌</h3>
          <ul className={cx(LIST, 'm-0 list-none p-0')}>
            {unlisted.map((u) => (
              <li key={u.id}>
                <Link href={hrefUpload({ id: u.id })} className={LIST_ROW}>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-bold">{u.title || '未命名的歌'}</b>
                    {u.artist && (
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {u.artist}
                      </span>
                    )}
                  </span>
                  <span className="mono shrink-0 text-xs text-muted-foreground">
                    {u.files.length} 个文件
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Search the library for score files and add one version of a song to the setlist. */
export function AddSongs({
  inSetlist,
  busy,
  run,
}: {
  inSetlist: Set<string>
  busy: string | null
  run: (key: string, job: () => Promise<void>) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<ScoreSearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Waits a moment after the last key, so typing does not search every letter.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(text.trim()), 250)
    return () => window.clearTimeout(t)
  }, [text])

  useEffect(() => {
    if (!query) {
      setFound(null)
      setSearchError(null)
      setSearching(false)
      return
    }
    const ac = new AbortController()
    setSearching(true)
    setSearchError(null)
    api
      .search(query, {}, ac.signal)
      .then(
        (r) => {
          if (!ac.signal.aborted) setFound(r)
        },
        (e: unknown) => {
          if (!ac.signal.aborted) setSearchError(errorText(e))
        },
      )
      .finally(() => {
        if (!ac.signal.aborted) setSearching(false)
      })
    return () => ac.abort()
  }, [query])

  // Only songs with at least one score-format file (GP / MusicXML) can be rehearsed.
  const songs = useMemo(
    () =>
      (found?.songs ?? [])
        .map(({ song, artistName }) => ({
          song,
          artistName,
          versions: song.versions.filter((v) => v.file.format === 'score'),
        }))
        .filter((x) => x.versions.length > 0),
    [found],
  )

  const add = (title: string, artist: string, v: ScoreVersion) =>
    void run(`add:${v.file.path}`, () => addSong({ path: v.file.path, title, artist }))

  return (
    <section aria-labelledby="band-add" className="pt-8">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="band-add" className={SECTION_TITLE}>
          添加歌曲
        </h2>
        <Link
          href={hrefEnsembles()}
          className="inline-flex min-h-11 items-center text-[13px] font-medium text-primary hover:underline"
        >
          找乐队谱 →
        </Link>
      </div>

      <label className="relative block">
        <span className="sr-only">搜索谱库</span>
        <input
          id="band-add-search"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="搜索歌名或歌手，选一个版本加入歌单"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-12 w-full rounded-[14px] border border-border bg-card px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>

      {!query && (
        <p className="m-0 pt-2 text-xs text-muted-foreground">输入歌名、歌手或拼音首字母开始搜索。</p>
      )}
      {searching && <p className="m-0 pt-3 text-sm text-muted-foreground">正在搜索…</p>}
      {searchError && (
        <div className="pt-3">
          <Notice tone="error">{searchError}</Notice>
        </div>
      )}
      {query && !searching && found && songs.length === 0 && !searchError && (
        <div className="pt-3">
          <Notice>没有找到带乐谱文件（GP / MusicXML）的歌曲。</Notice>
        </div>
      )}

      {songs.length > 0 && (
        <ul className={cx(LIST, 'm-0 mt-3 list-none p-0')}>
          {songs.map(({ song, artistName, versions }) => {
            const title = song.unknownTitle ? (versions[0]?.label ?? song.title) : song.title
            return (
              <li key={song.id} className="border-t border-border px-3.5 py-3 first:border-t-0">
                <p className="m-0 break-words text-base font-bold">
                  {title || '未识别的曲名'}
                  <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                    {artistName}
                  </span>
                </p>
                <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                  {versions.map((v) => {
                    const added = inSetlist.has(v.file.path)
                    const key = `add:${v.file.path}`
                    return (
                      <li key={v.file.path}>
                        <div className="flex items-center gap-2">
                          <FormatBadge format={v.file.format} />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {v.label}
                            {v.tags.length > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {v.tags.join(' · ')}
                              </span>
                            )}
                          </span>
                          {added ? (
                            <span className="shrink-0 text-xs text-muted-foreground">已在歌单</span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => add(title, artistName, v)}
                              className={cx(buttonClass('outline'), 'shrink-0 px-3 hover:border-primary hover:text-primary')}
                              aria-label={busy === key ? '正在加入' : `加入歌单：${v.label}`}
                            >
                              {busy === key ? '加入中…' : '加入'}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
