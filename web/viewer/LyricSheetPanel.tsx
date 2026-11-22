/**
 * 词谱: the singer's lyric sheet for a band song. Shows the lyrics in large type with the
 * chords of each line above it and follows playback; the band pastes the words once
 * (编辑歌词) and ties each line to the bar where it starts (对齐小节, 边放边点).
 * Renders the panel body only; the parent supplies the scrolling container and toggle.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  activeLine,
  alignByTime,
  alignLine,
  alignedCount,
  hasLrcTimes,
  lineBars,
  lrcLineTimes,
  lyricText,
  nextLine,
  parseLyricText,
  type SheetLine,
} from '@/songs/lyricSheet'
import { buttonClass, cx, SECTION_TITLE } from '../lib/classes'

const BTN = cx(buttonClass('outline'), 'px-3 text-[13px]')
const MUTED = 'text-muted-foreground'
const MONO = { fontFamily: 'var(--font-mono)' } as const
const NUM_INPUT =
  'h-11 w-16 rounded-lg border border-border bg-background px-2 text-sm focus:border-primary focus:outline-none'
const LYRIC = 'text-xl leading-relaxed md:text-2xl'

type Mode = 'view' | 'edit' | 'align'

function errMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '保存失败，请重试'
}

function scrollToCenter(el: HTMLElement | null | undefined) {
  if (!el || typeof el.scrollIntoView !== 'function') return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  el.scrollIntoView(reduce ? { block: 'center' } : { block: 'center', behavior: 'smooth' })
}

interface ChordSegment {
  /** The bar this segment belongs to. */
  bar: number
  /** Chord names in this bar, with names that just repeat the one before collapsed away. */
  names: string[]
}

/** Chords of bars `from…to`, consecutive duplicates collapsed (also across bar lines). */
function chordSegments(chords: string[][], from: number, to: number): ChordSegment[] {
  const out: ChordSegment[] = []
  let last: string | null = null
  for (let b = from; b <= to; b++) {
    const names: string[] = []
    for (const name of chords[b - 1] ?? []) {
      if (name === last) continue
      names.push(name)
      last = name
    }
    out.push({ bar: b, names })
  }
  return out
}

/** The monospace chord row above a lyric line; the chord sounding at `bar` is emphasised. */
function ChordRow(props: { segments: ChordSegment[]; bar: number | null }) {
  const { segments, bar } = props
  const shown = segments.filter((s) => s.names.length > 0)
  if (shown.length === 0) return null
  // The segment holding the chord that sounds at `bar` (a bar that only repeats keeps the one before).
  let current = -1
  if (bar !== null) shown.forEach((s, i) => s.bar <= bar && (current = i))
  return (
    <div className={cx('text-sm', MUTED)} style={MONO} aria-label="和弦">
      {shown.map((s, i) => (
        <span key={s.bar}>
          {i > 0 && <span className="px-1.5 opacity-50">|</span>}
          <span className={i === current ? 'font-bold text-primary' : undefined}>
            {s.names.join(' ')}
          </span>
        </span>
      ))}
    </div>
  )
}

