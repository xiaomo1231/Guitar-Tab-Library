/**
 * Chord names of a score, bar by bar (pure): taken from the track that names the most
 * chords (usually the rhythm guitar), for the 词谱 above the lyrics.
 */

interface ChordBeat {
  chordId?: string | null
}
interface ChordStaff {
  chords?: Map<string, { name: string }> | null
  bars: readonly { voices: readonly { beats: readonly ChordBeat[] }[] }[]
}
export interface ChordScore {
  tracks: readonly { staves: readonly ChordStaff[] }[]
}

/** chords[b] = the chord names in bar b+1, in order, consecutive repeats dropped. */
export function chordsByBar(score: ChordScore | null): string[][] {
  if (!score) return []
  let best: string[][] = []
  let bestCount = 0
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      const names = staff.chords
      if (!names || names.size === 0) continue
      let count = 0
      const bars = staff.bars.map((bar) => {
        const out: string[] = []
        // The first voice carries the chord symbols.
        for (const beat of bar.voices[0]?.beats ?? []) {
          const name = beat.chordId ? names.get(beat.chordId)?.name.trim() : undefined
          if (!name) continue
          count += 1
          if (out[out.length - 1] !== name) out.push(name)
        }
        return out
      })
      if (count > bestCount) {
        best = bars
        bestCount = count
      }
    }
  }
  return best
}
