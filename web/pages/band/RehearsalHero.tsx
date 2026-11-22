import { useState, type ReactNode } from 'react'
import { errorText, type BandSong, type BandState } from '../../lib/api'
import { setSetlist } from '../../lib/band'
import { cx, CTA, SELECT } from '../../lib/classes'
import { useRehearsal } from '../../lib/rehearsal'
import { openInRehearsal } from '../../lib/rehearsalNav'
import { Avatar, Notice } from '../../components/ui'
import { ICON_BUTTON, SMALL_BUTTON, swapped } from './shared'

const HERO =
  'flex flex-col gap-3.5 rounded-2xl border bg-card bg-gradient-to-br from-primary/10 via-transparent to-transparent p-4 min-[861px]:p-[18px]'

/** One numbered row of today's setlist inside the hero. */
function SetlistItem({ n, song, tools }: { n: number; song: BandSong; tools?: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-border bg-background py-1 pl-3 pr-1">
      <span className="mono w-5 shrink-0 text-[13px] font-bold text-muted-foreground">{n}</span>
      <span className="min-w-0 flex-1 py-1">
        <b className="block break-words text-[15px] font-bold leading-snug">
          {song.title || '未识别的曲名'}
        </b>
        {song.artist && (
          <span className="block truncate text-xs text-muted-foreground">{song.artist}</span>
        )}
      </span>
      {tools}
    </li>
  )
}

/**
 * 排练: today's setlist (edited while no rehearsal runs), starting the rehearsal, and
 * joining or ending the one that runs. Live through the rehearsal stream.
 */
