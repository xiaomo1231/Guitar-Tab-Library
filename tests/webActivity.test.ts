import { describe, expect, it } from 'vitest'
import { activityText, changedSince, MARK_LABEL, minutesText, relativeTime } from '../web/lib/activity'
import type { BandActivity, BarComment, RehearsalSession } from '../web/lib/api'

// Thursday 19 Nov 2026, 15:00 local.
const NOW = new Date(2026, 10, 19, 15, 0).getTime()
const MIN = 60_000
const HOUR = 60 * MIN

const names = {
  userName: (id: string) => ({ u1: '小林', u2: '阿杰' })[id] ?? '成员',
  songTitle: (id: string) => ({ s1: '春日影', s2: '晴天' })[id] ?? '？',
}

const practice = (over: Partial<Extract<BandActivity, { type: 'practice' }>> = {}): BandActivity => ({
  type: 'practice',
  at: NOW,
  userId: 'u1',
  songId: 's1',
  seconds: 12 * 60,
  maxSpeedPct: 85,
  loopBars: null,
  ...over,
})

const mark = (over: Partial<Extract<BandActivity, { type: 'mark' }>> = {}): BandActivity => ({
  type: 'mark',
  at: NOW,
  userId: 'u2',
  songId: 's2',
  bar: 17,
  kind: 'changed',
  text: '',
  ...over,
})

const sessionItem = (session: RehearsalSession): BandActivity => ({ type: 'session', at: session.endedAt, session })

describe('MARK_LABEL', () => {
  it('names each kind', () => {
    expect(MARK_LABEL).toEqual({ changed: '这里我改了', problem: '这里有问题', note: '这里注意' })
  })
})

describe('relativeTime', () => {
  it('counts minutes and hours on the same day', () => {
    expect(relativeTime(NOW, NOW)).toBe('刚刚')
    expect(relativeTime(NOW - 59_999, NOW)).toBe('刚刚')
    expect(relativeTime(NOW + 5000, NOW)).toBe('刚刚')
    expect(relativeTime(NOW - MIN, NOW)).toBe('1 分钟前')
    expect(relativeTime(NOW - 59 * MIN, NOW)).toBe('59 分钟前')
    expect(relativeTime(NOW - HOUR, NOW)).toBe('1 小时前')
    expect(relativeTime(NOW - 23 * HOUR - 59 * MIN, NOW)).toBe('23 小时前')
  })

  it('says 昨天, then N 天前, then the date', () => {
    expect(relativeTime(NOW - 24 * HOUR, NOW)).toBe('昨天')
    // Monday 16 Nov 23:00 is three calendar days before Thursday afternoon.
    expect(relativeTime(new Date(2026, 10, 16, 23, 0).getTime(), NOW)).toBe('3 天前')
    expect(relativeTime(NOW - 29 * 24 * HOUR, NOW)).toBe('29 天前')
    expect(relativeTime(NOW - 30 * 24 * HOUR, NOW)).toBe('10 月 20 日')
    expect(relativeTime(new Date(2025, 0, 5, 9, 0).getTime(), NOW)).toBe('1 月 5 日')
  })
})

describe('minutesText', () => {
  it('rounds to minutes', () => {
    expect(minutesText(0)).toBe('不到 1 分钟')
    expect(minutesText(29)).toBe('不到 1 分钟')
    expect(minutesText(30)).toBe('1 分钟')
    expect(minutesText(12 * 60 + 20)).toBe('12 分钟')
  })
})

