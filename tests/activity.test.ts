// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BandSong, BarComment, PracticeSitting, RehearsalSession } from '../src/songs/scoreServerTypes'
import {
  ActivityLog,
  MAX_ACTIVITY,
  MAX_SITTINGS,
  MIN_LOOP_SECONDS,
  MIN_SITTING_SECONDS,
  SITTING_GAP_MS,
  addPractice,
  bandActivity,
  sanitizeSittings,
} from '../server/activity'

const T0 = 1_800_000_000_000
const MIN = 60_000

type Practice = Parameters<typeof addPractice>[1]
const p = (over: Partial<Practice> = {}): Practice => ({
  userId: 'u1',
  songId: 's1',
  seconds: 30,
  speedPct: null,
  loopBars: null,
  ...over,
})

const sitting = (over: Partial<PracticeSitting> = {}): PracticeSitting => ({
  userId: 'u1',
  songId: 's1',
  startedAt: T0,
  at: T0,
  seconds: 120,
  maxSpeedPct: 80,
  loops: [],
  ...over,
})

const song = (id: string, comments: BarComment[] = []): BandSong => ({
  id,
  path: `${id}.gp5`,
  title: id.toUpperCase(),
  artist: '',
  status: 'learning',
  parts: {},
  note: '',
  rehearsalSpeedPct: null,
  comments,
  addedBy: 'u1',
  addedAt: 0,
  updatedAt: 0,
})

const comment = (over: Partial<BarComment> = {}): BarComment => ({
  id: 'c1',
  bar: 4,
  text: '',
  userId: 'u1',
  at: T0,
  ...over,
})

const session = (endedAt: number): RehearsalSession => ({ startedAt: endedAt - 30 * MIN, endedAt, songs: [] })

describe('addPractice', () => {
  it('starts a sitting, then merges practice within the gap', () => {
    let list = addPractice([], p({ seconds: 30, speedPct: 70 }), T0)
    expect(list).toEqual([
      { userId: 'u1', songId: 's1', startedAt: T0, at: T0, seconds: 30, maxSpeedPct: 70, loops: [] },
    ])
    list = addPractice(list, p({ seconds: 45, speedPct: 60 }), T0 + SITTING_GAP_MS - 1)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ startedAt: T0, at: T0 + SITTING_GAP_MS - 1, seconds: 75, maxSpeedPct: 70 })
    list = addPractice(list, p({ seconds: 5, speedPct: 90 }), T0 + SITTING_GAP_MS + 10)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ seconds: 80, maxSpeedPct: 90 })
  })

  it('a null speed keeps the max, and starts at 0', () => {
    const list = addPractice([], p({ speedPct: null }), T0)
    expect(list[0]?.maxSpeedPct).toBe(0)
    expect(addPractice(addPractice([], p({ speedPct: 85 }), T0), p({ speedPct: null }), T0 + 1)[0]?.maxSpeedPct).toBe(85)
  })

  it('starts a new sitting after the gap, and keeps others apart', () => {
    let list = addPractice([], p(), T0)
    list = addPractice(list, p(), T0 + SITTING_GAP_MS)
    expect(list).toHaveLength(2)
    expect(list[1]).toMatchObject({ startedAt: T0 + SITTING_GAP_MS, seconds: 30 })
    list = addPractice(list, p({ userId: 'u2' }), T0 + SITTING_GAP_MS + 1)
    list = addPractice(list, p({ songId: 's2' }), T0 + SITTING_GAP_MS + 2)
    expect(list).toHaveLength(4)
  })

  it('moves the updated sitting to the end and does not touch the input', () => {
    const a = addPractice([], p(), T0)
    const b = addPractice(a, p({ userId: 'u2' }), T0 + 1)
    const c = addPractice(b, p({ seconds: 10 }), T0 + 2)
    expect(c.map((s) => s.userId)).toEqual(['u2', 'u1'])
    expect(b[0]?.seconds).toBe(30)
  })

  it('accumulates loop time per range and caps the number of ranges', () => {
    let list = addPractice([], p({ seconds: 20, loopBars: [5, 8] }), T0)
    list = addPractice(list, p({ seconds: 25, loopBars: [5, 8] }), T0 + 1)
    list = addPractice(list, p({ seconds: 10, loopBars: [9, 9] }), T0 + 2)
    list = addPractice(list, p({ seconds: 10 }), T0 + 3)
    expect(list[0]?.loops).toEqual([
      { from: 5, to: 8, seconds: 45 },
      { from: 9, to: 9, seconds: 10 },
    ])
    for (let i = 0; i < 20; i++) list = addPractice(list, p({ seconds: 1, loopBars: [20 + i, 21 + i] }), T0 + 10 + i)
    expect(list[0]?.loops).toHaveLength(12)
    // A known range still accumulates once the list is full.
    list = addPractice(list, p({ seconds: 5, loopBars: [5, 8] }), T0 + 100)
    expect(list[0]?.loops[0]).toEqual({ from: 5, to: 8, seconds: 50 })
    expect(list[0]?.loops).toHaveLength(12)
  })

  it('ignores zero (or negative) seconds', () => {
    const list = addPractice([], p(), T0)
    const same = addPractice(list, p({ seconds: 0, speedPct: 150, loopBars: [1, 2] }), T0 + 5)
    expect(same).toEqual(list)
    expect(same).not.toBe(list)
    expect(addPractice([], p({ seconds: -3 }), T0)).toEqual([])
  })

  it('keeps at most MAX_SITTINGS, dropping the oldest', () => {
    let list: PracticeSitting[] = Array.from({ length: MAX_SITTINGS }, (_, i) => sitting({ songId: `x${i}` }))
    list = addPractice(list, p({ songId: 'new' }), T0 + 1)
    expect(list).toHaveLength(MAX_SITTINGS)
    expect(list[0]?.songId).toBe('x1')
    expect(list.at(-1)?.songId).toBe('new')
  })
})

