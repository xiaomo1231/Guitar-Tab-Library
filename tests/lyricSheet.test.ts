import { describe, expect, it } from 'vitest'
import {
  MAX_SHEET_BAR,
  MAX_SHEET_LINES,
  MAX_SHEET_LINE_CHARS,
  MAX_SHEET_SECTION_CHARS,
  activeLine,
  alignLine,
  alignedCount,
  checkSheetLines,
  lineBars,
  lyricText,
  nextLine,
  parseLyricText,
  type SheetLine,
} from '../src/songs/lyricSheet'

const L = (text: string, bar: number | null = null, section: string | null = null): SheetLine => ({
  text,
  bar,
  section,
})

const bars = (lines: SheetLine[]) => lines.map((l) => l.bar)

describe('parseLyricText', () => {
  it('makes one line per text line, trimmed, unaligned', () => {
    expect(parseLyricText('  第一句  \n第二句')).toEqual([L('第一句'), L('第二句')])
  })

  it('drops blank and whitespace-only lines, and handles CRLF', () => {
    expect(parseLyricText('\n\n第一句\r\n   \r\n\t\n第二句\r\n\r\n')).toEqual([
      L('第一句'),
      L('第二句'),
    ])
  })

  it('returns [] for empty text', () => {
    expect(parseLyricText('')).toEqual([])
    expect(parseLyricText('\n  \n')).toEqual([])
  })

  it.each([
    ['[副歌]', '副歌'],
    ['【副歌】', '副歌'],
    ['[ 主歌 2 ]', '主歌 2'],
    ['  【副歌】  ', '副歌'],
  ])('reads %s as the section %s of the next line', (head, name) => {
    expect(parseLyricText(`${head}\n这一句`)).toEqual([L('这一句', null, name)])
  })

  it('gives the section only to the next lyric line, across blank lines', () => {
    expect(parseLyricText('[主歌]\n\n一\n二\n[副歌]\n三')).toEqual([
      L('一', null, '主歌'),
      L('二'),
      L('三', null, '副歌'),
    ])
  })

  it('keeps the last of two section lines in a row, and drops a trailing section', () => {
    expect(parseLyricText('[前奏]\n[主歌]\n一\n[尾奏]')).toEqual([L('一', null, '主歌')])
  })

  it('caps a section name at MAX_SHEET_SECTION_CHARS', () => {
    const long = '段'.repeat(MAX_SHEET_SECTION_CHARS + 5)
    const [line] = parseLyricText(`[${long}]\n一`)
    expect(line!.section).toBe('段'.repeat(MAX_SHEET_SECTION_CHARS))
  })

  it.each(['(oh oh oh)', '（和声）', '她说：', 'Verse 1:'])('keeps %s as a lyric line, not a section', (line) => {
    expect(parseLyricText(line)).toEqual([L(line)])
  })

  it('caps a line at MAX_SHEET_LINE_CHARS characters (code points, not UTF-16 units)', () => {
    const [a] = parseLyricText('字'.repeat(MAX_SHEET_LINE_CHARS + 10))
    expect(a!.text).toBe('字'.repeat(MAX_SHEET_LINE_CHARS))
    const [b] = parseLyricText('😀'.repeat(MAX_SHEET_LINE_CHARS + 1))
    expect([...b!.text]).toHaveLength(MAX_SHEET_LINE_CHARS)
    expect(b!.text).toBe('😀'.repeat(MAX_SHEET_LINE_CHARS))
  })

  it('caps the sheet at MAX_SHEET_LINES lines', () => {
    const text = Array.from({ length: MAX_SHEET_LINES + 20 }, (_, i) => `第${i}句`).join('\n')
    const out = parseLyricText(text)
    expect(out).toHaveLength(MAX_SHEET_LINES)
    expect(out[MAX_SHEET_LINES - 1]!.text).toBe(`第${MAX_SHEET_LINES - 1}句`)
  })

  it('keeps the bars of lines that are unchanged', () => {
    const prev = [L('一', 1), L('二', 3), L('三', 5)]
    expect(parseLyricText('一\n改过的二\n三', prev)).toEqual([
      L('一', 1),
      L('改过的二'),
      L('三', 5),
    ])
  })

  it('keeps bars when lines are inserted or removed around them', () => {
    const prev = [L('一', 1), L('二', 3), L('三', 5)]
    expect(bars(parseLyricText('新\n一\n三', prev))).toEqual([null, 1, 5])
  })

  it('matches previous lines in order only (a moved line loses its bar)', () => {
    const prev = [L('一', 1), L('二', 3), L('三', 5)]
    expect(parseLyricText('三\n一', prev)).toEqual([L('三', 5), L('一')])
  })

  it('matches repeated lines one by one', () => {
    const prev = [L('啦啦', 2), L('啦啦', 6), L('啦啦', 10)]
    expect(bars(parseLyricText('啦啦\n啦啦', prev))).toEqual([2, 6])
  })

  it('compares the capped, trimmed text against previous lines', () => {
    const long = '字'.repeat(MAX_SHEET_LINE_CHARS)
    const prev = [L(long, 4)]
    expect(bars(parseLyricText(`  ${long}字字  `, prev))).toEqual([4])
  })

  it('keeps a bar but takes the new section from the text', () => {
    const prev = [L('一', 1, '主歌')]
    expect(parseLyricText('[副歌]\n一', prev)).toEqual([L('一', 1, '副歌')])
    expect(parseLyricText('一', prev)).toEqual([L('一', 1)])
  })
})