export function RehearsalHero({
  band,
  meId,
  manager,
}: {
  band: BandState
  meId: string | null
  /** The band's leader (队长) or an admin: only they start a rehearsal. */
  manager: boolean
}) {
  const rh = useRehearsal()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [addId, setAddId] = useState('')
  const [editing, setEditing] = useState(false)

  const songById = new Map<string, BandSong>(band.songs.map((s) => [s.id, s]))
  // Unknown ids (songs since removed from the band) are left out of the list.
  const setlist = band.rehearsalSetlist
    .map((id) => songById.get(id))
    .filter((s): s is BandSong => s !== undefined)
  const ids = setlist.map((s) => s.id)
  const inSetlist = new Set(ids)
  const addable = band.songs.filter((s) => !inSetlist.has(s.id))
  const nameOf = (id: string) =>
    band.members.find((m) => m.id === id)?.displayName ?? '已离开的成员'

  const state = rh.state
  const active = state?.active === true
  const currentId = state?.songId ?? null
  const current = currentId ? (songById.get(currentId) ?? null) : null
  const position = currentId ? band.rehearsalSetlist.indexOf(currentId) : -1
  const speaker = state?.speakerDevice
    ? state.devices.find((d) => d.deviceId === state.speakerDevice)
    : undefined
  const leaderPresent = state ? state.devices.some((d) => d.userId === state.leaderId) : false
  const canEnd = active && (state?.leaderId === meId || !leaderPresent)
  const presentIds = state ? [...new Set(state.devices.map((d) => d.userId))] : []
  const present = presentIds.map(nameOf).join('、')

  const saveSetlist = async (next: string[], key: string) => {
    if (busy) return
    setBusy(key)
    setNotice(null)
    try {
      await setSetlist(next)
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const start = async () => {
    const first = setlist[0]
    if (busy || !first) return
    setBusy('start')
    setNotice(null)
    try {
      await rh.send({ type: 'start', setlist: ids })
      await openInRehearsal(first)
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const join = async () => {
    if (!current) return
    setNotice(null)
    try {
      await openInRehearsal(current)
    } catch (e) {
      setNotice(errorText(e))
    }
  }

  const end = async () => {
    if (busy || !window.confirm('结束这次排练？')) return
    setBusy('end')
    setNotice(null)
    try {
      await rh.send({ type: 'end' })
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const move = (index: number, dir: -1 | 1) =>
    void saveSetlist(swapped(ids, index, index + dir), 'list')
  const remove = (index: number) =>
    void saveSetlist(
      ids.filter((_, i) => i !== index),
      'list',
    )
  const addOne = (id: string) => {
    setAddId('')
    if (id) void saveSetlist([...ids, id], 'list')
  }

  const message = notice ?? rh.error
  const status = !rh.connected && <p className="m-0 text-xs text-muted-foreground">实时连接中…</p>
  const errorBox = message && <Notice tone="error">{message}</Notice>

  if (active) {
    return (
      <section aria-labelledby="band-rehearsal" className={cx(HERO, 'border-primary')}>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-primary" />
          <h2 id="band-rehearsal" className="m-0 text-[15px] font-bold text-primary">
            排练进行中
          </h2>
          <span className="flex-1" />
          {presentIds.length > 0 && (
            <span className="flex -space-x-1.5" aria-hidden>
              {presentIds.slice(0, 6).map((id) => (
                <span key={id} className="rounded-full ring-2 ring-card">
                  <Avatar name={nameOf(id)} size={26} />
                </span>
              ))}
            </span>
          )}
          {status}
        </div>

        <p className="m-0 break-words font-display text-xl font-bold leading-snug">
          {current ? (
            <>
              {position >= 0 && `第 ${position + 1}/${band.rehearsalSetlist.length} 首`}
              {position >= 0 ? ' ' : ''}《{current.title || '未识别的曲名'}》
            </>
          ) : currentId ? (
            '（这首歌已从乐队移除）'
          ) : (
            '还没有选定曲目'
          )}
        </p>

        <dl className="m-0 grid gap-1 text-[13px]">
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">指挥：</dt>
            <dd className="m-0">{state?.leaderId ? nameOf(state.leaderId) : '暂无指挥'}</dd>
          </div>
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">音箱：</dt>
            <dd className="m-0">
              {speaker ? `${nameOf(speaker.userId)}（${speaker.label}）` : '还没有设备当音箱'}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">在场：</dt>
            <dd className="m-0 break-words">{present || '—'}</dd>
          </div>
        </dl>

        {errorBox}

        <button
          type="button"
          onClick={() => void join()}
          disabled={!current || busy !== null}
          className={CTA}
        >
          加入排练
        </button>
        {canEnd && (
          <button
            type="button"
            onClick={() => void end()}
            disabled={busy !== null}
            className="-mt-1.5 inline-flex min-h-11 items-center justify-center self-center rounded-lg px-4 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {busy === 'end' ? '结束中…' : '结束排练'}
          </button>
        )}

        <details className="group border-t border-border pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[13px] font-bold text-muted-foreground [&::-webkit-details-marker]:hidden">
            <span className="flex-1">今天的排练歌单（{setlist.length} 首）</span>
            <span aria-hidden className="transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          {setlist.length === 0 ? (
            <p className="m-0 pt-1 text-sm text-muted-foreground">今天还没有选歌。</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0 pt-1">
              {setlist.map((song, i) => (
                <SetlistItem key={song.id} n={i + 1} song={song} />
              ))}
            </ol>
          )}
        </details>
      </section>
    )
  }

  const showTools = editing || setlist.length === 0

  return (
    <section aria-labelledby="band-rehearsal" className={cx(HERO, 'border-border')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="band-rehearsal" className="m-0 text-[17px] font-bold leading-snug">
            {setlist.length > 0 ? `今天排 ${setlist.length} 首` : '今天排练哪些歌'}
          </h2>
          <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">
            {setlist.length > 0 ? '按顺序排练，开始后大家的谱一起翻页。' : '先选好今天要排的歌。'}
          </p>
          {status}
        </div>
        {setlist.length > 0 && (
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
            className={cx(SMALL_BUTTON, editing && 'border-primary text-primary')}
          >
            {editing ? '完成' : '编辑歌单'}
          </button>
        )}
      </div>

      {errorBox}

      {setlist.length === 0 ? (
        <Notice>
          {band.songs.length > 0
            ? '还没有选歌。可以全部加入，或从下面挑。'
            : '歌单还是空的，先在下面添加歌曲。'}
        </Notice>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {setlist.map((song, i) => (
            <SetlistItem
              key={song.id}
              n={i + 1}
              song={song}
              tools={
                editing && (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={`上移：${song.title}`}
                      title="上移"
                      disabled={busy !== null || i <= 0}
                      onClick={() => move(i, -1)}
                      className={ICON_BUTTON}
                    >
                      <span aria-hidden>↑</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`下移：${song.title}`}
                      title="下移"
                      disabled={busy !== null || i >= setlist.length - 1}
                      onClick={() => move(i, 1)}
                      className={ICON_BUTTON}
                    >
                      <span aria-hidden>↓</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`从今天的排练中移除：${song.title}`}
                      title="移除"
                      disabled={busy !== null}
                      onClick={() => remove(i)}
                      className={ICON_BUTTON}
                    >
                      <span aria-hidden>✕</span>
                    </button>
                  </span>
                )
              }
            />
          ))}
        </ol>
      )}

      {showTools &&
        (setlist.length === 0 && band.songs.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              void saveSetlist(
                band.songs.map((s) => s.id),
                'all',
              )
            }
            disabled={busy !== null}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-dashed border-border px-4 text-sm font-medium text-primary transition-colors hover:border-primary disabled:opacity-50"
          >
            {busy === 'all' ? '加入中…' : '全部加入'}
          </button>
        ) : (
          addable.length > 0 && (
            <div>
              <label className="sr-only" htmlFor="rehearsal-add">
                加一首歌到今天的排练
              </label>
              <select
                id="rehearsal-add"
                value={addId}
                disabled={busy !== null}
                onChange={(e) => addOne(e.target.value)}
                className={cx(SELECT, 'w-full bg-background text-base disabled:opacity-50')}
              >
                <option value="">＋ 加一首…</option>
                {addable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || '未识别的曲名'}
                    {s.artist ? ` · ${s.artist}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )
        ))}

      <div>
        <button
          type="button"
          onClick={() => void start()}
          disabled={!manager || setlist.length === 0 || busy !== null}
          className={CTA}
        >
          {busy === 'start' ? '开始中…' : '开始排练'}
        </button>
        {!manager && (
          <p className="m-0 pt-2 text-center text-xs text-muted-foreground">
            排练由队长开始。开始后这里会出现「加入排练」。
          </p>
        )}
      </div>

      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="transition-transform group-open:rotate-90">
            ›
          </span>
          排练时谁出声？
        </summary>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          排练时，一台设备当「音箱」接排练室的音箱，负责放缺席成员的声部（比如缺鼓手就放鼓）；其他人的手机/平板不出声，只看自己的谱，光标和翻页跟着走。
        </p>
      </details>
    </section>
  )
}
