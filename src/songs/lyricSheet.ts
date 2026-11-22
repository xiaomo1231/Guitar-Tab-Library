/**
 * 词谱 (pure): a band song's lyrics as lines, each optionally tied to the bar where it
 * starts, so the singer's sheet can follow the score. Parsing of pasted text, the line
 * being sung at a bar, and the wait until the next line.
 */

export interface SheetLine {
  text: string
  /** 1-based bar where this line starts, or null while it is not aligned yet. */
  bar: number | null
  /** Section name (主歌, 副歌…) when this line opens one, else null. */
  section: string | null
}

export const MAX_SHEET_LINES = 300
export const MAX_SHEET_LINE_CHARS = 80
export const MAX_SHEET_SECTION_CHARS = 20
export const MAX_SHEET_BAR = 100000

const chars = (s: string) => [...s]

/**
 * A line that only names a section: [副歌] or 【副歌】. Round brackets and a trailing colon
 * are left alone: lyrics use them (backing vocals, "她说：").
 */
function sectionOf(line: string): string | null {
  const m = /^[[【]\s*(.+?)\s*[\]】]$/.exec(line)
  if (!m) return null
  const name = chars(m[1]!.trim()).slice(0, MAX_SHEET_SECTION_CHARS).join('')
  return name || null
}

const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const LRC_META = /^\[(?:ti|ar|al|by|au|re|ve|length|offset|tool|id|hash|sign|total|language|kana)\s*:[^\]]*\]$/i

/** A line of an .lrc file without its time tags; '' for a tag-only or metadata line. */
function stripLrc(raw: string): string {
  const line = raw.trim()
  if (LRC_META.test(line)) return ''
  return line
    .replace(LRC_TIME, '')
    .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '')
    .trim()
}

/** True when the text carries .lrc time tags (then it can be aligned by time). */
export function hasLrcTimes(text: string): boolean {
  LRC_TIME.lastIndex = 0
  return LRC_TIME.test(text)
}

/**
 * The start time of each lyric line of an .lrc text, in the order parseLyricText gives the
 * lines (a line with several time tags uses the first); null where a line has no tag.
 */
export function lrcLineTimes(text: string): Array<number | null> {
  const out: Array<number | null> = []
  for (const raw of text.split(/\r?\n/)) {
    const line = stripLrc(raw)
    if (!line || sectionOf(line) !== null) continue
    if (out.length >= MAX_SHEET_LINES) break
    const m = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(raw)
    if (!m) {
      out.push(null)
      continue
    }
    const frac = m[3] ?? ''
    const ms = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0
    out.push(Number(m[1]) * 60000 + Number(m[2]) * 1000 + ms)
  }
  return out
}

/**
 * Ties lines to bars by time: `barStartsMs[i]` is when bar i+1 starts in the score. A line
 * goes to the bar that is sounding at its time (a line within `leadMs` before a bar line
 * belongs to the next bar: singers come in on the pickup). Lines without a time, or that
 * would break the rising order, stay as they are.
 */
export function alignByTime(
  lines: readonly SheetLine[],
  times: ReadonlyArray<number | null>,
  barStartsMs: readonly number[],
  leadMs = 350,
): SheetLine[] {
  let last = 0
  return lines.map((l, i) => {
    const t = times[i]
    if (t === null || t === undefined || barStartsMs.length === 0) {
      if (l.bar !== null) last = Math.max(last, l.bar)
      return l
    }
    let bar = 1
    while (bar < barStartsMs.length && barStartsMs[bar]! <= t + leadMs) bar++
    if (bar < last) return { ...l, bar: null }
    last = bar
    return { ...l, bar }
  })
}

/** One sung syllable read from a score: the bar it is in (1-based) and its text. */
export interface ScoreSyllable {
  bar: number
  text: string
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/

/**
 * Lyrics written inside a score (Guitar Pro) → lines already tied to bars. A new line
 * starts after a bar without words, or when the line has run for `barsPerLine` bars.
 * Syllables ending in "-" join the next one; Latin words get spaces, CJK does not.
 */
export function sheetFromSyllables(syllables: readonly ScoreSyllable[], barsPerLine = 2): SheetLine[] {
  const out: SheetLine[] = []
  let text = ''
  let startBar = 0
  let lastBar = 0
  let glue = false
  const push = () => {
    const clean = chars(text.trim()).slice(0, MAX_SHEET_LINE_CHARS).join('')
    if (clean && out.length < MAX_SHEET_LINES) out.push({ text: clean, bar: startBar, section: null })
    text = ''
  }
  for (const s of syllables) {
    const word = s.text.trim()
    if (!word || !Number.isInteger(s.bar) || s.bar < 1) continue
    if (text && (s.bar > lastBar + 1 || s.bar >= startBar + barsPerLine)) {
      push()
      glue = false
    }
    if (!text) startBar = s.bar
    const joins = word.endsWith('-')
    const piece = joins ? word.slice(0, -1) : word
    const needSpace = text !== '' && !glue && !(CJK.test(piece[0] ?? '') || CJK.test(text.slice(-1)))
    text += (needSpace ? ' ' : '') + piece
    glue = joins
    lastBar = s.bar
  }
  push()
  return out
}

/**
 * Pasted text → lines. One lyric line per text line; empty lines are dropped; a line that
 * only names a section gives that name to the next lyric line. Lines of `previous` that
 * are still there (same text, in order) keep their bars, so editing the words does not
 * throw the alignment away. The time tags and header lines of an .lrc file are dropped.
 */
export function parseLyricText(text: string, previous: readonly SheetLine[] = []): SheetLine[] {
  const out: SheetLine[] = []
  let section: string | null = null
  let from = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = stripLrc(raw)
    if (!line) continue
    const named = sectionOf(line)
    if (named !== null) {
      section = named
      continue
    }
    if (out.length >= MAX_SHEET_LINES) break
    const clean = chars(line).slice(0, MAX_SHEET_LINE_CHARS).join('')
    let bar: number | null = null
    const at = previous.findIndex((p, i) => i >= from && p.text === clean)
    if (at >= 0) {
      bar = previous[at]!.bar
      from = at + 1
    }
    out.push({ text: clean, bar, section })
    section = null
  }
  return out
}

