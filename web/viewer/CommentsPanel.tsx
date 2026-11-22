/**
 * 小节留言 list grouped by bar, with an add form, one-tap 小节标记 (这里我改了 / 这里有问题 /
 * 这里注意), a short voice note, 「知道了」 for the others and delete for the author or an admin.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { recordingFileUrl, type BarComment, type MarkKind, type UserInfo } from '../lib/api'
import { MARK_KINDS, MARK_LABEL } from '../lib/activity'
import { buttonClass, cx, SECTION_TITLE } from '../lib/classes'

const TEXT_MAX = 200

function errMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '操作失败，请重试'
}

function fmtWhen(at: number, now: number): string {
  const diff = now - at
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(at).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const CHIP: Record<MarkKind, string> = {
  changed: 'border-primary text-primary',
  problem: 'border-amber-500 text-amber-600 dark:text-amber-400',
  note: 'border-border text-muted-foreground',
}

/** The kind of a 小节标记 as a small chip. */
export function MarkChip({ kind }: { kind: MarkKind }) {
  return (
    <span
      className={`mr-1.5 inline-block rounded-full border px-2 align-[1px] text-xs leading-5 ${CHIP[kind]}`}
    >
      {MARK_LABEL[kind]}
    </span>
  )
}

/** The longest voice note, in seconds. */
const VOICE_MAX_S = 30

/** Who has tapped 「知道了」, as a short line: "小林、阿May 知道了". */
export function ackLine(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length <= 3) return `${names.join('、')} 知道了`
  return `${names.slice(0, 3).join('、')} 等 ${names.length} 人知道了`
}

const INPUT =
  'h-11 rounded-lg border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none'
/** A quiet small button (定位, 删除): 44 px on phones. */
const SMALL_BTN =
  'inline-flex min-h-11 items-center rounded-full px-3 text-xs text-muted-foreground transition-colors hover:bg-[hsl(var(--raised))] sm:min-h-8'

