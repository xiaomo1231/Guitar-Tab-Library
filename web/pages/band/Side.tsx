import { useState } from 'react'
import type { BandActivity, RehearsalSession } from '@/songs/scoreServerTypes'
import type { BandSong } from '../../lib/api'
import { activityText, relativeTime } from '../../lib/activity'
import { CARD, cx } from '../../lib/classes'
import { hrefBandSong } from '../../lib/route'
import { Link } from '../../components/Link'
import { CardHead } from './CardHead'
import { TEXT_ACTION } from './shared'

/** How many 动态 rows show before 「看更多」. */
const ACTIVITY_SHOWN = 8

/** 最近动态: practice, 小节标记 and rehearsals of the band, written by the server (nobody types it). */
export function ActivitySection({
  activity,
  songs,
  nameOf,
}: {
  activity: BandActivity[] | undefined
  songs: BandSong[]
  nameOf: (id: string) => string
}) {
  const [all, setAll] = useState(false)
  // A server from before the 动态 sends no list.
  const list = activity ?? []
  if (list.length === 0) return null
  const shown = all ? list : list.slice(0, ACTIVITY_SHOWN)
  const titleOf = (id: string) => songs.find((s) => s.id === id)?.title || '未识别的曲名'
  const now = Date.now()
  return (
    <section aria-labelledby="band-activity" className={cx(CARD, 'pb-2')}>
      <CardHead id="band-activity" title="最近动态" />
      <ul className="m-0 flex list-none flex-col gap-3 p-0 pt-3 text-sm">
        {shown.map((item, i) => {
          const line = activityText(item, { userName: nameOf, songTitle: titleOf })
          return (
            <li key={`${item.type}:${item.at}:${i}`} className="leading-snug">
              {line.songId ? (
                <Link
                  href={hrefBandSong(line.songId)}
                  className="break-words transition-colors hover:text-primary"
                >
                  {line.text}
                </Link>
              ) : (
                <span className="break-words">{line.text}</span>
              )}
              <span className="block text-xs text-muted-foreground">{relativeTime(item.at, now)}</span>
            </li>
          )
        })}
      </ul>
      {list.length > ACTIVITY_SHOWN ? (
        <button type="button" className={TEXT_ACTION} onClick={() => setAll((v) => !v)}>
          {all ? '收起' : '看更多'}
        </button>
      ) : (
        <div className="h-2" />
      )}
    </section>
  )
}

/** 排练记录: what the last rehearsals did, written down by the server (nobody types it). */
export function SessionsSection({ sessions }: { sessions: RehearsalSession[] }) {
  const [all, setAll] = useState(false)
  if (sessions.length === 0) return null
  const shown = all ? sessions : sessions.slice(0, 2)
  const minutes = (ms: number) => {
    const m = Math.round(ms / 60000)
    return m < 1 ? '不到 1 分钟' : `${m} 分钟`
  }
  const day = (at: number) => {
    const d = new Date(at)
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
  }
  return (
    <section aria-labelledby="band-sessions" className={cx(CARD, 'pb-2')}>
      <CardHead id="band-sessions" title="排练记录" />
      <p className="m-0 pt-0.5 text-xs text-muted-foreground">每次排练结束后自动生成。</p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 pt-3">
        {shown.map((s) => (
          <li key={s.startedAt} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <div className="text-sm font-bold">
              {day(s.startedAt)} · 排了 {s.songs.length} 首 · 共 {minutes(s.endedAt - s.startedAt)}
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 pt-1.5 text-[13px]">
              {s.songs.map((x) => (
                <li key={x.songId} className="leading-snug">
                  <span>{x.title}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {x.starts} 遍 · {minutes(x.playMs)}
                  </span>
                  {x.hotBars.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      难点：
                      {x.hotBars.map((h) => `第 ${h.bar} 小节（重来 ${h.count} 次）`).join('、')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {sessions.length > 2 ? (
        <button type="button" className={TEXT_ACTION} onClick={() => setAll((v) => !v)}>
          {all ? '只看最近两次' : `看全部 ${sessions.length} 次`}
        </button>
      ) : (
        <div className="h-2" />
      )}
    </section>
  )
}
