import { useState } from 'react'
import { errorText, type BandState, type DailyMemberProgress } from '../../lib/api'
import { leaveBand, removeMember, setLeader } from '../../lib/band'
import { buttonClass, CARD, cx, LIST, PILL } from '../../lib/classes'
import { INSTRUMENT_LABELS } from '../../lib/session'
import { Avatar } from '../../components/ui'
import { CardHead } from './CardHead'
import { dailyLine, fmtSpace, TEXT_ACTION } from './shared'

/** 成员: who is in the band; the leader can take people out or hand over; anyone else can leave. */
export function MembersSection({
  band,
  meId,
  manager,
  daily,
}: {
  band: BandState
  meId: string | null
  manager: boolean
  daily: Map<string, DailyMemberProgress> | null
}) {
  const [managing, setManaging] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'leader' | 'leave'; id: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string) => band.members.find((m) => m.id === id)?.displayName ?? '这位成员'
  const imLeader = meId === band.leaderId

  const act = async () => {
    if (!confirm || busy) return
    setBusy(true)
    setError(null)
    try {
      if (confirm.kind === 'remove') await removeMember(confirm.id)
      else if (confirm.kind === 'leader') await setLeader(confirm.id)
      else if (meId) await leaveBand(meId)
      setConfirm(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const question =
    confirm?.kind === 'remove'
      ? `把「${nameOf(confirm.id)}」移出乐队？TA 分到的声部会空出来，留言保留。之后可以再发邀请码让 TA 回来。`
      : confirm?.kind === 'leader'
        ? `把队长交给「${nameOf(confirm.id)}」？交出去后你就是普通成员了，不能再邀请人或移出成员。`
        : `退出「${band.name}」？你在这个乐队分到的声部会空出来。之后要回来需要队长重新邀请。`

  const used = band.limits.storageBytes > 0 ? Math.min(1, band.storageUsed / band.limits.storageBytes) : 0

  return (
    <section aria-labelledby="band-members">
      <div className="mb-1.5">
        <CardHead
          id="band-members"
          title={
            <>
              成员
              <span className="mono ml-2 font-normal">
                {band.members.length} / {band.limits.maxMembers}
              </span>
            </>
          }
        >
          <span className="flex flex-wrap items-center gap-4">
            {manager && band.members.length > 1 && (
              <button
                type="button"
                aria-pressed={managing}
                onClick={() => {
                  setManaging((v) => !v)
                  setConfirm(null)
                }}
                className={TEXT_ACTION}
              >
                {managing ? '完成' : '管理成员'}
              </button>
            )}
            {!imLeader && meId && band.members.some((m) => m.id === meId) && (
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'leave', id: meId })}
                className={cx(TEXT_ACTION, 'hover:text-destructive')}
              >
                退出乐队
              </button>
            )}
          </span>
        </CardHead>
      </div>

      <ul className={cx(LIST, 'm-0 list-none p-0')}>
        {band.members.map((m) => (
          <li
            key={m.id}
            className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3.5 py-2.5 first:border-t-0"
          >
            <Avatar name={m.displayName} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <b className="font-bold">
                  {m.displayName}
                  {meId === m.id && <span className="font-normal text-muted-foreground">（我）</span>}
                </b>
                {m.id === band.leaderId && <span className={cx(PILL, 'border-primary text-primary')}>队长</span>}
              </span>
              <span className="block text-[13px] text-muted-foreground">
                {m.instrument ? INSTRUMENT_LABELS[m.instrument] : '未设乐器'}
                {daily && ` · ${dailyLine(daily.get(m.id))}`}
              </span>
            </span>
            {managing && m.id !== band.leaderId && (
              <span className="flex shrink-0 gap-1.5 max-[480px]:w-full max-[480px]:justify-end">
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'remove', id: m.id })}
                  className={cx(buttonClass('outline'), 'px-3 text-[13px] hover:border-destructive hover:text-destructive')}
                >
                  移出
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'leader', id: m.id })}
                  className={cx(buttonClass('outline'), 'px-3 text-[13px]')}
                >
                  设为队长
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {confirm && (
        <div role="alertdialog" className={cx(CARD, 'mt-3 space-y-3', confirm.kind !== 'leader' && 'border-destructive')}>
          <p className="m-0 text-sm leading-relaxed">{question}</p>
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void act()}
              disabled={busy}
              className={cx(
                buttonClass(confirm.kind === 'leader' ? 'primary' : 'outline'),
                'px-4',
                confirm.kind !== 'leader' && 'border-destructive text-destructive hover:border-destructive',
              )}
            >
              {busy ? '正在保存…' : confirm.kind === 'remove' ? '移出' : confirm.kind === 'leader' ? '交给 TA' : '退出'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirm(null)
                setError(null)
              }}
              className={cx(buttonClass('ghost'), 'px-4')}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className={cx(CARD, 'mt-3 py-3')}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
          <span className="font-bold">上传空间</span>
          <span className="mono text-muted-foreground">
            已用 {fmtSpace(band.storageUsed)} / {fmtSpace(band.limits.storageBytes)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--raised))]" aria-hidden>
          <div
            className={cx('h-full rounded-full', used >= 0.9 ? 'bg-destructive' : 'bg-primary')}
            style={{ width: `${Math.round(used * 100)}%` }}
          />
        </div>
        <p className="m-0 mt-1.5 text-xs text-muted-foreground">自己上传的谱和排练录音</p>
      </div>
    </section>
  )
}