export function CommentsPanel(props: {
  comments: BarComment[]
  members: Array<{ id: string; displayName: string }>
  me: UserInfo | null
  /** Pre-filled bar number for a new comment (the current bar). */
  currentBar: number
  /** Bars in the song (for the number input max). */
  bars: number
  /** When set, only this bar's comments are listed first / highlighted. */
  focusBar: number | null
  /** `kind` is set for a one-tap 小节标记 (then `text` may be empty). */
  onAdd: (bar: number, text: string, kind?: MarkKind) => Promise<void>
  onRemove: (id: string) => Promise<void>
  /** Jump the sheet to that bar (optional). */
  onJump?: (bar: number) => void
  /** 「知道了」 on someone else's entry (optional). */
  onAck?: (id: string) => Promise<void>
  /** Sends a recorded voice note for a bar (optional; the button shows only where recording works). */
  onVoice?: (bar: number, clip: Blob) => Promise<void>
}) {
  const { comments, members, me, currentBar, bars, focusBar, onAdd, onRemove, onJump, onAck, onVoice } = props

  // Opened on a bar (a 留言 badge on the sheet): that bar; else the current bar.
  const [draftBar, setDraftBar] = useState(String(focusBar ?? currentBar))
  const [draftText, setDraftText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Follow the current bar until the user types their own number.
  const [lastCurrent, setLastCurrent] = useState(currentBar)
  if (lastCurrent !== currentBar) {
    setLastCurrent(currentBar)
    setDraftBar(String(currentBar))
  }

  const nameOf = (userId: string) => {
    if (me && userId === me.id) return me.displayName
    return members.find((m) => m.id === userId)?.displayName ?? '成员'
  }

  const groups = useMemo(() => {
    const byBar = new Map<number, BarComment[]>()
    for (const c of comments) {
      const list = byBar.get(c.bar) ?? []
      list.push(c)
      byBar.set(c.bar, list)
    }
    const bars = [...byBar.keys()].sort((a, b) => {
      if (a === focusBar) return -1
      if (b === focusBar) return 1
      return a - b
    })
    return bars.map((bar) => ({
      bar,
      items: (byBar.get(bar) ?? []).slice().sort((a, b) => a.at - b.at),
    }))
  }, [comments, focusBar])

  const now = Date.now()

  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const bar = Number(draftBar)
    const text = draftText.trim()
    if (!Number.isInteger(bar) || bar < 1 || bar > bars) {
      setError(`小节号需在 1–${bars} 之间`)
      return
    }
    if (!text) {
      setError('留言不能为空')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onAdd(bar, text)
      setDraftText('')
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** One tap: a 标记 of that kind on the bar in the form, with the typed words if any. */
  const handleMark = async (kind: MarkKind) => {
    const bar = Number(draftBar)
    if (!Number.isInteger(bar) || bar < 1 || bar > bars) {
      setError(`小节号需在 1–${bars} 之间`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onAdd(bar, draftText.trim(), kind)
      setDraftText('')
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleAck = async (c: BarComment) => {
    if (!onAck) return
    setError(null)
    try {
      await onAck(c.id)
    } catch (err) {
      setError(errMessage(err))
    }
  }

  // Voice note: tap to start, tap again to send; stops by itself after VOICE_MAX_S.
  const canRecord =
    !!onVoice && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const tick = useRef<number | undefined>(undefined)
  const stopTracks = () => recorder.current?.stream.getTracks().forEach((t) => t.stop())
  useEffect(
    () => () => {
      window.clearInterval(tick.current)
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.ondataavailable = null
        recorder.current.onstop = null
        recorder.current.stop()
      }
      stopTracks()
    },
    [],
  )

  const startVoice = async () => {
    const bar = Number(draftBar)
    if (!Number.isInteger(bar) || bar < 1 || bar > bars) {
      setError(`小节号需在 1–${bars} 之间`)
      return
    }
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('没有拿到麦克风。请在浏览器里允许这个网站用麦克风。')
      return
    }
    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = () => {
      window.clearInterval(tick.current)
      stream.getTracks().forEach((t) => t.stop())
      setRecording(false)
      const clip = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
      if (clip.size === 0 || !onVoice) return
      setBusy(true)
      onVoice(bar, clip)
        .catch((err: unknown) => setError(errMessage(err)))
        .finally(() => setBusy(false))
    }
    recorder.current = rec
    rec.start()
    setSeconds(0)
    setRecording(true)
    const started = Date.now()
    tick.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000)
      setSeconds(s)
      if (s >= VOICE_MAX_S && rec.state !== 'inactive') rec.stop()
    }, 250)
  }
  const stopVoice = () => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }

  const handleRemove = async (c: BarComment) => {
    if (!window.confirm('删除这条留言？')) return
    setError(null)
    try {
      await onRemove(c.id)
    } catch (err) {
      setError(errMessage(err))
    }
  }

  return (
    <section aria-label="小节留言" className="flex flex-col gap-3 text-sm">
      {groups.length === 0 && (
        <p className="m-0 rounded-[12px] border border-dashed border-border px-3.5 py-3 text-muted-foreground">
          还没有留言。在小节上留一句话，比如“这里一起停两拍”，大家都会看到。
        </p>
      )}

      {groups.map((group) => {
        const focused = group.bar === focusBar
        return (
          <div
            key={group.bar}
            className={cx(
              'rounded-[12px] border bg-background px-3.5 py-2.5',
              focused ? 'border-primary' : 'border-border',
            )}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-bold">第 {group.bar} 小节</span>
              {onJump && (
                <button
                  type="button"
                  onClick={() => onJump(group.bar)}
                  className={cx(SMALL_BTN, '-mr-2 hover:text-primary')}
                >
                  定位
                </button>
              )}
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {group.items.map((c) => {
                const canDelete = !!me && (c.userId === me.id || me.role === 'admin')
                const acks = c.acks ?? []
                const canAck = !!onAck && !!me && c.userId !== me.id && !acks.includes(me.id)
                return (
                  <li key={c.id} className="flex flex-col gap-0.5">
                    <p className="m-0 whitespace-pre-wrap break-words">
                      {c.kind && <MarkChip kind={c.kind} />}
                      {c.text}
                    </p>
                    {c.clipId && (
                      <audio
                        controls
                        preload="none"
                        src={recordingFileUrl(c.clipId)}
                        className="mt-1 h-10 w-full max-w-[320px]"
                      />
                    )}
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{nameOf(c.userId)}</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtWhen(c.at, now)}</span>
                      {acks.length > 0 && <span>{ackLine(acks.map(nameOf))}</span>}
                      {canAck && (
                        <button
                          type="button"
                          onClick={() => void handleAck(c)}
                          className={cx(SMALL_BTN, 'border border-border text-foreground hover:text-primary')}
                        >
                          知道了
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void handleRemove(c)}
                          className={cx(SMALL_BTN, '-mr-2 ml-auto hover:text-destructive')}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <form
        onSubmit={(e) => void handleAdd(e)}
        className="flex flex-col gap-2.5 border-t border-border pt-3"
      >
        <h3 className={SECTION_TITLE}>留一句话</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">小节</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={bars}
              value={draftBar}
              onChange={(e) => setDraftBar(e.target.value)}
              className={`${INPUT} w-20`}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </label>
          <span
            className="ml-auto text-xs text-muted-foreground"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {draftText.length}/{TEXT_MAX}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="小节标记">
          {MARK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={busy}
              onClick={() => void handleMark(kind)}
              className={`min-h-11 rounded-full border px-3 text-xs transition-colors hover:bg-[hsl(var(--raised))] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 ${CHIP[kind]}`}
            >
              {MARK_LABEL[kind]}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">点一下就标在第 {draftBar || '?'} 小节，框里的字会一起带上</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            aria-label="留言内容"
            maxLength={TEXT_MAX}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="写一句话"
            className={`${INPUT} min-w-0 flex-1`}
          />
          <button
            type="submit"
            disabled={busy}
            className={cx(buttonClass('primary'), 'shrink-0')}
          >
            添加
          </button>
        </div>
        {canRecord && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy && !recording}
              onClick={() => (recording ? stopVoice() : void startVoice())}
              aria-pressed={recording}
              className={cx(
                buttonClass('outline'),
                recording && 'border-destructive text-destructive',
              )}
            >
              {recording ? `停止并发送（${seconds} 秒）` : '录一段语音'}
            </button>
            <span className="text-xs text-muted-foreground">
              {recording
                ? `最长 ${VOICE_MAX_S} 秒，到时间会自动发送`
                : `哼一下或弹一下你的想法，挂在第 ${draftBar || '?'} 小节`}
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 text-destructive">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
