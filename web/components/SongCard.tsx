import type { ScoreSong, ScoreVersion } from '@/songs/scoreLibraryTypes'
import type { VersionInfo } from '@/songs/scoreServerTypes'
import { cx, PILL } from '../lib/classes'
import { versionLine } from '@/songs/versionLine'
import { FORMAT_BADGE, formatSize } from '../lib/format'
import { hrefViewer } from '../lib/route'
import { markSeen, openPreview, useSeen, usePreview, type PreviewItem } from '../lib/preview'
import { useVersionInfo } from '../lib/versionInfo'
import { Link } from './Link'
import { MiddleText } from './MiddleText'
import { FormatBadge, JianpuBadge } from './ui'

/** A version as a preview item (the song's title, or the file name when the title is unknown). */
function previewItemOf(song: ScoreSong, artistName: string, v: ScoreVersion): PreviewItem {
  return {
    path: v.file.path,
    format: v.file.format,
    pages: v.pages?.map((p) => p.path) ?? [],
    title: song.unknownTitle ? v.label : song.title,
    artist: artistName,
    label: v.label,
  }
}

/**
 * One song as a row of a LIST: a title row that opens its versions in place,
 * each with a favourite star, 预览 and 看谱.
 */
export function SongCard({
  song,
  artistName,
  open,
  onToggle,
  isStarred,
  busyPath,
  onStar,
  index,
}: {
  song: ScoreSong
  artistName: string
  open: boolean
  onToggle: () => void
  isStarred: (path: string) => boolean
  /** The version whose favourite is being saved, if any. */
  busyPath: string | null
  onStar: (song: ScoreSong, version: ScoreVersion) => void
  /** Position in a contents list (shown as 01, 02…). */
  index?: number
}) {
  const title = song.unknownTitle ? '未识别的曲名' : song.title
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-[hsl(var(--raised))]"
      >
        {index !== undefined && (
          <span className="mono w-6 shrink-0 text-xs text-muted-foreground">
            {String(index).padStart(2, '0')}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block break-words font-bold leading-snug">
            {title}
            {(song.jianpu ?? 0) > 0 && <JianpuBadge />}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {formatsLine(song)}
          </span>
        </span>
        {song.versions.length > 1 && (
          <span className={PILL}>{song.versions.length} 个谱</span>
        )}
        <span
          aria-hidden
          className={cx(
            'shrink-0 text-lg text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        >
          ›
        </span>
      </button>

      {open && (
        <VersionList
          song={song}
          artistName={artistName}
          isStarred={isStarred}
          busyPath={busyPath}
          onStar={onStar}
        />
      )}
    </li>
  )
}

/** The formats a song has, in order of first appearance (GP · PDF · 图片). */
function formatsLine(song: ScoreSong): string {
  const seen: string[] = []
  for (const v of song.versions) {
    const label = FORMAT_BADGE[v.file.format].label
    if (!seen.includes(label)) seen.push(label)
  }
  return seen.join(' · ')
}

/** A song's versions as hairline-divided rows (inside a card), each with ☆, 预览 and 看谱. */
export function VersionList({
  song,
  artistName,
  isStarred,
  busyPath,
  onStar,
}: {
  song: ScoreSong
  artistName: string
  isStarred: (path: string) => boolean
  busyPath: string | null
  onStar: (song: ScoreSong, version: ScoreVersion) => void
}) {
  // Only the GP files have a track list; asked once for the whole song, when the list is open.
  const info = useVersionInfo(
    song.versions.filter((v) => v.file.format === 'score').map((v) => v.file.path),
  )
  return (
    <ul className="m-0 list-none border-t border-border bg-background/40 p-0">
      {song.versions.map((v) => (
        <VersionRow
          key={v.file.path}
          song={song}
          version={v}
          artistName={artistName}
          info={info[v.file.path] ?? null}
          starred={isStarred(v.file.path)}
          busy={busyPath === v.file.path}
          onStar={onStar}
        />
      ))}
    </ul>
  )
}

function VersionRow({
  song,
  version,
  artistName,
  info,
  starred,
  busy,
  onStar,
}: {
  song: ScoreSong
  version: ScoreVersion
  artistName: string
  /** Track list and tempo of a GP file, once the reader has them. */
  info: VersionInfo | null
  starred: boolean
  busy: boolean
  onStar: (song: ScoreSong, version: ScoreVersion) => void
}) {
  const line = versionLine({
    format: version.file.format,
    info,
    pages: version.pages?.length ?? 1,
  })
  const href = hrefViewer({
    path: version.file.path,
    format: version.file.format,
    pages: version.pages?.map((p) => p.path),
    title: song.unknownTitle ? version.label : song.title,
    artist: artistName,
  })
  const seen = useSeen().has(version.file.path)
  const previewing = usePreview().item?.path === version.file.path
  return (
    <li
      className={cx(
        'grid min-h-[56px] grid-cols-[44px_minmax(0,1fr)] items-start gap-x-2.5 border-t border-border py-2 pl-3.5 pr-2 transition-colors first:border-t-0 hover:bg-[hsl(var(--raised))] min-[861px]:grid-cols-[52px_minmax(0,1fr)_auto] min-[861px]:items-center min-[861px]:gap-x-3',
        previewing && 'bg-[hsl(var(--raised))]',
      )}
    >
      <span
        className="mt-0.5 inline-flex min-[861px]:mt-0"
        title={`${FORMAT_BADGE[version.file.format].label} · ${formatSize(version.size)}`}
      >
        <FormatBadge format={version.file.format} className="w-11 min-[861px]:w-[52px]" />
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium">{line.main}</span>
          {line.detail && (
            <span className="text-xs text-muted-foreground">{` · ${line.detail}`}</span>
          )}
          {seen && (
            <span className="text-xs text-muted-foreground" title="看过">
              看过
            </span>
          )}
          {version.tags.map((tag) => (
            <span
              key={tag}
              title={tag}
              className="max-w-[14em] truncate whitespace-nowrap rounded-full border border-border px-2 text-[11px] leading-5 text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </span>
        <MiddleText text={version.label} className="mono mt-0.5 text-[11px] text-muted-foreground" />
      </span>
      <span className="col-start-2 -ml-2 flex items-center gap-1 min-[861px]:col-start-auto min-[861px]:ml-0">
        <button
          type="button"
          aria-pressed={starred}
          aria-label={starred ? '取消收藏' : '收藏'}
          title={starred ? '取消收藏' : '收藏'}
          disabled={busy}
          onClick={() => onStar(song, version)}
          className={cx(
            'grid h-11 w-11 place-items-center rounded-lg text-base transition-colors disabled:opacity-50 min-[861px]:h-8 min-[861px]:w-8',
            starred ? 'text-primary' : 'text-muted-foreground hover:text-primary',
          )}
        >
          <span aria-hidden>{starred ? '★' : '☆'}</span>
        </button>
        <button
          type="button"
          onClick={() =>
            openPreview(
              previewItemOf(song, artistName, version),
              song.versions.map((x) => previewItemOf(song, artistName, x)),
            )
          }
          className="inline-flex h-11 items-center px-1.5 text-[13px] text-muted-foreground transition-colors hover:text-primary min-[861px]:h-8"
        >
          预览
        </button>
        {/* Opening the full viewer marks the version as seen (the link still navigates). */}
        <span className="inline-flex" onClickCapture={() => markSeen(version.file.path)}>
          <Link
            href={href}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] font-bold text-primary transition-colors hover:bg-primary/10 min-[861px]:min-h-8"
          >
            看谱 <span aria-hidden>›</span>
          </Link>
        </span>
      </span>
    </li>
  )
}