describe('sanitizeSittings', () => {
  it('keeps well-formed sittings and drops the rest', () => {
    const good = sitting({ loops: [{ from: 2, to: 3, seconds: 60 }] })
    const out = sanitizeSittings([
      good,
      { ...good, userId: '' },
      { ...good, songId: 7 },
      { ...good, at: -1 },
      { ...good, startedAt: 1.5 },
      { ...good, seconds: 'x' },
      { ...good, maxSpeedPct: 200 },
      { ...good, loops: 'none' },
      null,
      'junk',
    ])
    expect(out).toEqual([good])
  })

  it('filters bad loops, strips extra fields and caps loops', () => {
    const loops = [
      { from: 1, to: 2, seconds: 10, extra: true },
      { from: 0, to: 2, seconds: 10 },
      { from: 3, to: 2, seconds: 10 },
      { from: 1, to: 2, seconds: 1.5 },
      null,
      ...Array.from({ length: 20 }, (_, i) => ({ from: 10 + i, to: 10 + i, seconds: 1 })),
    ]
    const [s] = sanitizeSittings([{ ...sitting(), loops, extra: 'x' }])
    expect(s).not.toHaveProperty('extra')
    expect(s?.loops[0]).toEqual({ from: 1, to: 2, seconds: 10 })
    expect(s?.loops).toHaveLength(12)
  })

  it('returns [] for a non-array and caps the list', () => {
    expect(sanitizeSittings({})).toEqual([])
    expect(sanitizeSittings(undefined)).toEqual([])
    const many = Array.from({ length: MAX_SITTINGS + 5 }, (_, i) => sitting({ songId: `s${i}` }))
    const out = sanitizeSittings(many)
    expect(out).toHaveLength(MAX_SITTINGS)
    expect(out[0]?.songId).toBe('s5')
  })
})

