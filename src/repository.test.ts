import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createItem, deleteItem, normalizeTags, updateItem, validateImport } from './repository'

beforeEach(async () => { await db.delete(); await db.open() })

describe('offline repository', () => {
  it('writes an item and durable sync queue entry in one operation', async () => {
    const item = await createItem({ kind: 'bookmark', title: 'Example', url: 'https://www.example.com/path', tags: ['Work', 'work', ''] })
    expect(item.id).toMatch(/[0-9a-f-]{36}/)
    expect(item.domain).toBe('example.com')
    expect(await db.items.get(item.id)).toBeTruthy()
    expect(await db.syncQueue.where('[entityType+entityId]').equals(['item', item.id]).count()).toBe(1)
  })

  it('coalesces repeated edits and preserves a single queue mutation', async () => {
    const item = await createItem({ kind: 'note', title: 'Draft', note: 'One' })
    await updateItem(item.id, { title: 'Final', note: 'Two', favorite: true })
    expect((await db.items.get(item.id))?.title).toBe('Final')
    expect(await db.syncQueue.where('[entityType+entityId]').equals(['item', item.id]).count()).toBe(1)
  })

  it('uses tombstones so offline deletion can resume', async () => {
    const item = await createItem({ kind: 'text', title: 'Temporary', content: 'Text' })
    await deleteItem(item.id)
    expect((await db.items.get(item.id))?.deletedAt).toBeTruthy()
    expect((await db.syncQueue.where('[entityType+entityId]').equals(['item', item.id]).first())?.operation).toBe('delete')
  })

  it('normalizes and limits tags', () => expect(normalizeTags([' Alpha ', 'Alpha', '', 4])).toEqual(['Alpha']))
  it('stores validated screenshots offline without indexing base64 content', async () => {
    const item = await createItem({ kind: 'screenshot', title: 'Visual reference', imageDataUrl: 'data:image/png;base64,AA==', tags: ['screenshot'] })
    expect(item.imageDataUrl).toBe('data:image/png;base64,AA==')
    expect((await db.searchIndex.get(item.id))?.terms).not.toContain('base64')
  })
  it('drops unsafe image data while preserving the visual record', async () => {
    const item = await createItem({ kind: 'image', title: 'Unsafe visual', imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })
    expect(item.imageDataUrl).toBeUndefined()
    expect(item.kind).toBe('image')
  })
  it('rejects screenshot records that do not contain safe image data', async () => {
    await expect(createItem({ kind: 'screenshot', title: 'Broken screenshot', imageDataUrl: 'data:text/html;base64,SGk=' })).rejects.toThrow('Screenshot data')
  })
  it('rejects executable-shaped or incomplete imports', () => expect(() => validateImport({ schemaVersion: 2, items: 'bad' })).toThrow())
})
