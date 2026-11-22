/**
 * The slim sticky status bar over the sheet during a rehearsal: 排练中, song position,
 * the sync light, this device's role and what the 音箱 fills in, then section, bar,
 * speed and loop pass. Two lines on phones and tablets, one line on wide screens.
 */
import type { ReactNode } from 'react'
import { cx, PILL } from '../lib/classes'

const LIGHTS = {
  ok: { color: 'hsl(var(--success))', text: '已同步' },
  fixing: { color: 'hsl(38 92% 50%)', text: '正在对齐' },
  away: { color: 'hsl(var(--destructive))', text: '掉线，重连中' },
} as const

/** One line of the bar: never wraps, clips what does not fit at the end. */
const ROW = 'flex h-6 min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap'

export function RehearsalStrip(props: {
  songTitle: string
  /** 1-based position in today's setlist, and its length (0 = not in the setlist). */
  songIndex: number
  songCount: number
  section: string | null
  nextSection: string | null
  bar: number
  bars: number
  speedPct: number
  /** Loop pass info, or null when not looping. */
  loop: { pass: number; passes: number | null; startBar: number; endBar: number } | null
  playing: boolean
  /** e.g. '你是音箱' / '静音看谱' / '耳机出声'. */
  role: string
  /** This device's user conducts. */
  leader?: boolean
  /** Parts the 音箱 plays for absent members (empty: it stays silent), or null when unknown. */
  filling?: string[] | null
  /** 同步 light of this device. */
  light: 'ok' | 'fixing' | 'away'
  /** Optional right-side content (buttons from the parent). */
  children?: ReactNode
}) {
  const { songTitle, songIndex, songCount, section, nextSection, bar, bars, speedPct, loop } = props
  const mono = { fontFamily: 'var(--font-mono)' }

  let loopText: string | null = null
  if (loop) {
    const passText =
      loop.passes === null ? `第 ${loop.pass} 遍（一直循环）` : `第 ${loop.pass}/${loop.passes} 遍`
    loopText = `循环 ${loop.startBar}–${loop.endBar} 小节 · ${passText}`
  }
  const light = LIGHTS[props.light]
  const roleText = props.leader ? `我是指挥 · ${props.role}` : props.role
  const filling = props.filling
  const fillText = filling
    ? filling.length > 0
      ? `音箱补位：${filling.join('、')}`
      : '全员到齐，音箱不出声'
    : null

  return (
    <div
      role="region"
      aria-label="排练状态"
      className="mb-2 flex flex-col gap-1 rounded-[14px] border border-border bg-card px-3 py-1.5 text-[13px] lg:flex-row lg:items-center lg:gap-3"
    >
      <div className={cx(ROW, 'lg:shrink-0')}>
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{
            background: props.playing ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          }}
        />
        <b className="shrink-0 font-bold">排练中</b>
        {songIndex > 0 && (
          <span className="shrink-0 text-muted-foreground" style={mono}>
            第 {songIndex}/{songCount} 首
          </span>
        )}
        <span className="min-w-0 truncate lg:max-w-[16rem]">{songTitle}</span>
        <span
          className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground lg:ml-1"
          role="status"
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: light.color }}
          />
          {light.text}
        </span>
      </div>

      <div className={cx(ROW, 'lg:flex-1')}>
        <span className={cx(PILL, 'border-primary text-primary')}>{roleText}</span>
        {fillText && (
          // The one item that gives way when the line is full: a pill that ellipsizes.
          <span
            className="block min-w-0 truncate rounded-full border border-border px-2.5 text-xs leading-[22px] text-muted-foreground"
            title={fillText}
          >
            {fillText}
          </span>
        )}
        {section && (
          <span className="flex shrink-0 items-center gap-1.5">
            <b className="font-semibold">{section}</b>
            {nextSection && (
              <span className="hidden text-muted-foreground sm:inline">→ 下一段：{nextSection}</span>
            )}
          </span>
        )}
        <span className="shrink-0 text-muted-foreground" style={mono}>
          第 {bar}/{bars} 小节
        </span>
        <span className="shrink-0 text-muted-foreground" style={mono}>
          {speedPct}%
        </span>
        {loopText && (
          <span className="shrink-0 text-muted-foreground" style={mono}>
            {loopText}
          </span>
        )}
      </div>

      {props.children && (
        <span className="flex flex-wrap items-center gap-2 lg:ml-auto">{props.children}</span>
      )}
    </div>
  )
}
