import type { DailyMemberProgress, SongStatus } from '../../lib/api'
import { STATUS_LABELS } from '../../lib/band'
import { cx } from '../../lib/classes'
import { todayNumber } from '../../lib/daily'

export type Filter = 'all' | SongStatus

export const FILTERS: ReadonlyArray<readonly [Filter, string]> = [
  ['all', '全部'],
  ['learning', STATUS_LABELS.learning],
  ['ready', STATUS_LABELS.ready],
  ['maybe', STATUS_LABELS.maybe],
]

/** Tap order of the status chip. */
export const NEXT_STATUS: Record<SongStatus, SongStatus> = {
  learning: 'ready',
  ready: 'maybe',
  maybe: 'learning',
}

export const STATUS_CLASS: Record<SongStatus, string> = {
  learning: 'border-primary text-primary',
  ready: 'border-success text-success',
  maybe: 'border-border text-muted-foreground',
}

/** A square 44 px tool button (上移 / 下移 / 移除). */
export const ICON_BUTTON =
  'grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-border text-base text-muted-foreground transition-colors hover:bg-[hsl(var(--raised))] hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent'

/** A small text action (管理成员, 看更多): quiet, but still a 44 px target. */
export const TEXT_ACTION =
  'inline-flex min-h-11 items-center text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline'

/** A compact outline button for a card's header (编辑歌单, 排序). */
export const SMALL_BUTTON =
  'inline-flex min-h-11 shrink-0 items-center justify-center rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-[hsl(var(--raised))] disabled:opacity-50 min-[861px]:min-h-9'

/** A filter chip; the chosen one is inked. */
export function chipClass(on: boolean): string {
  return cx(
    'inline-flex min-h-11 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors min-[861px]:min-h-9',
    on
      ? 'border-foreground bg-foreground text-background'
      : 'border-border text-muted-foreground hover:text-foreground',
  )
}

const MB = 1024 * 1024
export const fmtSpace = (n: number) =>
  n >= 1024 * MB ? `${(n / 1024 / MB).toFixed(1)} GB` : `${Math.round(n / MB)} MB`

/** A member's 每日一练 position and count, as one muted line. */
export function dailyLine(p: DailyMemberProgress | undefined): string {
  if (!p || p.startedAt === null) return '还没开始每日一练'
  return `每日一练 第 ${todayNumber(p.startedAt, Date.now())} 天 · 完成 ${p.doneCount}`
}

/** The order with the entries at i and j swapped; the same list when either index is out of range. */
export function swapped(ids: string[], i: number, j: number): string[] {
  const next = [...ids]
  const a = next[i]
  const b = next[j]
  if (a === undefined || b === undefined) return ids
  next[i] = b
  next[j] = a
  return next
}
