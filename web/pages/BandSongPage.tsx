import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  api,
  errorText,
  fetchBytes,
  fileUrl,
  type FillConfig,
  type MemberProgress,
  type SongStatus,
  type UserInfo,
} from '../lib/api'
import {
  addComment,
  removeComment,
  ackComment,
  addVoiceComment,
  removeSong,
  STATUS_LABELS,
  updateSong,
  useBand,
} from '../lib/band'
import { buttonClass, CARD, cx, LIST, LIST_ROW, SECTION_TITLE, SELECT } from '../lib/classes'
import { useDrumPart, useDrumStyles } from '../lib/drums'
import { fmtDuration } from '../lib/practice'
import { useRehearsal } from '../lib/rehearsal'
import { goBack, HREF_BAND, hrefViewer, navigate } from '../lib/route'
import { hrefCombine } from '../lib/combos'
import type { ComboRecipe } from '../lib/api'
import { useMe } from '../lib/session'
import { fillOf, planFill } from '@/songs/rehearsalFill'
import { Link } from '../components/Link'
import { RecordingsPanel } from '../components/RecordingsPanel'
import { Avatar, Notice, Seg, Tabs } from '../components/ui'
import { chooseEncoding, loadAlphaTab } from '../viewer/alphaTab'
import { CommentsPanel } from '../viewer/CommentsPanel'
import { FillPanel } from '../viewer/FillPanel'
import { SheetsPanel } from '../viewer/SheetsPanel'
import { trackLabels } from '../viewer/trackNames'
import { OwnFiles } from './bandsong/OwnFiles'
import { PartCard } from './bandsong/PartCard'

type Speed = 'own' | 'set'

type Tab = 'parts' | 'notes' | 'recordings' | 'more'

const TAB_OPTIONS: ReadonlyArray<readonly [Tab, string]> = [
  ['parts', '阵容'],
  ['notes', '留言'],
  ['recordings', '录音'],
  ['more', '更多'],
]

type Parts = Record<string, string>

const NOTE_MAX = 2000
const SPEED_MIN = 50
const SPEED_MAX = 150
const SPEED_STEP = 5

const STATUS_OPTIONS: ReadonlyArray<readonly [SongStatus, string]> = (
  Object.keys(STATUS_LABELS) as SongStatus[]
).map((s) => [s, STATUS_LABELS[s]] as const)

const SPEED_OPTIONS: ReadonlyArray<readonly [Speed, string]> = [
  ['own', '各自决定'],
  ['set', '统一速度'],
]

type Tracks =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      labels: Array<{ zh: string; original: string }>
      /** Per track, in the same order as `labels`: a drum track. */
      drums: boolean[]
      /** Bars in the score, when known (a combo's bars are not read). */
      bars: number | null
    }

