import { describe, expect, it } from 'vitest'
import { parseSearch, searchItems } from './search'
import type { Collection, SavedItem } from './types'

const base = (id: string, changes: Partial<SavedItem> = {}): SavedItem => ({ id, kind: 'bookmark', title: `Item ${id}`, tags: [], favorite: false, archived: false, createdAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:00:00.000Z', syncState: 'synced', attempts: 0, ...changes })
const collection: Collection = { id: 'c1', name: 'Technology', color: '#A78BFA', sortOrder: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }

describe('V2 search engine', () => {
  const items = [base('1', { title: 'React TypeScript Guide', url: 'https://github.com/example', content: 'Build a SaaS app', tags: ['Research'], favorite: true, collectionId: 'c1' }), base('2', { kind: 'note', title: 'Meeting', note: 'Advertising plan' })]
  it('searches and ranks title, URL, content, tags, and collections', () => { const result = searchItems(items, [collection], 'react type:bookmark tag:research domain:github.com collection:tech is:favorite'); expect(result.error).toBeUndefined(); expect(result.results.map((entry) => entry.item.id)).toEqual(['1']) })
  it('supports phrases, dates, and relevance ordering', () => { const result = searchItems(items, [collection], '"React TypeScript" after:2026-11-01', 'relevance'); expect(result.results[0]?.item.id).toBe('1') })
  it('returns helpful syntax errors', () => { expect(parseSearch('unknown:value').error).toContain('Unknown'); expect(parseSearch('before:today').error).toContain('YYYY-MM-DD'); expect(parseSearch('"missing').error).toContain('closing quote') })
  it('handles a 10,000 item local library without Drive access', () => { const large = Array.from({ length: 10_000 }, (_, index) => base(String(index), { title: index === 9999 ? 'Unique needle' : `Record ${index}` })); expect(searchItems(large, [], 'needle').results).toHaveLength(1) })
})