describe('lyricText', () => {
  it('writes sections in brackets with a blank line before all but the first', () => {
    const lines = [L('一', 1, '主歌'), L('二'), L('三', 9, '副歌'), L('四')]
    expect(lyricText(lines)).toBe('[主歌]\n一\n二\n\n[副歌]\n三\n四')
  })

  it('is empty for no lines', () => {
    expect(lyricText([])).toBe('')
  })

  it('round-trips through parseLyricText, keeping bars', () => {
    const lines = [
      L('一', 1, '前奏后'),
      L('二', 3),
      L('三', null, 'Chorus'),
      L('四', 12),
      L('四', 14),
    ]
    expect(parseLyricText(lyricText(lines), lines)).toEqual(lines)
    // Without previous lines the words and sections come back, bars do not.
    expect(parseLyricText(lyricText(lines))).toEqual(lines.map((l) => ({ ...l, bar: null })))
  })
})

describe('activeLine', () => {
  const lines = [L('一', 5), L('二', 9), L('未对齐'), L('三', 13)]

  it('is -1 before the first aligned line', () => {
    expect(activeLine(lines, 0)).toBe(-1)
    expect(activeLine(lines, 4)).toBe(-1)
  })

  it('is the last aligned line that has started', () => {
    expect(activeLine(lines, 5)).toBe(0)
    expect(activeLine(lines, 8)).toBe(0)
    expect(activeLine(lines, 9)).toBe(1)
    expect(activeLine(lines, 12)).toBe(1)
    expect(activeLine(lines, 13)).toBe(3)
    expect(activeLine(lines, 999)).toBe(3)
  })

  it('never picks an unaligned line', () => {
    expect(activeLine([L('a'), L('b')], 10)).toBe(-1)
    expect(activeLine([L('a'), L('b', 2), L('c')], 10)).toBe(1)
  })

  it('takes the later line when two start in the same bar', () => {
    expect(activeLine([L('a', 3), L('b', 3)], 3)).toBe(1)
  })

  it('is -1 for no lines', () => {
    expect(activeLine([], 5)).toBe(-1)
  })
})

describe('nextLine', () => {
  const lines = [L('未对齐'), L('一', 4), L('二', 8)]

  it('gives the next aligned line and how far away it is', () => {
    expect(nextLine(lines, 0)).toEqual({ index: 1, bars: 4 })
    expect(nextLine(lines, 3)).toEqual({ index: 1, bars: 1 })
    expect(nextLine(lines, 4)).toEqual({ index: 2, bars: 4 })
    expect(nextLine(lines, 7)).toEqual({ index: 2, bars: 1 })
  })

  it('is null after the last aligned line, or when nothing is aligned', () => {
    expect(nextLine(lines, 8)).toBeNull()
    expect(nextLine(lines, 100)).toBeNull()
    expect(nextLine([L('a'), L('b')], 0)).toBeNull()
    expect(nextLine([], 0)).toBeNull()
  })

  it('picks the nearest one even when the sheet is out of order', () => {
    expect(nextLine([L('a', 10), L('b', 6)], 2)).toEqual({ index: 1, bars: 4 })
  })
})

describe('lineBars', () => {
  const lines = [L('一', 1), L('二', 3), L('未对齐'), L('三', 10)]

  it('runs to the bar before the next aligned line', () => {
    expect(lineBars(lines, 0, 20)).toEqual([1, 2])
  })

  it('is capped at maxBars (default 4)', () => {
    expect(lineBars(lines, 1, 20)).toEqual([3, 6])
    expect(lineBars(lines, 1, 20, 2)).toEqual([3, 4])
    expect(lineBars(lines, 1, 20, 100)).toEqual([3, 9])
  })

  it('lets the last line run to the end of the song, capped', () => {
    expect(lineBars(lines, 3, 20)).toEqual([10, 13])
    expect(lineBars(lines, 3, 20, 50)).toEqual([10, 20])
    expect(lineBars(lines, 3, 11)).toEqual([10, 11])
  })

  it('is a single bar when the line starts in the last bar or past the end', () => {
    expect(lineBars(lines, 3, 10)).toEqual([10, 10])
    expect(lineBars([L('x', 25)], 0, 20)).toEqual([25, 25])
  })

  it('is null for an unaligned or missing line', () => {
    expect(lineBars(lines, 2, 20)).toBeNull()
    expect(lineBars(lines, 9, 20)).toBeNull()
    expect(lineBars(lines, -1, 20)).toBeNull()
  })

  it('ignores lines that start in the same bar', () => {
    expect(lineBars([L('a', 5), L('b', 5), L('c', 7)], 0, 20)).toEqual([5, 6])
  })
})

