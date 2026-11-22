// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RehearsalLoop, RehearsalSession, RehearsalState } from '../src/songs/scoreServerTypes'
import { freshRehearsal } from '../server/rehearsal'
import {
  HOT_BAR_STARTS,
  MAX_HOT_BARS,
  MAX_SESSIONS,
  SessionLog,
  SessionTracker,
  sanitizeSessions,
} from '../server/rehearsalLog'

const idle = (): RehearsalState => freshRehearsal()
const active = (over: Partial<RehearsalState> = {}): RehearsalState => ({ ...freshRehearsal(), active: true, ...over })
const playing = (songId: string, startAt: number, over: Partial<RehearsalState> = {}) =>
  active({ songId, playing: true, startAt, ...over })

const loop = (over: Partial<RehearsalLoop> = {}): RehearsalLoop => ({
  startTick: 0,
  endTick: 960,
  startBar: 7,
  endBar: 8,
  passes: null,
  rampPct: 0,
  rampMaxPct: 175,
  ...over,
})

/** Feeds a list of [state, now, bar] steps (starting from an idle room) and returns every result. */
function feed(tracker: SessionTracker, steps: [RehearsalState, number, (number | null)?][]) {
  let prev = idle()
  const out: (RehearsalSession | null)[] = []
  for (const [next, now, bar] of steps) {
    out.push(tracker.observe(prev, next, now, bar ?? null))
    prev = next
  }
  return out
}

