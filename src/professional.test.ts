import { describe, expect, it } from 'vitest'
import { itemToMarkdown } from './markdown'
import { suggestTags } from './smartTags'
import type { SavedItem } from './types'

const item: SavedItem = { id: 'a', kind: 'note', title: 'React API research', note: 'A design system reference', tags: [], favorite: false, archived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', syncState: 'pending', attempts: 0 }
describe('Professional tools', () => {
  it('suggests deterministic local tags without network access', () => expect(suggestTags(item)).toEqual(expect.arrayContaining(['development', 'research', 'design', 'reference', 'note'])))
  it('exports portable Markdown with metadata', () => { const markdown = itemToMarkdown(item); expect(markdown).toContain('title: "React API research"'); expect(markdown).toContain('# React API research') })
})
