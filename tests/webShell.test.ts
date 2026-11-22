import { describe, expect, it } from 'vitest'
import { sectionOf } from '../web/lib/sections'
import { parseTheme } from '../web/lib/theme'

describe('sectionOf', () => {
  it('puts library pages under 谱库', () => {
    expect(sectionOf({ kind: 'home' })).toBe('library')
    expect(sectionOf({ kind: 'search', q: 'a' })).toBe('library')
    expect(sectionOf({ kind: 'category', id: 'x' })).toBe('library')
  })
  it('puts band pages under 乐队', () => {
    expect(sectionOf({ kind: 'band' })).toBe('band')
    expect(sectionOf({ kind: 'bandSong', id: 's' })).toBe('band')
    expect(sectionOf({ kind: 'ensembles', q: '', need: '' })).toBe('band')
    expect(sectionOf({ kind: 'upload', id: '', band: 'b', personal: false })).toBe('band')
  })
  it('puts personal pages under 我的', () => {
    expect(sectionOf({ kind: 'account' })).toBe('me')
    expect(sectionOf({ kind: 'favorites' })).toBe('me')
    expect(sectionOf({ kind: 'daily', day: null })).toBe('me')
    expect(sectionOf({ kind: 'mine' })).toBe('me')
    expect(sectionOf({ kind: 'upload', id: '', band: '', personal: true })).toBe('me')
  })
})

describe('parseTheme', () => {
  it('is dark unless light was chosen', () => {
    expect(parseTheme(null)).toBe('dark')
    expect(parseTheme('')).toBe('dark')
    expect(parseTheme('system')).toBe('dark')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('light')).toBe('light')
  })
})