describe('SessionTracker', () => {
  it('returns the summary only on the change that ends the rehearsal', () => {
    const t = new SessionTracker()
    const out = feed(t, [
      [active({ songId: 's1' }), 100],
      [playing('s1', 600), 100, 5],
      [active({ songId: 's1', tick: 50 }), 1600],
      [idle(), 2000],
    ])
    expect(out.slice(0, 3)).toEqual([null, null, null])
    expect(out[3]).toEqual({
      startedAt: 100,
      endedAt: 2000,
      songs: [{ songId: 's1', title: '', playMs: 1000, starts: 1, hotBars: [] }],
    })
  })

  it('returns null for a rehearsal in which nothing was played', () => {
    const t = new SessionTracker()
    const out = feed(t, [
      [active({ songId: 's1' }), 0],
      [active({ songId: 's2' }), 10],
      [idle(), 20],
    ])
    expect(out).toEqual([null, null, null])
  })

  it('ignores changes while no rehearsal is active', () => {
    const t = new SessionTracker()
    expect(t.observe(idle(), { ...idle(), seq: 3 }, 5, null)).toBeNull()
    expect(t.observe(idle(), { ...idle(), playing: true, songId: 's1' }, 5, 4)).toBeNull()
  })

  it('counts play time from when the run begins sounding, and counts a run ended by the end of the rehearsal', () => {
    const t = new SessionTracker()
    const out = feed(t, [
      [active({ songId: 's1' }), 0],
      // Starts sounding at 1500 (count-in delay).
      [playing('s1', 1500), 1000],
      // Rehearsal ends while playing.
      [idle(), 4500],
    ])
    expect(out[2]?.songs[0]).toMatchObject({ songId: 's1', playMs: 3000, starts: 1 })
  })

  it('uses now when startAt is already in the past, and never counts negative time', () => {
    const t = new SessionTracker()
    const out = feed(t, [
      [active({ songId: 's1' }), 0],
      [playing('s1', 100), 1000],
      [active({ songId: 's1' }), 1400],
      // Paused before it began sounding.
      [playing('s1', 3000), 2000],
      [active({ songId: 's1' }), 2500],
      [idle(), 3000],
    ])
    expect(out[5]?.songs[0]).toMatchObject({ playMs: 400, starts: 2 })
  })

  it('device-only changes during a run are not a new start', () => {
    const t = new SessionTracker()
    const run = playing('s1', 500)
    const out = feed(t, [
      [active({ songId: 's1' }), 0],
      [run, 0, 5],
      [{ ...run, seq: 9, devices: [{ deviceId: 'd', userId: 'u', label: 'x', ready: true, audible: true, latencyMs: 0, driftMs: null, connected: true }] }, 700],
      [{ ...run, speedPct: 120, clock: { seq: 1, pass: 1, timeMs: 10, at: 800 } }, 800],
      [active({ songId: 's1' }), 1500],
      [idle(), 2000],
    ])
    expect(out[5]?.songs).toEqual([{ songId: 's1', title: '', playMs: 1000, starts: 1, hotBars: [] }])
  })

  it('a restart (new startAt), a new pass or a song change is a new start and ends the run before', () => {
    const t = new SessionTracker()
    const out = feed(t, [
      [active({ songId: 's1' }), 0],
      [playing('s1', 0), 0, 3],
      // Seek while playing: new startAt.
      [playing('s1', 1000), 500, 3],
      // Next pass of a loop.
      [playing('s1', 2000, { pass: 2, loop: loop() }), 1500],
      // Song change while still playing.
      [playing('s2', 3000), 2500, 1],
      [idle(), 4000],
    ])
    expect(out[5]?.songs).toEqual([
      // 0..500 + 1000..1500 + 2000..2500
      { songId: 's1', title: '', playMs: 1500, starts: 3, hotBars: [{ bar: 3, count: 2 }] },
      { songId: 's2', title: '', playMs: 1000, starts: 1, hotBars: [] },
    ])
  })

  it('a later loop pass tallies the loop start bar, not the command bar', () => {
    const t = new SessionTracker()
    const l = loop({ startBar: 7 })
    const out = feed(t, [
      [active({ songId: 's1', loop: l }), 0],
      [playing('s1', 0, { loop: l }), 0, 7],
      [playing('s1', 100, { loop: l, pass: 2 }), 100, 99],
      [playing('s1', 200, { loop: l, pass: 3 }), 200],
      [idle(), 300],
    ])
    expect(out[4]?.songs[0]).toMatchObject({ starts: 3, hotBars: [{ bar: 7, count: 3 }] })
  })

  it('hot bars: bars > 1 started from at least HOT_BAR_STARTS times, most frequent first, at most MAX_HOT_BARS', () => {
    expect(HOT_BAR_STARTS).toBe(2)
    expect(MAX_HOT_BARS).toBe(3)
    const t = new SessionTracker()
    // Bar -> how often it is started from.
    const plan: [number, number][] = [
      [1, 5],
      [9, 2],
      [4, 3],
      [12, 4],
      [20, 1],
      [2, 2],
    ]
    const steps: [RehearsalState, number, number?][] = [[active({ songId: 's1' }), 0]]
    let now = 0
    for (const [bar, n] of plan)
      for (let i = 0; i < n; i++) {
        now += 10
        steps.push([playing('s1', now), now, bar])
        steps.push([active({ songId: 's1' }), now + 5])
      }
    steps.push([idle(), now + 100])
    const out = feed(t, steps)
    const song = out[out.length - 1]?.songs[0]
    expect(song?.starts).toBe(17)
    // 12 (4), 4 (3), then the tie at 2 is broken by the lower bar: 2 before 9. Bar 1 and 20 are left out.
    expect(song?.hotBars).toEqual([
      { bar: 12, count: 4 },
      { bar: 4, count: 3 },
      { bar: 2, count: 2 },
    ])
  })

  it('does not tally a missing or out-of-range bar but still counts the start', () => {
    const t = new SessionTracker()
    const out = feed(t, [
      [active({ songId: 's1' }), 0],
      [playing('s1', 0), 0, null],
      [active({ songId: 's1' }), 10],
      [playing('s1', 20), 20, 0],
      [active({ songId: 's1' }), 30],
      [playing('s1', 40), 40, 2.5],
      [active({ songId: 's1' }), 50],
      [idle(), 60],
    ])
    expect(out[7]?.songs[0]).toMatchObject({ starts: 3, playMs: 30, hotBars: [] })
  })

  it('a new rehearsal starts from a clean slate', () => {
    const t = new SessionTracker()
    const first = feed(t, [
      [active({ songId: 's1' }), 0],
      [playing('s1', 0), 0, 5],
      [idle(), 100],
    ])
    expect(first[2]?.songs[0]).toMatchObject({ songId: 's1', starts: 1, playMs: 100 })
    const second = feed(t, [
      [active({ songId: 's2' }), 1000],
      [playing('s2', 1000), 1000, 5],
      [idle(), 1200],
    ])
    expect(second[2]).toEqual({
      startedAt: 1000,
      endedAt: 1200,
      songs: [{ songId: 's2', title: '', playMs: 200, starts: 1, hotBars: [] }],
    })
  })
})

const session = (n: number, over: Partial<RehearsalSession> = {}): RehearsalSession => ({
  startedAt: n * 1000,
  endedAt: n * 1000 + 500,
  songs: [{ songId: `s${n}`, title: `Song ${n}`, playMs: 400, starts: 2, hotBars: [{ bar: 5, count: 2 }] }],
  ...over,
})

