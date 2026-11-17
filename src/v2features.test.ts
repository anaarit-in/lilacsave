import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { itemToMarkdown, itemsToCsv, safeExportName } from './markdown'
import { bulkUpdateItems, createCollection, createItem, duplicateGroups, exportLibrary, importLibrary, updateCollection, verifyImport } from './repository'
import { suggestTags } from './smartTags'
import { createZip } from './zip'
import type { SavedItem, TagRule } from './types'

const item: SavedItem = { id: 'a', kind: 'selection', title: 'Résumé research', url: 'https://example.com/post?utm_source=test', content: 'Unicode ✓', note: 'Keep this', tags: ['Reading'], favorite: false, archived: false, createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z', syncState: 'pending', attempts: 0 }
beforeEach(async () => { await db.delete(); await db.open() })

describe('V2 professional features', () => {
  it('applies user-defined local tag rules', () => { const rule: TagRule = { id: 'r', name: 'Example', field: 'domain', operator: 'contains', value: 'example.com', tags: ['Custom'], enabled: true, createdAt: '', updatedAt: '' }; expect(suggestTags(item, [rule])).toContain('Custom') })
  it('exports safe Unicode Markdown, CSV, and individual ZIP files', () => { expect(itemToMarkdown(item)).toContain('Résumé research'); expect(itemsToCsv([item])).toContain('Unicode ✓'); expect(safeExportName('bad/name:*')).toBe('bad-name--.md'); expect(createZip([{ name: 'one.md', content: '# One' }]).type).toBe('application/zip') })
  it('supports nested collections and rejects cycles', async () => { const parent = await createCollection('Technology'), child = await createCollection('React', '#A78BFA', parent.id); expect(child.parentId).toBe(parent.id); await expect(updateCollection(parent.id, { parentId: child.id })).rejects.toThrow('cycle') })
  it('bulk tags and detects normalized duplicate URLs without deleting', async () => { const first = await createItem({ kind: 'bookmark', title: 'A', url: 'https://example.com/page?utm_source=x' }), second = await createItem({ kind: 'bookmark', title: 'B', url: 'https://example.com/page' }); await bulkUpdateItems([first.id, second.id], { favorite: true }, ['Research']); expect((await db.items.get(first.id))?.tags).toContain('Research'); expect(duplicateGroups(await db.items.toArray())[0]).toHaveLength(2) })
  it('validates integrity and restores missing records with stable IDs', async () => { await db.items.put(item); const bundle = await exportLibrary(); await verifyImport(bundle); await db.items.clear(); const result = await importLibrary(bundle, 'missing'); expect(result.added).toBeGreaterThan(0); expect((await db.items.get('a'))?.id).toBe('a'); const damaged = { ...bundle, items: [{ ...bundle.items[0], title: 'Changed' }] }; await expect(verifyImport(damaged)).rejects.toThrow('integrity') })
})
