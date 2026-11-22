import type { ReactNode } from 'react'
import type { UserInfo } from '../../lib/api'
import { cx } from '../../lib/classes'
import { INSTRUMENT_LABELS } from '../../lib/session'
import { Avatar } from '../../components/ui'

/** One member chip in a part's picker: avatar and name, the pen when chosen. */
function Chip({
  on,
  disabled,
  onClick,
  title,
  children,
}: {
  on: boolean
  disabled: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-3 text-[13px] transition-colors disabled:opacity-50',
        on
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** One track of the song: its name, who plays it (member chips) and what the 音箱 does today. */
export function PartCard({
  label,
  value,
  members,
  meId,
  disabled,
  reason,
  onPick,
}: {
  label: { zh: string; original: string }
  /** The chosen member id, '' for nobody. */
  value: string
  members: UserInfo[]
  meId: string | null
  disabled: boolean
  /** The 补位 plan's line for this track, when it has one. */
  reason: string | null
  onPick: (userId: string) => void
}) {
  const player = members.find((m) => m.id === value) ?? null
  const stale = value !== '' && !player
  const mine = meId !== null && value === meId

  return (
    <li
      className={cx(
        'rounded-[14px] border bg-card p-4',
        mine ? 'border-primary' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="m-0 break-words text-base font-bold">{label.zh}</p>
          {label.original && label.original !== label.zh && (
            <p className="mono m-0 break-words text-xs text-muted-foreground">{label.original}</p>
          )}
        </div>
        <span
          className={cx(
            'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 text-xs leading-[22px]',
            mine
              ? 'border-primary text-primary'
              : value
                ? 'border-border text-muted-foreground'
                : 'border-dashed border-border text-muted-foreground',
          )}
        >
          {mine ? '我的声部' : player ? player.displayName : stale ? '已离开的成员' : '未分配'}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label={`${label.zh} 由谁演奏`}
        className="mt-3 flex flex-wrap gap-2"
      >
        {members.map((m) => (
          <Chip
            key={m.id}
            on={value === m.id}
            disabled={disabled}
            onClick={() => onPick(m.id)}
            title={m.instrument ? INSTRUMENT_LABELS[m.instrument] : '未设乐器'}
          >
            <Avatar name={m.displayName} size={22} />
            <span className="min-w-0 truncate">
              {m.displayName}
              {meId === m.id ? '（我）' : ''}
            </span>
            <span className="text-[11px] opacity-70">
              {m.instrument ? INSTRUMENT_LABELS[m.instrument] : '未设乐器'}
            </span>
          </Chip>
        ))}
        {stale && (
          <Chip on disabled={disabled} onClick={() => onPick(value)}>
            已离开的成员
          </Chip>
        )}
        <Chip on={value === ''} disabled={disabled} onClick={() => onPick('')}>
          没人
        </Chip>
      </div>

      {reason && <p className="m-0 mt-3 text-xs text-muted-foreground">{reason}</p>}
    </li>
  )
}