describe('sanitizeSessions', () => {
  it('keeps well-formed sessions as they are', () => {
    const list = [session(1), session(2)]
    expect(sanitizeSessions(JSON.parse(JSON.stringify(list)))).toEqual(list)
  })

  it('returns [] for anything that is not a list', () => {
    expect(sanitizeSessions(null)).toEqual([])
    expect(sanitizeSessions({ startedAt: 1 })).toEqual([])
    expect(sanitizeSessions('x')).toEqual([])
  })

  it('drops malformed sessions and songs, and sessions left without songs', () => {
    const good = session(1)
    const raw = [
      null,
      7,
      { ...session(2), startedAt: -1 },
      { ...session(3), endedAt: 1.5 },
      { ...session(4), songs: 'nope' },
      { ...session(5), songs: [] },
      {
        ...session(6),
        songs: [
          null,
          { songId: 1, title: 't', playMs: 0, starts: 0, hotBars: [] },
          { songId: 'a', title: 't', playMs: -5, starts: 0, hotBars: [] },
          { songId: 'b', title: 't', playMs: 0, starts: 1, hotBars: null },
          { songId: 'ok', title: 'T', playMs: 3, starts: 1, hotBars: [{ bar: 'x', count: 2 }, null, { bar: 4, count: 2 }] },
        ],
      },
      good,
    ]
    expect(sanitizeSessions(raw)).toEqual([
      { ...session(6), songs: [{ songId: 'ok', title: 'T', playMs: 3, starts: 1, hotBars: [{ bar: 4, count: 2 }] }] },
      good,
    ])
  })

  it('keeps only the newest MAX_SESSIONS', () => {
    const list = Array.from({ length: MAX_SESSIONS + 5 }, (_, i) => session(i + 1))
    const out = sanitizeSessions(list)
    expect(out).toHaveLength(MAX_SESSIONS)
    expect(out[0]).toEqual(session(6))
    expect(out[out.length - 1]).toEqual(session(MAX_SESSIONS + 5))
  })
})

describe('SessionLog', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearsal-log-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('names the file after the band', () => {
    expect(SessionLog.fileOf(dir, 'b1')).toBe(path.join(dir, 'b1.sessions.json'))
  })

  it('starts empty without a file, adds sessions oldest first, and a new instance reads them back', async () => {
    const file = SessionLog.fileOf(path.join(dir, 'nested'), 'b1')
    const log = new SessionLog(file)
    expect(log.sessions()).toEqual([])
    await log.add(session(1))
    await log.add(session(2))
    expect(log.sessions()).toEqual([session(1), session(2)])
    expect(new SessionLog(file).sessions()).toEqual([session(1), session(2)])
  })

  it('sessions() returns a copy', async () => {
    const log = new SessionLog(SessionLog.fileOf(dir, 'b1'))
    await log.add(session(1))
    log.sessions().pop()
    expect(log.sessions()).toHaveLength(1)
  })

  it('writes in order when adds are not awaited one by one', async () => {
    const file = SessionLog.fileOf(dir, 'b1')
    const log = new SessionLog(file)
    await Promise.all([log.add(session(1)), log.add(session(2)), log.add(session(3))])
    expect(new SessionLog(file).sessions().map((s) => s.startedAt)).toEqual([1000, 2000, 3000])
  })

  it('keeps at most MAX_SESSIONS, dropping the oldest', async () => {
    const file = SessionLog.fileOf(dir, 'b1')
    const log = new SessionLog(file)
    for (let i = 1; i <= MAX_SESSIONS + 2; i++) await log.add(session(i))
    expect(log.sessions()).toHaveLength(MAX_SESSIONS)
    expect(log.sessions()[0]).toEqual(session(3))
    const again = new SessionLog(file).sessions()
    expect(again).toHaveLength(MAX_SESSIONS)
    expect(again[again.length - 1]).toEqual(session(MAX_SESSIONS + 2))
  })

  it('a damaged file starts empty', () => {
    const file = SessionLog.fileOf(dir, 'b1')
    fs.writeFileSync(file, '{not json')
    expect(new SessionLog(file).sessions()).toEqual([])
  })

  it('remove() deletes the file and empties the log', async () => {
    const file = SessionLog.fileOf(dir, 'b1')
    const log = new SessionLog(file)
    await log.add(session(1))
    expect(fs.existsSync(file)).toBe(true)
    await log.remove()
    expect(fs.existsSync(file)).toBe(false)
    expect(log.sessions()).toEqual([])
    expect(new SessionLog(file).sessions()).toEqual([])
    // Removing a log that has no file is fine.
    await expect(new SessionLog(SessionLog.fileOf(dir, 'none')).remove()).resolves.toBeUndefined()
  })
})