describe('bandActivity', () => {
  const members = new Set(['u1', 'u2'])

  it('lists sittings of current members on listed songs, long enough to matter', () => {
    const out = bandActivity(
      [song('s1')],
      [
        sitting({ seconds: MIN_SITTING_SECONDS, at: T0 + 1 }),
        sitting({ seconds: MIN_SITTING_SECONDS - 1, at: T0 + 2 }),
        sitting({ userId: 'gone', at: T0 + 3 }),
        sitting({ songId: 'removed', at: T0 + 4 }),
      ],
      [],
      members,
    )
    expect(out).toEqual([
      {
        type: 'practice',
        at: T0 + 1,
        userId: 'u1',
        songId: 's1',
        seconds: MIN_SITTING_SECONDS,
        maxSpeedPct: 80,
        loopBars: null,
      },
    ])
  })

  it('names the longest loop only from MIN_LOOP_SECONDS', () => {
    const loops = [
      { from: 1, to: 4, seconds: 30 },
      { from: 9, to: 12, seconds: MIN_LOOP_SECONDS },
    ]
    const [a] = bandActivity([song('s1')], [sitting({ loops })], [], members)
    expect(a).toMatchObject({ type: 'practice', loopBars: [9, 12] })
    const [b] = bandActivity(
      [song('s1')],
      [sitting({ loops: [{ from: 9, to: 12, seconds: MIN_LOOP_SECONDS - 1 }] })],
      [],
      members,
    )
    expect(b).toMatchObject({ type: 'practice', loopBars: null })
  })

  it('lists marks and plain comments of members (kind null for a plain one)', () => {
    const out = bandActivity(
      [
        song('s1', [
          comment({ id: 'a', bar: 3, kind: 'changed', at: T0 + 2 }),
          comment({ id: 'b', bar: 5, text: '慢一点', at: T0 + 1 }),
          comment({ id: 'c', userId: 'gone', kind: 'note', at: T0 + 3 }),
        ]),
      ],
      [],
      [],
      members,
    )
    expect(out).toEqual([
      { type: 'mark', at: T0 + 2, userId: 'u1', songId: 's1', bar: 3, kind: 'changed', text: '' },
      { type: 'mark', at: T0 + 1, userId: 'u1', songId: 's1', bar: 5, kind: null, text: '慢一点' },
    ])
  })

  it('lists sessions by their end, and a song without comments is fine', () => {
    const s = session(T0 + 50)
    const out = bandActivity([{ ...song('s1'), comments: undefined }], [], [s], members)
    expect(out).toEqual([{ type: 'session', at: T0 + 50, session: s }])
  })

  it('puts everything newest first and keeps `limit` items', () => {
    const out = bandActivity(
      [song('s1', [comment({ at: T0 + 20 })])],
      [sitting({ at: T0 + 10 }), sitting({ songId: 's1', userId: 'u2', at: T0 + 30 })],
      [session(T0 + 25), session(T0 + 5)],
      members,
    )
    expect(out.map((x) => [x.type, x.at])).toEqual([
      ['practice', T0 + 30],
      ['session', T0 + 25],
      ['mark', T0 + 20],
      ['practice', T0 + 10],
      ['session', T0 + 5],
    ])
    expect(bandActivity([song('s1')], [], [session(1), session(3), session(2)], members, 2).map((x) => x.at)).toEqual([3, 2])
    const many = Array.from({ length: MAX_ACTIVITY + 10 }, (_, i) => session(T0 + i))
    expect(bandActivity([], [], many, members)).toHaveLength(MAX_ACTIVITY)
  })
})

describe('ActivityLog', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-activity-test-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('starts empty without a file, and with a broken file', () => {
    expect(new ActivityLog(ActivityLog.fileOf(dir, 'b1')).sittings()).toEqual([])
    fs.writeFileSync(ActivityLog.fileOf(dir, 'b2'), '{not json')
    expect(new ActivityLog(ActivityLog.fileOf(dir, 'b2')).sittings()).toEqual([])
  })

  it('names the file after the band', () => {
    expect(ActivityLog.fileOf(dir, 'abc')).toBe(path.join(dir, 'abc.activity.json'))
  })

  it('keeps practice in memory, writes it on flush and reloads it', async () => {
    const file = ActivityLog.fileOf(path.join(dir, 'bands'), 'b1')
    const log = new ActivityLog(file)
    log.practice(p({ seconds: 40, speedPct: 75 }), T0)
    log.practice(p({ seconds: 40, loopBars: [2, 3] }), T0 + MIN)
    expect(log.sittings()).toHaveLength(1)
    expect(fs.existsSync(file)).toBe(false)
    await log.flush()
    expect(fs.existsSync(file)).toBe(true)
    const again = new ActivityLog(file)
    expect(again.sittings()).toEqual([
      {
        userId: 'u1',
        songId: 's1',
        startedAt: T0,
        at: T0 + MIN,
        seconds: 80,
        maxSpeedPct: 75,
        loops: [{ from: 2, to: 3, seconds: 40 }],
      },
    ])
  })

  it('flushes again after more practice', async () => {
    const file = ActivityLog.fileOf(dir, 'b1')
    const log = new ActivityLog(file)
    log.practice(p(), T0)
    await log.flush()
    log.practice(p({ songId: 's2' }), T0 + 1)
    await log.flush()
    expect(new ActivityLog(file).sittings().map((s) => s.songId)).toEqual(['s1', 's2'])
  })

  it('remove() empties the log and deletes the file (also when there is none)', async () => {
    const file = ActivityLog.fileOf(dir, 'b1')
    const log = new ActivityLog(file)
    log.practice(p(), T0)
    await log.flush()
    log.practice(p({ songId: 's2' }), T0 + 1)
    await log.remove()
    expect(log.sittings()).toEqual([])
    expect(fs.existsSync(file)).toBe(false)
    await expect(log.remove()).resolves.toBeUndefined()
    expect(new ActivityLog(file).sittings()).toEqual([])
  })
})

describe('fractional seconds', () => {
  it('keeps a loop reported in tenths of a second through a reload of the stored list', () => {
    const list = addPractice([], { userId: 'u1', songId: 's1', seconds: 12.5, speedPct: 90, loopBars: [1, 2] }, 1000)
    const back = sanitizeSittings(JSON.parse(JSON.stringify(list)))
    expect(back[0]!.loops).toEqual([{ from: 1, to: 2, seconds: 12.5 }])
    expect(back[0]!.seconds).toBe(12.5)
  })
})
