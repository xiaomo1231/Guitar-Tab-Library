/**
 * What a score knows about its lyrics (pure): when each bar starts, so an .lrc file's
 * times can be turned into bars, and the words written inside the score itself.
 */
import type { ScoreSyllable } from '@/songs/lyricSheet'

interface TimedBar {
  /** Start of the bar in ticks (960 per quarter note). */
  start: number
  tempoAutomations?: readonly { value: number }[] | null
  calculateDuration?: () => number
}
export interface LyricScore {
  tempo: number
  masterBars: readonly TimedBar[]
  tracks: readonly {
    staves: readonly {
      bars: readonly { voices: readonly { beats: readonly { lyrics?: readonly string[] | null }[] }[] }[]
    }[]
  }[]
}

const TICKS_PER_QUARTER = 960

/**
 * starts[i] = when bar i+1 begins, in ms, read straight through the score (repeats are
 * not unfolded, so a song with repeats matches a recording only up to the first one).
 */
export function barStartsMs(score: LyricScore | null): number[] {
  if (!score) return []
  const out: number[] = []
  let tempo = score.tempo > 0 ? score.tempo : 120
  let ms = 0
  score.masterBars.forEach((bar, i) => {
    const t = bar.tempoAutomations?.[0]?.value
    if (typeof t === 'number' && t > 0) tempo = t
    out.push(Math.round(ms))
    const next = score.masterBars[i + 1]
    const ticks = next ? next.start - bar.start : (bar.calculateDuration?.() ?? 0)
    ms += (Math.max(0, ticks) / TICKS_PER_QUARTER) * (60000 / tempo)
  })
  return out
}

/** The sung syllables of the track that carries the most words, in order; [] when the score has none. */
export function scoreSyllables(score: LyricScore | null): ScoreSyllable[] {
  if (!score) return []
  let best: ScoreSyllable[] = []
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      const found: ScoreSyllable[] = []
      staff.bars.forEach((bar, i) => {
        for (const beat of bar.voices[0]?.beats ?? []) {
          const text = beat.lyrics?.[0]?.trim()
          if (text) found.push({ bar: i + 1, text })
        }
      })
      if (found.length > best.length) best = found
    }
  }
  return best
}