type FillSave = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/** The page head: a round back button, the title over a quiet line, and actions on the right. */
function SongHead({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children?: ReactNode
}) {
  return (
    <header className="flex items-center gap-3 pb-4 pt-4 min-[861px]:pt-6">
      <button
        type="button"
        aria-label="返回乐队"
        onClick={() => goBack(HREF_BAND)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-2xl leading-none text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
      >
        <span aria-hidden className="-mt-0.5">
          ‹
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="m-0 break-words font-display text-[22px] font-black leading-tight min-[861px]:text-[26px]">
          {title}
        </h1>
        {meta && <p className="m-0 truncate text-[13px] text-muted-foreground">{meta}</p>}
      </div>
      {children}
    </header>
  )
}

const DRUM_NAME = /鼓|drum/i

const clamp = (n: number) => Math.min(SPEED_MAX, Math.max(SPEED_MIN, n))

/** A band song's page: rehearse it, set its status, speed, note, parts and see who practised what. */
export function BandSongPage({ id }: { id: string }) {
  const { state, error, reload } = useBand()
  const me = useMe()
  const song = state?.songs.find((s) => s.id === id)
  const songPath = song?.path ?? ''
  const partsKey = JSON.stringify(song?.parts ?? {})
  const note = song?.note ?? ''

  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState(note)
  const [partsDraft, setPartsDraft] = useState<Parts>(() => song?.parts ?? {})
  const [tracks, setTracks] = useState<Tracks>({ status: 'loading' })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<Tab>('parts')
  /** 组合乐队谱 of this song (recipes made on the 组合 page). */
  const [combos, setCombos] = useState<ComboRecipe[]>([])
  const comboId = song?.comboId ?? null
  const combo = combos.find((c) => c.id === comboId) ?? null

  const rehearsal = useRehearsal()
  const drumStyles = useDrumStyles()
  // A combo's saved drums live under its base score.
  const savedDrums = useDrumPart(combo ? combo.base : songPath)
  const hasSavedDrums = savedDrums.part !== null

  // 补位 edits: shown at once, saved to the band 600 ms after the last change.
  const [fillEdit, setFillEdit] = useState<FillConfig | null>(null)
  const [fillSave, setFillSave] = useState<FillSave>('idle')
  const fillPending = useRef<{ songId: string; fill: FillConfig } | null>(null)
  const fillTimer = useRef<number | undefined>(undefined)

  // Leaving the page with an unsaved 补位 change still saves it.
  useEffect(
    () => () => {
      const p = fillPending.current
      if (!p) return
      window.clearTimeout(fillTimer.current)
      void updateSong({ id: p.songId, fill: p.fill }).catch(() => undefined)
    },
    [],
  )

  useEffect(() => {
    if (!songPath) return
    let cancelled = false
    api
      .combos(songPath)
      .then((list) => {
        if (!cancelled) setCombos(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [songPath])

  // Keep the drafts in step with what the server holds (after a save, or a first read).
  useEffect(() => setNoteDraft(note), [note])
  useEffect(() => setPartsDraft(JSON.parse(partsKey) as Parts), [partsKey])

  // Read the file's tracks in the browser (parsed only, not rendered). With a 组合乐队谱
  // the tracks are the recipe's parts, in order.
  useEffect(() => {
    if (combo) {
      setTracks({
        status: 'ready',
        labels: combo.parts.map((p) => ({ zh: p.name, original: '' })),
        drums: combo.parts.map((p) => DRUM_NAME.test(p.name)),
        bars: null,
      })
      return
    }
    if (!songPath) return
    let cancelled = false
    setTracks({ status: 'loading' })
    void (async () => {
      try {
        const at = await loadAlphaTab()
        const bytes = await fetchBytes(fileUrl(songPath))
        const settings = new at.Settings()
        settings.importer.encoding = chooseEncoding(at, bytes)
        const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, settings)
        const labels = trackLabels(score.tracks)
        const drums = score.tracks.map((t) => Boolean(t.isPercussion || t.staves[0]?.isPercussion))
        const bars = score.masterBars.length
        if (!cancelled) setTracks({ status: 'ready', labels, drums, bars })
      } catch (e) {
        if (!cancelled)
          setTracks({
            status: 'error',
            message: `读不出这个谱子的音轨：${errorText(e)}`,
          })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [songPath, combo])

  if (!state) {
    return (
      <div className="max-w-[640px]">
        <SongHead title="排练" />
        {error ? (
          <div className={cx(CARD, 'space-y-3')}>
            <p className="m-0 text-sm text-destructive">{error}</p>
            <button type="button" onClick={reload} className={buttonClass()}>
              重试
            </button>
          </div>
        ) : (
          <div className={CARD}>
            <p className="m-0 text-sm text-muted-foreground">正在读取…</p>
          </div>
        )}
      </div>
    )
  }

  if (!song) {
    return (
      <div className="max-w-[640px]">
        <SongHead title="排练" />
        <div className={cx(CARD, 'space-y-3')}>
          <p className="m-0 text-sm text-muted-foreground">这首歌已经不在歌单里了。</p>
          <Link href={HREF_BAND} className={buttonClass()}>
            回到乐队歌单
          </Link>
        </div>
      </div>
    )
  }

  const memberById = new Map<string, UserInfo>(state.members.map((m) => [m.id, m]))
  const progress: MemberProgress[] = state.progress[song.id] ?? []

  const run = async (key: string, job: () => Promise<void>) => {
    if (busy) return
    setBusy(key)
    setNotice(null)
    try {
      await job()
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const setStatus = (status: SongStatus) => {
    if (status !== song.status) void run('status', () => updateSong({ id: song.id, status }))
  }

  const setSpeed = (pct: number | null) =>
    void run('speed', () => updateSong({ id: song.id, rehearsalSpeedPct: pct }))

  const speedMode: Speed = song.rehearsalSpeedPct === null ? 'own' : 'set'
  const speedValue = song.rehearsalSpeedPct === null ? 100 : clamp(song.rehearsalSpeedPct)

  const changeSpeedMode = (mode: Speed) => {
    if (mode === speedMode) return
    setSpeed(mode === 'own' ? null : 100)
  }

  const noteDirty = noteDraft !== song.note

  const partsDirty = JSON.stringify(partsDraft) !== partsKey

  const setPart = (track: number, userId: string) => {
    setPartsDraft((prev) => {
      const next = { ...prev }
      if (userId) next[String(track)] = userId
      else delete next[String(track)]
      return next
    })
  }

  const saveParts = () => void run('parts', () => updateSong({ id: song.id, parts: partsDraft }))

  const saveNote = () => void run('note', () => updateSong({ id: song.id, note: noteDraft }))

  // 补位
  const saveFillNow = async () => {
    const p = fillPending.current
    if (!p) return
    window.clearTimeout(fillTimer.current)
    setFillSave('saving')
    try {
      await updateSong({ id: p.songId, fill: p.fill })
      if (fillPending.current === p) {
        fillPending.current = null
        setFillEdit(null)
        setFillSave('saved')
      }
    } catch (e) {
      setFillSave('error')
      setNotice(errorText(e))
    }
  }

  const changeFill = (next: FillConfig) => {
    fillPending.current = { songId: song.id, fill: next }
    setFillEdit(next)
    setFillSave('pending')
    window.clearTimeout(fillTimer.current)
    fillTimer.current = window.setTimeout(() => void saveFillNow(), 600)
  }

  const fill = fillEdit ?? fillOf({ fill: song.fill })
  const rehearsing = rehearsal.state?.active === true
  const presentIds = rehearsing
    ? (rehearsal.state?.devices ?? []).map((d) => d.userId)
    : state.members.map((m) => m.id)
  const readyTracks = tracks.status === 'ready' ? tracks : null
  const fillPlan = readyTracks
    ? planFill({
        tracks: readyTracks.labels.map((l, i) => ({
          index: i,
          name: l.zh,
          isDrums: readyTracks.drums[i] ?? false,
        })),
        parts: song.parts,
        present: presentIds,
        members: state.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          instrument: m.instrument,
        })),
        fill,
        hasSavedDrums,
      })
    : null
  const fillCaption = rehearsing
    ? '按现在在场的人自动决定'
    : '假设全员到齐；排练时会按实际到场的人自动决定'
  const fillStatusText: Record<FillSave, string> = {
    idle: '',
    pending: '待保存…',
    saving: '正在保存…',
    saved: '已保存',
    error: '保存失败，请再改一次试试',
  }

  const doDelete = () =>
    void run('delete', async () => {
      await removeSong(song.id)
      navigate(HREF_BAND)
    })

  const viewerHref = combo
    ? hrefViewer({
        path: combo.base,
        format: 'score',
        title: song.title,
        artist: song.artist,
        band: song.id,
      }) + `&combo=${encodeURIComponent(combo.id)}`
    : hrefViewer({
        path: song.path,
        format: 'score',
        title: song.title,
        artist: song.artist,
        band: song.id,
      })

  const meta = [
    song.artist,
    STATUS_LABELS[song.status],
    readyTracks?.bars ? `${readyTracks.bars} 小节` : null,
    song.rehearsalSpeedPct !== null ? `排练速度 ${speedValue}%` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // What the 音箱 plays today, for the summary under the parts.
  const speakerParts = fillPlan
    ? [
        ...fillPlan.tracks.filter((t) => t.play).map((t) => t.name),
        ...(fillPlan.drums.play ? ['鼓'] : []),
      ]
    : []

  return (
    <div className="max-w-[640px] pb-24">
      <SongHead title={song.title || '未识别的曲名'} meta={meta}>
        <Link href={viewerHref} className={cx(buttonClass('primary'), 'shrink-0 px-5 font-bold')}>
          看谱
        </Link>
      </SongHead>

      <Tabs<Tab> label="这首歌" value={tab} options={TAB_OPTIONS} onChange={setTab} />

      {notice && (
        <div className="pt-4">
          <Notice tone="error">{notice}</Notice>
        </div>
      )}

      {/* 阵容: who plays which track, and what the 音箱 fills in */}
      {tab === 'parts' && (
        <div role="tabpanel" aria-label="阵容" className="space-y-3 pt-4">
          <h2 id="song-parts" className={SECTION_TITLE}>
            声部分配
          </h2>
          {tracks.status === 'loading' && (
            <div className={CARD}>
              <p className="m-0 text-sm text-muted-foreground">正在读取音轨…</p>
            </div>
          )}
          {tracks.status === 'error' && <Notice tone="error">{tracks.message}</Notice>}
          {tracks.status === 'ready' && tracks.labels.length === 0 && (
            <Notice>这个谱子里没有音轨。</Notice>
          )}
          {tracks.status === 'ready' && tracks.labels.length > 0 && (
            <>
              <ul aria-labelledby="song-parts" className="m-0 list-none space-y-3 p-0">
                {tracks.labels.map((label, i) => (
                  <PartCard
                    key={i}
                    label={label}
                    value={partsDraft[String(i)] ?? ''}
                    members={state.members}
                    meId={me?.id ?? null}
                    disabled={busy !== null}
                    reason={fillPlan?.tracks.find((t) => t.index === i)?.reason ?? null}
                    onPick={(userId) => setPart(i, userId)}
                  />
                ))}
              </ul>
              <div className="flex items-center justify-end gap-3">
                {partsDirty && <span className="text-xs text-muted-foreground">有改动还没保存</span>}
                <button
                  type="button"
                  onClick={saveParts}
                  disabled={!partsDirty || busy !== null}
                  className={buttonClass('primary')}
                >
                  保存声部
                </button>
              </div>
            </>
          )}

          {fillPlan && (
            <section aria-labelledby="song-fill" className="space-y-3 pt-4">
              <h2 id="song-fill" className={SECTION_TITLE}>
                人不在时（排练时音箱放什么）
              </h2>
              <div className={CARD}>
                <FillPanel
                  plan={fillPlan}
                  fill={fill}
                  onChange={changeFill}
                  nameOf={(userId) => memberById.get(userId)?.displayName ?? '已离开的成员'}
                  hasFileDrums={readyTracks?.drums.some(Boolean) ?? false}
                  hasSavedDrums={hasSavedDrums}
                  drumStyles={drumStyles.styles}
                  caption={fillCaption}
                />
              </div>
              <div className={cx(CARD, 'flex flex-wrap items-center gap-x-3 gap-y-1')}>
                <b className="text-sm">{rehearsing ? '现在排练时' : '排练时'}</b>
                <span className="min-w-0 flex-1 text-sm">
                  {speakerParts.length > 0 ? (
                    <>
                      音箱播放：<b>{speakerParts.join('、')}</b>
                    </>
                  ) : (
                    <span className="text-muted-foreground">全员到齐，音箱不出声</span>
                  )}
                  {fillPlan.metronome && <span className="text-muted-foreground">，加节拍器</span>}
                </span>
                <span aria-live="polite" className="text-xs text-muted-foreground">
                  {fillStatusText[fillSave]}
                </span>
              </div>
            </section>
          )}
        </div>
      )}

      {/* 留言: the rehearsal note and bar comments */}
      {tab === 'notes' && (
        <div role="tabpanel" aria-label="留言" className="space-y-3 pt-4">
          <section aria-labelledby="song-note" className={cx(CARD, 'space-y-2.5')}>
            <h2 id="song-note" className="m-0 text-base font-bold">
              排练备注
            </h2>
            <textarea
              aria-labelledby="song-note"
              value={noteDraft}
              maxLength={NOTE_MAX}
              rows={4}
              placeholder="例如：副歌第二遍的和弦换成 Am，第 12 小节注意节奏。"
              onChange={(e) => setNoteDraft(e.target.value)}
              className="w-full resize-y rounded-lg border border-border bg-transparent p-3 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-xs text-muted-foreground">
                {noteDraft.length} / {NOTE_MAX}
              </span>
              <button
                type="button"
                onClick={saveNote}
                disabled={!noteDirty || busy !== null}
                className={buttonClass('primary')}
              >
                保存备注
              </button>
            </div>
          </section>

          <section aria-labelledby="song-comments" className="space-y-3 pt-2">
            <h2 id="song-comments" className={SECTION_TITLE}>
              小节留言
            </h2>
            <div className={CARD}>
              <CommentsPanel
                comments={song.comments ?? []}
                members={state.members}
                me={me}
                currentBar={1}
                bars={readyTracks?.bars ?? 999}
                focusBar={null}
                onAdd={(bar, text) => addComment(song.id, bar, text)}
                onRemove={(commentId) => removeComment(song.id, commentId)}
                onAck={(commentId) => ackComment(song.id, commentId)}
                onVoice={(bar, clip) => addVoiceComment(song.id, bar, clip)}
              />
            </div>
          </section>
        </div>
      )}

      {/* 录音: rehearsal recordings */}
      {tab === 'recordings' && (
        <div role="tabpanel" aria-label="录音" className="pt-4">
          <section aria-label="排练录音" className={CARD}>
            <RecordingsPanel songId={song.id} members={state.members} />
          </section>
        </div>
      )}

      {/* 更多: speed, status, which score, sheets, own files, practice, delete */}
      {tab === 'more' && (
        <div role="tabpanel" aria-label="更多" className="space-y-3 pt-4">
          <section aria-labelledby="song-speed" className={cx(CARD, 'space-y-2.5')}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-40">
                <h2 id="song-speed" className="m-0 text-base font-bold">
                  排练速度
                </h2>
                <p className="m-0 text-xs text-muted-foreground">
                  {speedMode === 'set'
                    ? `全队都用 ${speedValue}% 练这首歌（${SPEED_MIN}–${SPEED_MAX}%）。`
                    : '每个人自己决定练习速度。'}
                </p>
              </div>
              <Seg<Speed>
                label="排练速度"
                value={speedMode}
                onChange={changeSpeedMode}
                options={SPEED_OPTIONS}
              />
            </div>
            {speedMode === 'set' && (
              <div className="inline-flex items-center gap-1" role="group" aria-label="速度">
                <button
                  type="button"
                  aria-label="慢一点"
                  disabled={busy !== null || speedValue <= SPEED_MIN}
                  onClick={() => setSpeed(clamp(speedValue - SPEED_STEP))}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-border text-lg transition-colors hover:border-foreground disabled:opacity-40"
                >
                  <span aria-hidden>−</span>
                </button>
                <span className="mono w-16 text-center text-lg font-semibold tabular-nums">
                  {speedValue}%
                </span>
                <button
                  type="button"
                  aria-label="快一点"
                  disabled={busy !== null || speedValue >= SPEED_MAX}
                  onClick={() => setSpeed(clamp(speedValue + SPEED_STEP))}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-border text-lg transition-colors hover:border-foreground disabled:opacity-40"
                >
                  <span aria-hidden>+</span>
                </button>
              </div>
            )}
          </section>

          <section
            aria-labelledby="song-status"
            className={cx(CARD, 'flex flex-wrap items-center gap-3')}
          >
            <h2 id="song-status" className="m-0 min-w-0 flex-1 text-base font-bold">
              状态
            </h2>
            <Seg<SongStatus>
              label="状态"
              value={song.status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
            />
          </section>

          {/* which score the band rehearses: the setlist file, or a 组合乐队谱 of the song */}
          <section aria-labelledby="song-score" className={cx(CARD, 'space-y-2.5')}>
            <h2 id="song-score" className="m-0 text-base font-bold">
              排练用的谱
            </h2>
            <select
              aria-labelledby="song-score"
              className={cx(SELECT, 'w-full bg-card')}
              value={comboId ?? ''}
              disabled={busy !== null}
              onChange={(e) => {
                const v = e.target.value || null
                void run('combo', () => updateSong({ id: song.id, comboId: v, parts: {} }))
              }}
            >
              <option value="">歌单里的原谱</option>
              {combos.map((c) => (
                <option key={c.id} value={c.id}>
                  组合乐队谱：{c.parts.map((p) => p.name).join(' + ')}
                </option>
              ))}
            </select>
            <p className="m-0 text-xs text-muted-foreground">
              换谱后声部要重新分配。
              <a
                className="ml-1 inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
                href={hrefCombine(song.path, comboId ?? undefined)}
              >
                {comboId ? '编辑这个组合 →' : '从不同版本组合一份乐队谱 →'}
              </a>
            </p>
          </section>

          <section aria-labelledby="song-sheets" className="space-y-3 pt-2">
            <h2 id="song-sheets" className={SECTION_TITLE}>
              主唱简谱
            </h2>
            <div className={CARD}>
              <SheetsPanel path={song.path} />
            </div>
          </section>

          <section aria-labelledby="song-own" className="space-y-3 pt-2">
            <h2 id="song-own" className={SECTION_TITLE}>
              自己上传的谱
            </h2>
            <div className={CARD}>
              <OwnFiles song={song} />
            </div>
          </section>

          <section aria-labelledby="song-practice" className="space-y-3 pt-2">
            <h2 id="song-practice" className={SECTION_TITLE}>
              练习进度
            </h2>
            <ul className={cx('m-0 list-none p-0', LIST)}>
              {state.members.map((m) => {
                const p = progress.find((x) => x.userId === m.id)
                return (
                  <li key={m.id} className={LIST_ROW}>
                    <Avatar name={m.displayName} />
                    <span className="min-w-0 flex-1">
                      <b className="block break-words text-sm font-medium">{m.displayName}</b>
                      <span className="mono block text-xs tabular-nums text-muted-foreground">
                        {p ? (
                          <>
                            练了 {fmtDuration(p.totalSeconds)} · 最高速度{' '}
                            {p.maxSpeedPct ? `${p.maxSpeedPct}%` : '—'} · 最近{' '}
                            {new Date(p.lastAt).toLocaleDateString('zh-CN')}
                          </>
                        ) : (
                          '还没练过'
                        )}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-label="从歌单删除" className="pt-2">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-destructive bg-card p-4">
                <p className="m-0 flex-1 basis-56 text-sm leading-relaxed">
                  从歌单删除《{song.title}》？这首歌的声部分配和备注会一起删除，谱子文件不受影响。
                </p>
                <button
                  type="button"
                  onClick={doDelete}
                  disabled={busy !== null}
                  className="inline-flex min-h-11 items-center rounded-lg bg-destructive px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  确认删除
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={buttonClass('ghost')}
                >
                  取消
                </button>
              </div>
            ) : (
              <div className={LIST}>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className={cx(LIST_ROW, 'w-full text-left text-sm text-destructive')}
                >
                  <span className="flex-1">从歌单删除这首歌</span>
                  <span aria-hidden className="text-lg text-muted-foreground">
                    ›
                  </span>
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