/** Lines → the text to edit (section names in brackets on their own line). */
export function lyricText(lines: readonly SheetLine[]): string {
  const out: string[] = []
  lines.forEach((l, i) => {
    if (l.section !== null) {
      if (i > 0) out.push('')
      out.push(`[${l.section}]`)
    }
    out.push(l.text)
  })
  return out.join('\n')
}

/** Index of the line being sung at `bar`: the last aligned line that started by then; -1 before the first. */
export function activeLine(lines: readonly SheetLine[], bar: number): number {
  let found = -1
  let foundBar = -1
  lines.forEach((l, i) => {
    if (l.bar !== null && l.bar <= bar && l.bar >= foundBar) {
      found = i
      foundBar = l.bar
    }
  })
  return found
}

/** The next aligned line that starts after `bar`, and how many bars away it is; null when none. */
export function nextLine(lines: readonly SheetLine[], bar: number): { index: number; bars: number } | null {
  let best: { index: number; bars: number } | null = null
  lines.forEach((l, i) => {
    if (l.bar === null || l.bar <= bar) return
    const away = l.bar - bar
    if (best === null || away < best.bars) best = { index: i, bars: away }
  })
  return best
}

/**
 * The bars line `i` covers: from its bar to the bar before the next aligned line, at most
 * `maxBars` (a line followed by an interlude does not claim all of it). null when unaligned.
 */
export function lineBars(
  lines: readonly SheetLine[],
  i: number,
  totalBars: number,
  maxBars = 4,
): [number, number] | null {
  const start = lines[i]?.bar ?? null
  if (start === null) return null
  let next = totalBars + 1
  for (const l of lines) if (l.bar !== null && l.bar > start && l.bar < next) next = l.bar
  return [start, Math.max(start, Math.min(next - 1, start + maxBars - 1, Math.max(totalBars, start)))]
}

/** How many lines have a bar. */
export function alignedCount(lines: readonly SheetLine[]): number {
  return lines.filter((l) => l.bar !== null).length
}

/**
 * Sets the bar of line `i` (边放边点: the line starts now). Bars never go backwards down
 * the sheet, so later lines that would start before it lose their bar.
 */
export function alignLine(lines: readonly SheetLine[], i: number, bar: number | null): SheetLine[] {
  return lines.map((l, k) => {
    if (k === i) return { ...l, bar }
    if (bar !== null && l.bar !== null && ((k > i && l.bar < bar) || (k < i && l.bar > bar)))
      return { ...l, bar: null }
    return l
  })
}

/** Validates lines from a request body. */
export function checkSheetLines(raw: unknown): { ok: true; value: SheetLine[] } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error })
  if (!Array.isArray(raw)) return bad('歌词格式不对。')
  if (raw.length > MAX_SHEET_LINES) return bad(`歌词最多 ${MAX_SHEET_LINES} 行。`)
  const out: SheetLine[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return bad('歌词格式不对。')
    const r = item as Record<string, unknown>
    const text = typeof r.text === 'string' ? r.text.trim() : ''
    if (!text || chars(text).length > MAX_SHEET_LINE_CHARS)
      return bad(`每行歌词要在 1–${MAX_SHEET_LINE_CHARS} 个字之间。`)
    const bar = r.bar ?? null
    if (bar !== null && !(typeof bar === 'number' && Number.isInteger(bar) && bar >= 1 && bar <= MAX_SHEET_BAR))
      return bad('歌词对应的小节号不对。')
    const section = r.section ?? null
    if (section !== null && !(typeof section === 'string' && section.trim() && chars(section.trim()).length <= MAX_SHEET_SECTION_CHARS))
      return bad(`段落名最多 ${MAX_SHEET_SECTION_CHARS} 个字。`)
    out.push({ text, bar: bar as number | null, section: section === null ? null : (section as string).trim() })
  }
  return { ok: true, value: out }
}
