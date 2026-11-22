/**
 * 排练记录: what a rehearsal did, written down by the server so nobody has to. A tracker
 * (pure) watches the room's state changes and, when the rehearsal ends, gives a summary:
 * which songs were played, how often and for how long, and the bars the band went back to
 * most. The log keeps the last summaries of a band in its own file.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { RehearsalSession, RehearsalSessionSong, RehearsalState } from '../src/songs/scoreServerTypes'
import { writeFileAtomic } from './util'

export const MAX_SESSIONS = 30
/** Bars listed per song (the ones started from most often). */
export const MAX_HOT_BARS = 3
/** A bar counts as one the band went back to from this many starts. */
export const HOT_BAR_STARTS = 2
const MAX_BAR = 100000
const MAX_SONGS = 50

interface SongTally {
  songId: string
  playMs: number
  starts: number
  bars: Map<number, number>
}

/** Watches one room. `observe` is called with every state change, in order. */
export class SessionTracker {
  private startedAt = 0
  private songs: SongTally[] = []
  /** Server time the current run began sounding, or null when nothing plays. */
  private runFrom: number | null = null
  private runSong: string | null = null

  /**
   * One state change. `bar` is the bar a play / seek command named (1-based), when it did.
   * Returns the summary when this change ended the rehearsal (null otherwise, and for a
   * rehearsal in which nothing was played).
   */
  observe(prev: RehearsalState, next: RehearsalState, now: number, bar: number | null): RehearsalSession | null {
    if (!prev.active && next.active) {
      this.startedAt = now
      this.songs = []
      this.runFrom = null
      this.runSong = null
    }
    if (!prev.active && !next.active) return null

    const sameRun =
      prev.playing &&
      next.playing &&
      next.active &&
      prev.songId === next.songId &&
      prev.startAt === next.startAt &&
      prev.pass === next.pass
    if (!sameRun) {
      // The run before (if any) is over: its time counts from when it began sounding.
      if (this.runFrom !== null && this.runSong !== null)
        this.tally(this.runSong).playMs += Math.max(0, now - this.runFrom)
      this.runFrom = null
      this.runSong = null
      if (next.active && next.playing && next.songId !== null) {
        const t = this.tally(next.songId)
        t.starts += 1
        // A later pass of a loop starts from the loop's first bar.
        const from = next.pass > 1 && next.loop ? next.loop.startBar : bar
        if (from !== null && Number.isInteger(from) && from >= 1 && from <= MAX_BAR)
          t.bars.set(from, (t.bars.get(from) ?? 0) + 1)
        this.runFrom = Math.max(now, next.startAt)
        this.runSong = next.songId
      }
    }

    if (prev.active && !next.active) {
      const songs = this.songs.filter((s) => s.starts > 0).map(summarize)
      const session: RehearsalSession = { startedAt: this.startedAt, endedAt: now, songs }
      this.songs = []
      return songs.length > 0 ? session : null
    }
    return null
  }

  private tally(songId: string): SongTally {
    let t = this.songs.find((s) => s.songId === songId)
    if (!t) {
      t = { songId, playMs: 0, starts: 0, bars: new Map() }
      this.songs.push(t)
    }
    return t
  }
}

function summarize(t: SongTally): RehearsalSessionSong {
  const hotBars = [...t.bars.entries()]
    // Bar 1 is where every song begins: going back to it says nothing.
    .filter(([bar, count]) => bar > 1 && count >= HOT_BAR_STARTS)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, MAX_HOT_BARS)
    .map(([bar, count]) => ({ bar, count }))
  return { songId: t.songId, title: '', playMs: Math.round(t.playMs), starts: t.starts, hotBars }
}

const isCount = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max

/** Keeps what is well-formed of a stored list (a damaged entry is dropped, not fatal). */
export function sanitizeSessions(raw: unknown): RehearsalSession[] {
  if (!Array.isArray(raw)) return []
  const out: RehearsalSession[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (!isCount(r.startedAt, Number.MAX_SAFE_INTEGER) || !isCount(r.endedAt, Number.MAX_SAFE_INTEGER)) continue
    if (!Array.isArray(r.songs)) continue
    const songs: RehearsalSessionSong[] = []
    for (const s of r.songs.slice(0, MAX_SONGS)) {
      if (!s || typeof s !== 'object') continue
      const q = s as Record<string, unknown>
      if (typeof q.songId !== 'string' || typeof q.title !== 'string') continue
      if (!isCount(q.playMs, 1e9) || !isCount(q.starts, 1e6) || !Array.isArray(q.hotBars)) continue
      const hotBars = q.hotBars
        .filter(
          (h): h is { bar: number; count: number } =>
            !!h && typeof h === 'object' && isCount((h as { bar: unknown }).bar, MAX_BAR) && isCount((h as { count: unknown }).count, 1e6),
        )
        .slice(0, MAX_HOT_BARS)
        .map((h) => ({ bar: h.bar, count: h.count }))
      songs.push({ songId: q.songId, title: q.title.slice(0, 300), playMs: q.playMs, starts: q.starts, hotBars })
    }
    if (songs.length > 0) out.push({ startedAt: r.startedAt, endedAt: r.endedAt, songs })
  }
  return out.slice(-MAX_SESSIONS)
}

/** The last rehearsals of one band, newest last, in `<dir>/<bandId>.sessions.json`. */
export class SessionLog {
  private list: RehearsalSession[]
  private writing: Promise<void> = Promise.resolve()

  /** Reads the (small) file at once: the band page shows it without waiting. */
  constructor(private readonly file: string) {
    try {
      this.list = sanitizeSessions(JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch {
      // No file yet, or a damaged one: the log starts empty (a convenience, not a record of value).
      this.list = []
    }
  }

  static fileOf(dir: string, bandId: string): string {
    return path.join(dir, `${bandId}.sessions.json`)
  }

  /** Oldest first. */
  sessions(): RehearsalSession[] {
    return [...this.list]
  }

  /** Adds a summary (one write at a time, in order). */
  add(session: RehearsalSession): Promise<void> {
    const run = this.writing.then(async () => {
      const next = [...this.list, session].slice(-MAX_SESSIONS)
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
      await writeFileAtomic(this.file, JSON.stringify(next))
      this.list = next
    })
    this.writing = run.catch(() => undefined)
    return run
  }

  /** Removes the band's log (the band was deleted). */
  async remove(): Promise<void> {
    await this.writing
    this.list = []
    await fs.promises.rm(this.file, { force: true })
  }
}