describe('activityText', () => {
  it('practice: time, top speed and the looped bars', () => {
    expect(activityText(practice(), names)).toEqual({ text: '小林 练了《春日影》12 分钟，最高 85% 速度', songId: 's1' })
    expect(activityText(practice({ maxSpeedPct: 0 }), names).text).toBe('小林 练了《春日影》12 分钟')
    expect(activityText(practice({ loopBars: [9, 12] }), names).text).toBe(
      '小林 练了《春日影》12 分钟，最高 85% 速度，反复练第 9–12 小节',
    )
    expect(activityText(practice({ maxSpeedPct: 0, loopBars: [9, 9] }), names).text).toBe(
      '小林 练了《春日影》12 分钟，反复练第 9 小节',
    )
  })

  it('mark: the kind, with words when there are any; a plain 留言', () => {
    expect(activityText(mark(), names)).toEqual({ text: '阿杰 在《晴天》第 17 小节标记「这里我改了」', songId: 's2' })
    expect(activityText(mark({ kind: 'problem', text: '和弦不对' }), names).text).toBe(
      '阿杰 在《晴天》第 17 小节标记「这里有问题」：和弦不对',
    )
    expect(activityText(mark({ kind: 'note' }), names).text).toBe('阿杰 在《晴天》第 17 小节标记「这里注意」')
    expect(activityText(mark({ kind: null, text: '一起停两拍' }), names).text).toBe(
      '阿杰 在《晴天》第 17 小节留言：一起停两拍',
    )
  })

  it('session: songs, minutes and the hottest bar across its songs', () => {
    const session: RehearsalSession = {
      startedAt: NOW - 95 * MIN,
      endedAt: NOW,
      songs: [
        { songId: 's1', title: '春日影', playMs: 10 * MIN, starts: 4, hotBars: [{ bar: 9, count: 3 }] },
        {
          songId: 's2',
          title: '晴天',
          playMs: 20 * MIN,
          starts: 6,
          hotBars: [
            { bar: 33, count: 5 },
            { bar: 12, count: 2 },
          ],
        },
        { songId: 'gone', title: '旧歌', playMs: MIN, starts: 1, hotBars: [] },
      ],
    }
    expect(activityText(sessionItem(session), names)).toEqual({
      text: '排练：排了 3 首，共 95 分钟，《晴天》第 33 小节重来了 5 次',
      songId: null,
    })
    const calm: RehearsalSession = {
      ...session,
      songs: session.songs.map((s) => ({ ...s, hotBars: [] })),
    }
    expect(activityText(sessionItem(calm), names).text).toBe('排练：排了 3 首，共 95 分钟')
    expect(activityText(sessionItem({ startedAt: NOW - 10_000, endedAt: NOW, songs: [] }), names).text).toBe(
      '排练：排了 0 首，共 不到 1 分钟',
    )
  })

  it('session: on a tie the first song wins', () => {
    const session: RehearsalSession = {
      startedAt: NOW - 30 * MIN,
      endedAt: NOW,
      songs: [
        { songId: 's1', title: '春日影', playMs: MIN, starts: 2, hotBars: [{ bar: 5, count: 4 }] },
        { songId: 's2', title: '晴天', playMs: MIN, starts: 2, hotBars: [{ bar: 7, count: 4 }] },
      ],
    }
    expect(activityText(sessionItem(session), names).text).toContain('《春日影》第 5 小节重来了 4 次')
  })
})

describe('changedSince', () => {
  const c = (bar: number, at: number, kind?: BarComment['kind']): BarComment => ({
    id: `${bar}-${at}`,
    bar,
    text: '',
    userId: 'u1',
    at,
    ...(kind ? { kind } : {}),
  })

  it("returns sorted unique bars of 'changed' marks after the time", () => {
    const comments = [
      c(12, 200, 'changed'),
      c(3, 300, 'changed'),
      c(12, 400, 'changed'),
      c(7, 100, 'changed'),
      c(8, 100, 'changed'),
      c(5, 500, 'problem'),
      c(6, 500, 'note'),
      c(9, 500),
    ]
    expect(changedSince(comments, 100)).toEqual([3, 12])
    expect(changedSince(comments, 0)).toEqual([3, 7, 8, 12])
    expect(changedSince(comments, 400)).toEqual([])
    expect(changedSince([], 0)).toEqual([])
  })
})