describe('alignedCount', () => {
  it('counts the lines with a bar', () => {
    expect(alignedCount([])).toBe(0)
    expect(alignedCount([L('a'), L('b')])).toBe(0)
    expect(alignedCount([L('a', 1), L('b'), L('c', 4)])).toBe(2)
  })
})

describe('alignLine', () => {
  const lines = [L('一', 1), L('二', 5), L('三', 9), L('四', 12)]

  it('sets one line and leaves the rest when the order still holds', () => {
    expect(bars(alignLine(lines, 1, 6))).toEqual([1, 6, 9, 12])
  })

  it('clears later lines that would now start before it', () => {
    expect(bars(alignLine(lines, 1, 10))).toEqual([1, 10, null, 12])
  })

  it('clears earlier lines that would now start after it', () => {
    expect(bars(alignLine(lines, 2, 3))).toEqual([1, null, 3, 12])
  })

  it('keeps lines that start in the same bar', () => {
    expect(bars(alignLine(lines, 1, 9))).toEqual([1, 9, 9, 12])
  })

  it('null only clears that line', () => {
    expect(bars(alignLine(lines, 2, null))).toEqual([1, 5, null, 12])
  })

  it('aligns an unaligned sheet line by line', () => {
    let s = [L('a'), L('b'), L('c')]
    s = alignLine(s, 0, 2)
    s = alignLine(s, 1, 4)
    s = alignLine(s, 2, 7)
    expect(bars(s)).toEqual([2, 4, 7])
  })

  it('does not change the input and keeps text and section', () => {
    const before = JSON.stringify(lines)
    const out = alignLine([L('a', 3, '主歌'), ...lines], 0, 2)
    expect(out[0]).toEqual(L('a', 2, '主歌'))
    expect(JSON.stringify(lines)).toBe(before)
  })
})

describe('checkSheetLines', () => {
  it('accepts well-formed lines, trimming text and section', () => {
    const r = checkSheetLines([
      { text: '  一  ', bar: 1, section: ' 主歌 ' },
      { text: '二', bar: null, section: null },
      { text: '三' },
    ])
    expect(r).toEqual({ ok: true, value: [L('一', 1, '主歌'), L('二'), L('三')] })
  })

  it('accepts the limits', () => {
    expect(checkSheetLines([]).ok).toBe(true)
    expect(checkSheetLines(Array.from({ length: MAX_SHEET_LINES }, () => ({ text: 'a' }))).ok).toBe(
      true,
    )
    expect(
      checkSheetLines([{ text: '字'.repeat(MAX_SHEET_LINE_CHARS), bar: MAX_SHEET_BAR }]).ok,
    ).toBe(true)
    expect(checkSheetLines([{ text: '😀'.repeat(MAX_SHEET_LINE_CHARS) }]).ok).toBe(true)
    expect(checkSheetLines([{ text: 'a', section: '段'.repeat(MAX_SHEET_SECTION_CHARS) }]).ok).toBe(
      true,
    )
  })

  it('drops unknown fields', () => {
    const r = checkSheetLines([{ text: 'a', bar: 2, section: null, extra: 1 }])
    expect(r).toEqual({ ok: true, value: [L('a', 2)] })
  })

  it.each([
    ['not an array', { text: 'a' }, '歌词格式不对。'],
    ['null', null, '歌词格式不对。'],
    ['a non-object item', ['a'], '歌词格式不对。'],
    ['a null item', [null], '歌词格式不对。'],
  ])('rejects %s', (_, raw, error) => {
    expect(checkSheetLines(raw)).toEqual({ ok: false, error })
  })

  it('rejects too many lines', () => {
    const r = checkSheetLines(Array.from({ length: MAX_SHEET_LINES + 1 }, () => ({ text: 'a' })))
    expect(r).toEqual({ ok: false, error: `歌词最多 ${MAX_SHEET_LINES} 行。` })
  })

  it.each([
    ['missing', {}],
    ['blank', { text: '   ' }],
    ['not a string', { text: 5 }],
    ['too long', { text: '字'.repeat(MAX_SHEET_LINE_CHARS + 1) }],
  ])('rejects text that is %s', (_, item) => {
    expect(checkSheetLines([item])).toEqual({
      ok: false,
      error: `每行歌词要在 1–${MAX_SHEET_LINE_CHARS} 个字之间。`,
    })
  })

  it.each([0, -1, 1.5, '1', MAX_SHEET_BAR + 1, Number.NaN, Infinity, true])(
    'rejects the bar %s',
    (bar) => {
      expect(checkSheetLines([{ text: 'a', bar }])).toEqual({
        ok: false,
        error: '歌词对应的小节号不对。',
      })
    },
  )

  it.each(['', '   ', 3, '段'.repeat(MAX_SHEET_SECTION_CHARS + 1)])(
    'rejects the section %j',
    (section) => {
      expect(checkSheetLines([{ text: 'a', section }])).toEqual({
        ok: false,
        error: `段落名最多 ${MAX_SHEET_SECTION_CHARS} 个字。`,
      })
    },
  )
})
