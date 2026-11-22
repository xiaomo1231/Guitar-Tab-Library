/**
 * 乐队动态 as words: the sentence for one item of BandState.activity, how long ago it was,
 * and which bars were marked 「这里我改了」 since a given time. Pure (no React, no fetch).
 */
import type { BandActivity, BarComment, MarkKind } from './api'

export const MARK_KINDS: readonly MarkKind[] = ['changed', 'problem', 'note']

export const MARK_LABEL: Record<MarkKind, string> = {
  changed: '这里我改了',
  problem: '这里有问题',
  note: '这里注意',
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Local midnight of the day `at` falls on. */
const dayStart = (at: number) => {
  const d = new Date(at)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / M 月 D 日 (calendar days from 24 hours on). */
export function relativeTime(at: number, now: number): string {
  const diff = now - at
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} 小时前`
  // Round: a day with a DST change is 23 or 25 hours long.
  const days = Math.round((dayStart(now) - dayStart(at)) / (24 * HOUR))
  if (days <= 1) return '昨天'
  if (days < 30) return `${days} 天前`
  const d = new Date(at)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** "不到 1 分钟" / "N 分钟" (rounded). */
export function minutesText(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m < 1 ? '不到 1 分钟' : `${m} 分钟`
}

const barsText = (from: number, to: number) => (from === to ? `第 ${from} 小节` : `第 ${from}–${to} 小节`)

export interface ActivityNames {
  userName: (id: string) => string
  songTitle: (id: string) => string
}

/** One 动态 row: the sentence, and the band song it is about (to link to), if any. */
export interface ActivityLine {
  text: string
  songId: string | null
}

export function activityText(item: BandActivity, names: ActivityNames): ActivityLine {
  switch (item.type) {
    case 'practice': {
      let text = `${names.userName(item.userId)} 练了《${names.songTitle(item.songId)}》${minutesText(item.seconds)}`
      if (item.maxSpeedPct > 0) text += `，最高 ${item.maxSpeedPct}% 速度`
      if (item.loopBars) text += `，反复练${barsText(item.loopBars[0], item.loopBars[1])}`
      return { text, songId: item.songId }
    }
    case 'mark': {
      const head = `${names.userName(item.userId)} 在《${names.songTitle(item.songId)}》第 ${item.bar} 小节`
      const text =
        item.kind === null
          ? item.text
            ? `${head}留言：${item.text}`
            : `${head}留了一段语音`
          : `${head}标记「${MARK_LABEL[item.kind]}」${item.text ? `：${item.text}` : ''}`
      return { text, songId: item.songId }
    }
    case 'session': {
      const s = item.session
      let text = `排练：排了 ${s.songs.length} 首，共 ${minutesText((s.endedAt - s.startedAt) / 1000)}`
      // The single bar the band went back to most often (the first one on a tie).
      let hot: { title: string; bar: number; count: number } | null = null
      for (const song of s.songs)
        for (const h of song.hotBars)
          if (!hot || h.count > hot.count) hot = { title: song.title, bar: h.bar, count: h.count }
      if (hot) text += `，《${hot.title}》第 ${hot.bar} 小节重来了 ${hot.count} 次`
      return { text, songId: null }
    }
  }
}

/** Bars (sorted, each once) with a 「这里我改了」 mark made after `since`. */
export function changedSince(comments: readonly BarComment[], since: number): number[] {
  const bars = new Set<number>()
  for (const c of comments) if (c.kind === 'changed' && c.at > since) bars.add(c.bar)
  return [...bars].sort((a, b) => a - b)
}
