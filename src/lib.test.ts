import { describe, expect, it } from 'vitest'
import { hostFromUrl, matchesAdvancedSearch, matchesSearch, relativeTime } from './lib'
import type { SavedItem } from './types'

const item: SavedItem = { id: '1', kind: 'bookmark', title: 'TypeScript handbook', url: 'https://www.typescriptlang.org/docs/', content: 'Typed JavaScript', tags: ['reference'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', syncState: 'pending', attempts: 0, favorite: true, archived: false }

describe('library helpers', () => {
  it('normalizes a URL host', () => expect(hostFromUrl(item.url)).toBe('typescriptlang.org'))
  it('searches all meaningful item fields', () => { expect(matchesSearch(item, 'typed')).toBe(true); expect(matchesSearch(item, 'reference')).toBe(true); expect(matchesSearch(item, 'unrelated')).toBe(false) })
  it('formats relative timestamps', () => expect(relativeTime('2026-01-01T00:59:00.000Z', Date.parse('2026-01-01T01:00:00.000Z'))).toBe('1 minute ago'))
  it('supports fielded professional search', () => { expect(matchesAdvancedSearch(item, 'type:bookmark tag:reference domain:typescriptlang.org')).toBe(true); expect(matchesAdvancedSearch(item, 'type:note')).toBe(false) })
})