/** A bar number box that commits on blur / Enter, so typing "12" does not first set bar 1. */
function BarInput(props: {
  value: number | null
  max: number
  label: string
  onCommit: (bar: number | null) => void
}) {
  const { value, max, label, onCommit } = props
  const [text, setText] = useState(value === null ? '' : String(value))
  const [lastValue, setLastValue] = useState(value)
  if (lastValue !== value) {
    setLastValue(value)
    setText(value === null ? '' : String(value))
  }
  const commit = () => {
    const t = text.trim()
    if (!t) {
      if (value !== null) onCommit(null)
      return
    }
    const n = Number(t)
    if (Number.isInteger(n) && n >= 1 && n <= max) {
      if (n !== value) onCommit(n)
    } else {
      setText(value === null ? '' : String(value))
    }
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      value={text}
      placeholder="—"
      aria-label={label}
      className={NUM_INPUT}
      style={MONO}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

export function LyricSheetPanel(props: {
  lines: SheetLine[]
  bar: number
  totalBars: number
  chords: string[][]
  playing: boolean
  canControl: boolean
  onJumpBar: (bar: number) => void
  onSave: (lines: SheetLine[]) => Promise<void>
  /** When each bar starts in the score (ms); lets a pasted .lrc file be aligned by its times. */
  barStartsMs?: number[]
  /** The words written inside the score, already tied to bars; offered while the sheet is empty. */
  scoreLines?: SheetLine[]
}) {
  const { lines, bar, totalBars, chords, playing, canControl, onJumpBar, onSave, barStartsMs, scoreLines } = props

  const [mode, setMode] = useState<Mode>('view')
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<SheetLine[]>([])
  const [pointer, setPointer] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lineRefs = useRef<Array<HTMLElement | null>>([])

  const active = activeLine(lines, bar)
  const aligned = alignedCount(lines)

  const startEdit = () => {
    setText(lyricText(lines))
    setError(null)
    setMode('edit')
  }

  const startAlign = () => {
    const firstOpen = lines.findIndex((l) => l.bar === null)
    setDraft(lines.map((l) => ({ ...l })))
    setPointer(firstOpen >= 0 ? firstOpen : 0)
    setError(null)
    setMode('align')
  }

  /** Pasted text → lines; an .lrc file's times place the lines that have no bar yet. */
  const parsed = (): SheetLine[] => {
    const next = parseLyricText(text, lines)
    if (!barStartsMs || barStartsMs.length === 0 || !hasLrcTimes(text)) return next
    if (next.some((l) => l.bar !== null)) return next
    return alignByTime(next, lrcLineTimes(text), barStartsMs)
  }
  const lrcReady = !!barStartsMs && barStartsMs.length > 0 && hasLrcTimes(text)

  const save = async (next: SheetLine[]) => {
    setBusy(true)
    setError(null)
    try {
      await onSave(next)
      setMode('view')
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // Follow playback: keep the active line in view.
  useEffect(() => {
    if (mode !== 'view' || active < 0) return
    scrollToCenter(lineRefs.current[active])
  }, [mode, active])

  // While aligning, keep the line to tap next in view.
  useEffect(() => {
    if (mode !== 'align') return
    scrollToCenter(lineRefs.current[pointer])
  }, [mode, pointer])

  /** The intro / interlude countdown, shown before the line that comes next. */
  const status = useMemo(() => {
    const next = nextLine(lines, bar)
    if (!next) return null
    if (active >= 0) {
      const range = lineBars(lines, active, totalBars)
      if (!range || bar <= range[1]) return null
    }
    if (next.bars === 1) return { before: next.index, text: '下一小节进', soon: true }
    return {
      before: next.index,
      text: `${active < 0 ? '前奏' : '间奏'} · 还有 ${next.bars} 小节进`,
      soon: false,
    }
  }, [lines, bar, active, totalBars])

  const errorRow = error && (
    <p role="alert" className="m-0 text-sm text-destructive">
      {error}
    </p>
  )

  // ---- Edit ----
  if (mode === 'edit') {
    return (
      <section aria-label="编辑歌词" className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">歌词</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            autoFocus
            className="min-h-[14rem] w-full rounded-[12px] border border-border bg-background px-3 py-2 text-base leading-relaxed focus:border-primary focus:outline-none"
          />
        </label>
        <p className={MUTED}>
          一行一句。单独一行写 [副歌] 这样的段落名，会显示成段落标题。改词不会丢掉已经对齐的小节。也可以直接贴
          .lrc 歌词文件的内容。
        </p>
        {lrcReady && (
          <p className="m-0 rounded-[12px] border border-primary px-3 py-2 text-primary">
            这段歌词带时间，保存时会按时间自动对到小节。谱子和原曲速度不一样或者有反复时会有偏差，保存后看一眼，不对的在「对齐小节」里改。
          </p>
        )}
        {errorRow}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={busy}
            onClick={() => void save(parsed())}
          >
            {busy ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            className={buttonClass('outline')}
            disabled={busy}
            onClick={() => setMode('view')}
          >
            取消
          </button>
        </div>
      </section>
    )
  }

  // ---- Align (边放边点) ----
  if (mode === 'align') {
    const done = pointer >= draft.length
    const tap = () => {
      if (done || bar < 1) return
      setDraft((d) => alignLine(d, pointer, bar))
      setPointer((p) => Math.min(p + 1, draft.length))
    }
    return (
      <section aria-label="对齐小节" className="flex flex-col gap-3 text-sm">
        <p className={MUTED}>按下面播放器的播放键，听到哪一句开始就点一下。</p>
        {/* Stays in reach while the list scrolls with the song. */}
        <div className="sticky -top-3 z-10 -mx-3 flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
          <button
            type="button"
            className={cx(buttonClass('primary'), 'min-h-12 text-base')}
            disabled={done || bar < 1 || busy}
            onClick={tap}
          >
            这一句开始了（第 {Math.max(bar, 1)} 小节）
          </button>
          <button
            type="button"
            className={buttonClass('outline')}
            disabled={pointer === 0 || busy}
            onClick={() => setPointer((p) => Math.max(0, p - 1))}
          >
            上一句
          </button>
          <span className={MUTED} style={MONO}>
            {playing ? '播放中' : '已暂停'} · 第 {bar} 小节
          </span>
        </div>
        {done && <p className={MUTED}>每一句都点过了。可以点「完成」保存。</p>}

        <ol className="flex flex-col gap-1">
          {draft.map((l, i) => {
            const isPointer = i === pointer
            return (
              <li
                key={i}
                ref={(el) => {
                  lineRefs.current[i] = el
                }}
                aria-current={isPointer ? 'step' : undefined}
                className={cx(
                  'flex items-center gap-2 rounded-[10px] border-l-4 px-2 py-1.5',
                  isPointer
                    ? 'border-primary bg-accent'
                    : 'border-transparent',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                  onClick={() => setPointer(i)}
                >
                  {l.section !== null && <span className={cx('text-xs', MUTED)}>{l.section}</span>}
                  <span className={cx('text-base', l.bar === null && MUTED)}>
                    {isPointer && (
                      <span aria-hidden="true" className="mr-1 text-primary">
                        ▶
                      </span>
                    )}
                    {l.text}
                  </span>
                </button>
                <BarInput
                  value={l.bar}
                  max={Math.max(1, totalBars)}
                  label={`第 ${i + 1} 句「${l.text}」开始的小节`}
                  onCommit={(b) => setDraft((d) => alignLine(d, i, b))}
                />
              </li>
            )
          })}
        </ol>

        {errorRow}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={busy}
            onClick={() => void save(draft)}
          >
            {busy ? '保存中…' : '完成'}
          </button>
          <button
            type="button"
            className={buttonClass('outline')}
            disabled={busy}
            onClick={() => setMode('view')}
          >
            取消
          </button>
          <button
            type="button"
            className={buttonClass('ghost')}
            disabled={busy || alignedCount(draft) === 0}
            onClick={() => {
              setDraft((d) => d.map((l) => ({ ...l, bar: null })))
              setPointer(0)
            }}
          >
            全部清除对齐
          </button>
        </div>
      </section>
    )
  }

  // ---- View ----
  if (lines.length === 0) {
    return (
      <section aria-label="词谱" className="flex flex-col items-start gap-3 text-sm">
        <p className={MUTED}>这首歌还没有歌词。</p>
        {errorRow}
        <div className="flex flex-wrap gap-2">
          {scoreLines && scoreLines.length > 0 && (
            <button
              type="button"
              className={buttonClass('primary')}
              disabled={busy}
              onClick={() => void save(scoreLines)}
            >
              {busy ? '保存中…' : `用谱里自带的歌词（${scoreLines.length} 句，已对好小节）`}
            </button>
          )}
          <button
            type="button"
            className={buttonClass(scoreLines && scoreLines.length > 0 ? 'outline' : 'primary')}
            onClick={startEdit}
          >
            粘贴歌词
          </button>
        </div>
      </section>
    )
  }

  const statusRow = status && (
    <p
      role="status"
      className={cx(
        'py-1 text-sm',
        status.soon ? 'font-semibold text-primary' : MUTED,
      )}
      style={MONO}
    >
      {status.text}
    </p>
  )

  return (
    <section aria-label="词谱" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h3 className={cx(SECTION_TITLE, 'mr-auto')}>词谱</h3>
        <button type="button" className={BTN} onClick={startEdit}>
          编辑歌词
        </button>
        <button type="button" className={BTN} onClick={startAlign}>
          对齐小节
        </button>
      </div>

      {aligned === 0 && (
        <p className={cx('text-sm', MUTED)}>
          歌词还没对齐小节。点「对齐小节」，边放边点，词谱就会跟着走。
        </p>
      )}

      <ol className="flex flex-col gap-1">
        {lines.map((l, i) => {
          const isActive = i === active
          const range = l.bar !== null ? lineBars(lines, i, totalBars) : null
          const body = (
            <>
              {range && (
                <ChordRow
                  segments={chordSegments(chords, range[0], range[1])}
                  bar={isActive ? bar : null}
                />
              )}
              <span className={LYRIC}>{l.text}</span>
            </>
          )
          const rowClass = cx(
            'flex w-full flex-col items-start rounded-[10px] border-l-4 px-3 py-1 text-left transition-opacity duration-150',
            isActive
              ? 'border-primary bg-accent opacity-100'
              : cx('border-transparent', l.bar === null ? 'opacity-40' : 'opacity-60'),
          )
          return (
            <li
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el
              }}
              aria-current={isActive ? 'true' : undefined}
            >
              {status && status.before === i && statusRow}
              {l.section !== null && (
                <div className={cx('mt-3 px-3 text-xs font-bold tracking-[0.02em]', MUTED)}>
                  {l.section}
                </div>
              )}
              {canControl && l.bar !== null ? (
                <button
                  type="button"
                  className={cx(rowClass, !isActive && 'hover:bg-[hsl(var(--raised))]')}
                  onClick={() => onJumpBar(l.bar!)}
                  title={`跳到第 ${l.bar} 小节`}
                >
                  {body}
                </button>
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
