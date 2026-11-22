import { describe, expect, it } from 'vitest'
import { barStartsMs, scoreSyllables, type LyricScore } from '../web/viewer/scoreLyrics'

const beats = (...words: Array<string | null>) => ({
  voices: [{ beats: words.map((w) => ({ lyrics: w === null ? null : [w] })) }],
})

describe('barStartsMs', () => {
  it('follows the tempo, including a change', () => {
    const score: LyricScore = {
      tempo: 120,
      masterBars: [
        { start: 0 },
        { start: 3840 },
        { start: 7680, tempoAutomations: [{ value: 60 }] },
        { start: 11520, calculateDuration: () => 3840 },
      ],
      tracks: [],
    }
    // 4/4 at 120 = 2 s a bar; at 60 = 4 s a bar
    expect(barStartsMs(score)).toEqual([0, 2000, 4000, 8000])
    expect(barStartsMs(null)).toEqual([])
  })
})

describe('scoreSyllables', () => {
  it('takes the words of the track with the most', () => {
    const score: LyricScore = {
      tempo: 100,
      masterBars: [{ start: 0 }, { start: 3840 }],
      tracks: [
        { staves: [{ bars: [beats('la'), beats(null)] }] },
        { staves: [{ bars: [beats(null, '今', ' 天 '), beats('我', '')] }] },
      ],
    }
    expect(scoreSyllables(score)).toEqual([
      { bar: 1, text: '今' },
      { bar: 1, text: '天' },
      { bar: 2, text: '我' },
    ])
    expect(scoreSyllables({ tempo: 100, masterBars: [], tracks: [] })).toEqual([])
  })
})
