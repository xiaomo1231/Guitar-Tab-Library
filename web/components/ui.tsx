import type { ReactNode } from 'react'
import type { ScoreFormat, SearchMatch } from '@/songs/scoreLibraryTypes'
import { FORMAT_BADGE, MATCH_LABEL } from '../lib/format'
import { buttonClass, cx, PAGE_SIZE, PILL } from '../lib/classes'
import { goBack } from '../lib/route'
import { Link } from './Link'

/** A format pill: small, bordered, mono; GP in ink, the rest muted. */
export function FormatBadge({ format, className }: { format: ScoreFormat; className?: string }) {
  const badge = FORMAT_BADGE[format]
  return (
    <span
      className={cx(
        'mono inline-flex shrink-0 items-center justify-center rounded-full border px-2 text-[11px] leading-5',
        badge.className,
        className,
      )}
    >
      {badge.label}
    </span>
  )
}

/** 「简谱」 chip beside a song title whose library folder has 13-简谱 PDFs. */
export function JianpuBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'ml-2 inline-flex shrink-0 items-center rounded-full border border-primary px-2 align-middle font-sans text-[11px] font-normal leading-5 text-primary',
        className,
      )}
    >
      简谱
    </span>
  )
}

/** How a search hit matched (拼音 / 首字母 / 繁简 / 相近); a plain name match shows none. */
export function MatchTag({ match }: { match: SearchMatch }) {
  const label = MATCH_LABEL[match]
  if (!label) return null
  return (
    <span className="ml-2 inline-flex shrink-0 items-center rounded-full border border-primary px-2 align-middle text-[11px] font-normal leading-5 text-primary">
      {label}
    </span>
  )
}

/** 「‹ 谱库」: a quiet text back link; the phone's back gesture when the app made the entry. */
export function BackLink({ label, fallback }: { label: string; fallback: string }) {
  // Older labels written as 「← 目录」 get the same quiet chevron.
  const text = label.replace(/^←\s*/, '‹ ')
  return (
    <button
      type="button"
      onClick={() => goBack(fallback)}
      className="-ml-1 inline-flex min-h-11 items-center self-start px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {text}
    </button>
  )
}

/**
 * Page head: a quiet back link above, then the page's bold title, a mono note and
 * optional tools at the right. No rule under it; the content's cards carry the shape.
 */
export function PageBar({
  title,
  subtitle,
  fallback,
  back = '‹ 返回',
  children,
}: {
  title: string
  subtitle?: string
  fallback: string
  /** '' hides the back link (a page that is itself the home). */
  back?: string
  children?: ReactNode
}) {
  return (
    <header className="flex flex-col pb-4 pt-3 min-[861px]:pt-5">
      {back ? <BackLink label={back} fallback={fallback} /> : <div className="h-2" aria-hidden />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="m-0 min-w-0 break-words font-display text-[26px] font-bold leading-tight min-[861px]:text-[30px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mono ml-auto text-xs text-muted-foreground">{subtitle}</p>
        )}
        {children && (
          <div className={cx('flex items-center gap-1.5', !subtitle && 'ml-auto')}>{children}</div>
        )}
      </div>
    </header>
  )
}

/** The page's divider: six hairlines. */
export function Staff() {
  return <div className="staff" aria-hidden />
}

/** A two-to-four item segmented control (按拼音 / 按数量, 按收藏时间 / 按歌手). */
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (v: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-lg border border-border"
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'min-h-11 px-3 text-[13px] transition-colors',
            value === v
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** One score as a LIST row: bold title over a quiet artist line, format pill and chevron on the right. */
export function ScoreLine({
  title,
  artist,
  format,
  href,
  action,
}: {
  title: string
  artist: string
  format: ScoreFormat
  href: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[60px] items-center gap-1 border-t border-border pr-2 transition-colors first:border-t-0 hover:bg-[hsl(var(--raised))]">
      <Link
        href={href}
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2 pl-3.5 pr-1"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{title || '未识别的曲名'}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{artist || ' '}</span>
        </span>
        <span className={cx(PILL, 'mono text-[11px]')}>{FORMAT_BADGE[format].label}</span>
        {!action && (
          <span aria-hidden className="text-muted-foreground">
            ›
          </span>
        )}
      </Link>
      {action}
    </div>
  )
}

export function LoadMore({ remaining, onMore }: { remaining: number; onMore: () => void }) {
  return (
    <div className="flex pt-4">
      <button
        type="button"
        onClick={onMore}
        className={cx(buttonClass('outline'), 'w-full sm:w-auto')}
      >
        再显示 {Math.min(PAGE_SIZE, remaining)} 个（还有 {remaining} 个）
      </button>
    </div>
  )
}

export function Notice({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'error'
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-[14px] border p-4 text-sm leading-relaxed',
        tone === 'error'
          ? 'border-destructive text-destructive'
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      {children}
    </div>
  )
}

/** Page tabs (歌单 / 成员 / 设置): one row of equal buttons, the chosen one on the raised surface. */
export function Tabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (v: T) => void
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 rounded-[12px] border border-border bg-card p-1"
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'min-h-10 flex-1 rounded-[9px] px-3 text-sm font-bold transition-colors',
            value === v
              ? 'bg-[hsl(var(--raised))] text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

const AVATAR_HUES = [231, 143, 28, 330, 190, 265, 50, 0]

/** A member's initial on a coloured disc; the colour follows the name, so it stays the same everywhere. */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  let sum = 0
  for (const ch of name) sum = (sum * 31 + (ch.codePointAt(0) ?? 0)) % 9973
  const hue = AVATAR_HUES[sum % AVATAR_HUES.length] ?? 231
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        background: `hsl(${hue} 60% 55% / 0.22)`,
        color: `hsl(${hue} 70% 68%)`,
      }}
    >
      {[...name.trim()][0]?.toUpperCase() ?? '?'}
    </span>
  )
}
