/**
 * 乐队动态: what members did on their own, written down by the server so they do not have
 * to tell each other. The practice log keeps, per member and band song, how long a sitting
 * lasted, how fast it got and which bars were looped; `bandActivity` puts it together with
 * the 小节标记 and the 排练记录 as one list, newest first.
 */
import fs from 'node:fs'
import path from 'node:path'
import type {
  BandActivity,
  BandSong,
  PracticeSitting,
  RehearsalSession,
} from '../src/songs/scoreServerTypes'
import { writeFileAtomic } from './util'

export const MAX_SITTINGS = 400
/** Practice of the same song by the same member within this gap is one sitting. */
export const SITTING_GAP_MS = 3 * 60 * 60 * 1000
/** A sitting shorter than this is not worth telling the band. */
export const MIN_SITTING_SECONDS = 60
/** A looped range counts as "kept at it" from this many seconds. */
export const MIN_LOOP_SECONDS = 60
export const MAX_ACTIVITY = 40
const MAX_LOOPS = 12
const WRITE_DELAY_MS = 5000

const isCount = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
/** Seconds are kept with their fraction. */
const isAmount = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max

/** Adds practice time to the member's current sitting of the song, or starts a new one. Pure. */
export function addPractice(
  list: readonly PracticeSitting[],
  p: { userId: string; songId: string; seconds: number; speedPct: number | null; loopBars: [number, number] | null },
  now: number,
): PracticeSitting[] {
  if (p.seconds <= 0) return [...list]
  const at = list.findIndex(
    (s) => s.userId === p.userId && s.songId === p.songId && now - s.at < SITTING_GAP_MS,
  )
  const old: PracticeSitting =
    at >= 0
      ? list[at]!
      : { userId: p.userId, songId: p.songId, startedAt: now, at: now, seconds: 0, maxSpeedPct: 0, loops: [] }
  const loops = old.loops.map((l) => ({ ...l }))
  if (p.loopBars) {
    const [from, to] = p.loopBars
    const hit = loops.find((l) => l.from === from && l.to === to)
    if (hit) hit.seconds += p.seconds
    else if (loops.length < MAX_LOOPS) loops.push({ from, to, seconds: p.seconds })
  }
  const next: PracticeSitting = {
    ...old,
    at: now,
    // Kept exact (the page reports tenths of a second); rounded when shown.
    seconds: old.seconds + p.seconds,
    maxSpeedPct: p.speedPct !== null ? Math.max(old.maxSpeedPct, p.speedPct) : old.maxSpeedPct,
    loops,
  }
  const rest = list.filter((_, i) => i !== at)
  return [...rest, next].slice(-MAX_SITTINGS)
}

/** Keeps what is well-formed of a stored list. */
export function sanitizeSittings(raw: unknown): PracticeSitting[] {
  if (!Array.isArray(raw)) return []
  const out: PracticeSitting[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (typeof r.userId !== 'string' || !r.userId || typeof r.songId !== 'string' || !r.songId) continue
    if (!isCount(r.startedAt, Number.MAX_SAFE_INTEGER) || !isCount(r.at, Number.MAX_SAFE_INTEGER)) continue
    if (!isAmount(r.seconds, 1e7) || !isCount(r.maxSpeedPct, 175) || !Array.isArray(r.loops)) continue
    const loops = r.loops
      .filter((l): l is { from: number; to: number; seconds: number } => {
        if (!l || typeof l !== 'object') return false
        const q = l as Record<string, unknown>
        return isCount(q.from, 100000) && isCount(q.to, 100000) && q.from >= 1 && q.to >= q.from && isAmount(q.seconds, 1e7)
      })
      .slice(0, MAX_LOOPS)
      .map((l) => ({ from: l.from, to: l.to, seconds: l.seconds }))
    out.push({ userId: r.userId, songId: r.songId, startedAt: r.startedAt, at: r.at, seconds: r.seconds, maxSpeedPct: r.maxSpeedPct, loops })
  }
  return out.slice(-MAX_SITTINGS)
}

/**
 * The band's 动态, newest first: sittings long enough to matter (with the range looped the
 * longest, when one was kept at), every 小节标记 / 留言, and the rehearsals. Only current
 * members and songs still on the list are shown.
 */
export function bandActivity(
  songs: readonly BandSong[],
  sittings: readonly PracticeSitting[],
  sessions: readonly RehearsalSession[],
  memberIds: ReadonlySet<string>,
  limit = MAX_ACTIVITY,
): BandActivity[] {
  const songIds = new Set(songs.map((s) => s.id))
  const out: BandActivity[] = []
  for (const s of sittings) {
    if (s.seconds < MIN_SITTING_SECONDS || !memberIds.has(s.userId) || !songIds.has(s.songId)) continue
    const loop = [...s.loops].sort((a, b) => b.seconds - a.seconds)[0]
    out.push({
      type: 'practice',
      at: s.at,
      userId: s.userId,
      songId: s.songId,
      seconds: Math.round(s.seconds),
      maxSpeedPct: s.maxSpeedPct,
      loopBars: loop && loop.seconds >= MIN_LOOP_SECONDS ? [loop.from, loop.to] : null,
    })
  }
  for (const song of songs)
    for (const c of song.comments ?? [])
      if (memberIds.has(c.userId))
        out.push({
          type: 'mark',
          at: c.at,
          userId: c.userId,
          songId: song.id,
          bar: c.bar,
          kind: c.kind ?? null,
          text: c.text,
        })
  for (const session of sessions) out.push({ type: 'session', at: session.endedAt, session })
  return out.sort((a, b) => b.at - a.at).slice(0, limit)
}

/** The practice sittings of one band, in `<dir>/<bandId>.activity.json` (written a little later, in one go). */
export class ActivityLog {
  private list: PracticeSitting[]
  private timer: ReturnType<typeof setTimeout> | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly file: string) {
    try {
      this.list = sanitizeSittings(JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch {
      this.list = []
    }
  }

  static fileOf(dir: string, bandId: string): string {
    return path.join(dir, `${bandId}.activity.json`)
  }

  sittings(): PracticeSitting[] {
    return this.list
  }

  practice(p: Parameters<typeof addPractice>[1], now: number): void {
    this.list = addPractice(this.list, p, now)
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, WRITE_DELAY_MS)
    this.timer.unref()
  }

  /** Writes what is in memory now (also used at shutdown and in tests). */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const snapshot = JSON.stringify(this.list)
    const run = this.writing.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
      await writeFileAtomic(this.file, snapshot)
    })
    // A log that could not be written is tried again with the next practice.
    this.writing = run.catch(() => undefined)
    return this.writing
  }

  async remove(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    await this.writing
    this.list = []
    await fs.promises.rm(this.file, { force: true })
  }
}
