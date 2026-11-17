import { db, getSettings, indexTerms, safeDomain } from './db'
import { freePlanViolation, resolveBillingProfile } from './billing'
import type { Collection, ExportBundle, NewItemInput, RestoreMode, SavedItem, SyncQueueEntry, TagRecord, TagRule } from './types'

const nowIso = () => new Date().toISOString()
const cleanText = (value: unknown, max: number) => typeof value === 'string' ? Array.from(value).filter((character) => character.charCodeAt(0) !== 0).join('').trim().slice(0, max) : ''
const normalizedTag = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase()
export const normalizeTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return []
  const unique = new Map<string, string>()
  for (const value of tags) { const display = cleanText(value, 50); if (display && !unique.has(normalizedTag(display))) unique.set(normalizedTag(display), display) }
  return [...unique.values()].slice(0, 30)
}
const queueEntry = (entityType: SyncQueueEntry['entityType'], entityId: string, operation: SyncQueueEntry['operation']): SyncQueueEntry => { const now = nowIso(); return { id: crypto.randomUUID(), entityType, entityId, operation, createdAt: now, attempts: 0, nextAttemptAt: now } }
async function replaceQueuedMutation(entityType: SyncQueueEntry['entityType'], entityId: string, operation: SyncQueueEntry['operation']) { await db.syncQueue.where('[entityType+entityId]').equals([entityType, entityId]).delete(); await db.syncQueue.add(queueEntry(entityType, entityId, operation)) }
async function upsertTags(tags: string[]): Promise<TagRecord[]> {
  const records: TagRecord[] = []
  for (const name of tags) {
    const normalizedName = normalizedTag(name)
    let record = await db.tags.where('normalizedName').equals(normalizedName).first()
    if (!record) { record = { id: crypto.randomUUID(), name, normalizedName, createdAt: nowIso() }; await db.tags.add(record) }
    records.push(record)
  }
  return records
}
async function replaceItemTags(itemId: string, tags: string[]) {
  const records = await upsertTags(tags)
  await db.itemTags.where('itemId').equals(itemId).delete()
  if (records.length) await db.itemTags.bulkPut(records.map((tag) => ({ id: `${itemId}:${tag.id}`, itemId, tagId: tag.id })))
}
async function updateSearchIndex(item: SavedItem) { await db.searchIndex.put({ id: item.id, itemId: item.id, terms: indexTerms(item), updatedAt: item.updatedAt }) }
export async function rebuildItemDerivedData(item: SavedItem): Promise<void> { await db.transaction('rw', db.tags, db.itemTags, db.searchIndex, async () => { await replaceItemTags(item.id, normalizeTags(item.tags)); await updateSearchIndex(item) }) }

async function enforceSaveLimit(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local || !chrome.identity) return
  const { profile } = await resolveBillingProfile()
  if (profile.plan !== 'free') return
  const now = new Date(), startedAt = new Date(profile.freeAccessStartedAt || now.toISOString())
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
  const [totalSaves, savesToday] = await Promise.all([
    db.items.filter((item) => !item.deletedAt).count(),
    db.items.where('createdAt').aboveOrEqual(dayStart.toISOString()).count(),
  ])
  const violation = freePlanViolation({ now, startedAt, totalSaves, savesToday })
  if (violation) throw new Error(violation)
}

export async function createItem(input: NewItemInput): Promise<SavedItem> {
  await enforceSaveLimit()
  const timestamp = nowIso(), tags = normalizeTags(input.tags), url = cleanText(input.url, 4096) || undefined, imageUrl = cleanText(input.imageUrl, 4096) || undefined
  const imageDataUrl = typeof input.imageDataUrl === 'string' && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(input.imageDataUrl) && input.imageDataUrl.length <= 16_000_000 ? input.imageDataUrl : undefined
  if (input.kind === 'screenshot' && !imageDataUrl) throw new Error('Screenshot data is missing, invalid, or larger than 16 MB.')
  const item: SavedItem = { id: crypto.randomUUID(), kind: input.kind, title: cleanText(input.title, 300) || 'Untitled', url, domain: safeDomain(url), content: cleanText(input.content, 500_000) || undefined, note: cleanText(input.note, 500_000) || undefined, markdown: Boolean(input.markdown), imageUrl, imageDataUrl, tags, collectionId: cleanText(input.collectionId, 100) || undefined, favorite: Boolean(input.favorite), archived: Boolean(input.archived), createdAt: timestamp, updatedAt: timestamp, syncState: 'pending', attempts: 0 }
  await db.transaction('rw', db.items, db.tags, db.itemTags, db.searchIndex, db.syncQueue, async () => { await db.items.add(item); await replaceItemTags(item.id, tags); await updateSearchIndex(item); await replaceQueuedMutation('item', item.id, 'upsert') })
  return item
}
export async function updateItem(id: string, changes: Partial<Pick<SavedItem, 'title' | 'url' | 'content' | 'note' | 'markdown' | 'imageUrl' | 'imageDataUrl' | 'tags' | 'collectionId' | 'favorite' | 'archived'>>): Promise<void> {
  const current = await db.items.get(id); if (!current || current.deletedAt) throw new Error('Item not found.')
  const tags = changes.tags ? normalizeTags(changes.tags) : current.tags, url = changes.url === undefined ? current.url : cleanText(changes.url, 4096) || undefined
  const next: SavedItem = { ...current, ...changes, title: changes.title === undefined ? current.title : cleanText(changes.title, 300) || 'Untitled', url, domain: safeDomain(url), tags, updatedAt: nowIso(), syncState: 'pending', lastError: undefined }
  await db.transaction('rw', db.items, db.tags, db.itemTags, db.searchIndex, db.syncQueue, async () => { await db.items.put(next); await replaceItemTags(id, tags); await updateSearchIndex(next); await replaceQueuedMutation('item', id, 'upsert') })
}
export async function bulkUpdateItems(ids: string[], changes: Partial<Pick<SavedItem, 'collectionId' | 'favorite' | 'archived'>>, addTags: string[] = [], removeTags: string[] = []): Promise<void> {
  for (const id of [...new Set(ids)]) { const item = await db.items.get(id); if (!item || item.deletedAt) continue; const removed = new Set(removeTags.map(normalizedTag)); const tags = normalizeTags([...item.tags.filter((tag) => !removed.has(normalizedTag(tag))), ...addTags]); await updateItem(id, { ...changes, tags }) }
}
export async function deleteItem(id: string): Promise<void> { const item = await db.items.get(id); if (!item) return; const deletedAt = nowIso(); await db.transaction('rw', db.items, db.syncQueue, async () => { await db.items.update(id, { deletedAt, updatedAt: deletedAt, syncState: 'pending' }); await replaceQueuedMutation('item', id, 'delete') }) }
export async function restoreItem(id: string): Promise<void> { const item = await db.items.get(id); if (!item?.deletedAt) return; await db.transaction('rw', db.items, db.syncQueue, async () => { await db.items.update(id, { deletedAt: undefined, updatedAt: nowIso(), syncState: 'pending' }); await replaceQueuedMutation('item', id, 'upsert') }) }
export async function permanentlyDeleteLocalItem(id: string): Promise<void> { await db.transaction('rw', db.items, db.itemTags, db.searchIndex, db.syncQueue, async () => { await db.items.delete(id); await db.itemTags.where('itemId').equals(id).delete(); await db.searchIndex.where('itemId').equals(id).delete(); await db.syncQueue.where('[entityType+entityId]').equals(['item', id]).delete() }) }

export async function createCollection(name: string, color = '#A78BFA', parentId?: string, icon = 'folder'): Promise<Collection> {
  const timestamp = nowIso(), cleanName = cleanText(name, 100); if (!cleanName) throw new Error('Collection name is required.')
  if (parentId && !await db.collections.get(parentId)) throw new Error('Parent collection was not found.')
  const collection: Collection = { id: crypto.randomUUID(), name: cleanName, color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#A78BFA', icon: cleanText(icon, 30) || 'folder', parentId, sortOrder: await db.collections.count(), createdAt: timestamp, updatedAt: timestamp }
  await db.transaction('rw', db.collections, db.syncQueue, async () => { await db.collections.add(collection); await replaceQueuedMutation('collection', collection.id, 'upsert') }); return collection
}
export async function updateCollection(id: string, changes: Partial<Pick<Collection, 'name' | 'color' | 'icon' | 'parentId' | 'sortOrder'>>): Promise<void> {
  const current = await db.collections.get(id); if (!current || current.deletedAt) throw new Error('Collection not found.')
  if (changes.parentId === id) throw new Error('A collection cannot contain itself.')
  let ancestor = changes.parentId
  while (ancestor) { if (ancestor === id) throw new Error('Nested collection cycle detected.'); ancestor = (await db.collections.get(ancestor))?.parentId }
  const next = { ...changes, ...(changes.name !== undefined ? { name: cleanText(changes.name, 100) || current.name } : {}), updatedAt: nowIso() }
  await db.transaction('rw', db.collections, db.syncQueue, async () => { await db.collections.update(id, next); await replaceQueuedMutation('collection', id, 'upsert') })
}
export async function deleteCollection(id: string): Promise<void> { const deletedAt = nowIso(); await db.transaction('rw', db.collections, db.items, db.syncQueue, async () => { const affected = await db.items.where('collectionId').equals(id).primaryKeys(); await db.collections.update(id, { deletedAt, updatedAt: deletedAt }); await db.collections.where('parentId').equals(id).modify({ parentId: undefined, updatedAt: deletedAt }); await db.items.where('collectionId').equals(id).modify({ collectionId: undefined, updatedAt: deletedAt, syncState: 'pending' }); for (const itemId of affected) await replaceQueuedMutation('item', String(itemId), 'upsert'); await replaceQueuedMutation('collection', id, 'delete') }) }

export async function renameTag(tagId: string, name: string): Promise<void> {
  const tag = await db.tags.get(tagId), display = cleanText(name, 50); if (!tag || !display) throw new Error('Tag was not found.')
  const duplicate = await db.tags.where('normalizedName').equals(normalizedTag(display)).first(); if (duplicate && duplicate.id !== tagId) { await mergeTags([tagId], duplicate.id); return }
  const links = await db.itemTags.where('tagId').equals(tagId).toArray(); await db.tags.update(tagId, { name: display, normalizedName: normalizedTag(display) })
  for (const link of links) { const item = await db.items.get(link.itemId); if (item) await updateItem(item.id, { tags: item.tags.map((value) => normalizedTag(value) === tag.normalizedName ? display : value) }) }
}
export async function mergeTags(sourceIds: string[], targetId: string): Promise<void> {
  const target = await db.tags.get(targetId); if (!target) throw new Error('Target tag was not found.')
  const sources = (await db.tags.bulkGet(sourceIds)).filter((tag): tag is TagRecord => Boolean(tag && tag.id !== targetId))
  for (const source of sources) { const links = await db.itemTags.where('tagId').equals(source.id).toArray(); for (const link of links) { const item = await db.items.get(link.itemId); if (item) await updateItem(item.id, { tags: [...item.tags.filter((tag) => normalizedTag(tag) !== source.normalizedName), target.name] }) }; await db.tags.delete(source.id) }
}
export async function deleteTag(tagId: string): Promise<void> { const tag = await db.tags.get(tagId); if (!tag) return; const links = await db.itemTags.where('tagId').equals(tagId).toArray(); for (const link of links) { const item = await db.items.get(link.itemId); if (item) await updateItem(item.id, { tags: item.tags.filter((value) => normalizedTag(value) !== tag.normalizedName) }) }; await db.tags.delete(tagId) }
export async function saveTagRule(rule: Omit<TagRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<TagRule> { const current = rule.id ? await db.tagRules.get(rule.id) : undefined, timestamp = nowIso(); const record: TagRule = { ...rule, id: rule.id || crypto.randomUUID(), name: cleanText(rule.name, 100), value: cleanText(rule.value, 200), tags: normalizeTags(rule.tags), createdAt: current?.createdAt || timestamp, updatedAt: timestamp }; await db.tagRules.put(record); return record }

function checksumSource(bundle: Pick<ExportBundle, 'items' | 'collections' | 'tags' | 'tagRules' | 'savedSearches'>) { return JSON.stringify({ items: bundle.items, collections: bundle.collections, tags: bundle.tags, tagRules: bundle.tagRules, savedSearches: bundle.savedSearches }) }
export async function sha256(value: string): Promise<string> { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('') }
export async function exportLibrary(): Promise<ExportBundle> {
  const partial = { items: await db.items.toArray(), collections: await db.collections.toArray(), tags: await db.tags.toArray(), tagRules: await db.tagRules.toArray(), savedSearches: await db.savedSearches.toArray() }
  const checksum = await sha256(checksumSource(partial))
  return { schemaVersion: 3, appVersion: '2.0.0', backupId: crypto.randomUUID(), exportedAt: nowIso(), ...partial, settings: await getSettings(), integrity: { algorithm: 'SHA-256', checksum, itemCount: partial.items.length, collectionCount: partial.collections.length } }
}
export function validateImport(value: unknown): ExportBundle {
  if (!value || typeof value !== 'object') throw new Error('Invalid JSON backup.')
  const raw = value as Record<string, unknown>
  if (raw.schemaVersion === 2 && Array.isArray(raw.items) && Array.isArray(raw.collections) && Array.isArray(raw.tags) && raw.settings) {
    const settings: ExportBundle['settings'] = { ...(raw.settings as ExportBundle['settings']), smartTagSuggestions: true, recentSearches: [], backupRetention: 5, scheduledBackups: false }
    const collections = (raw.collections as Collection[]).map((collection, index) => ({ ...collection, sortOrder: collection.sortOrder ?? index }))
    return { schemaVersion: 3, appVersion: '1.0.0', backupId: crypto.randomUUID(), exportedAt: String(raw.exportedAt || nowIso()), items: raw.items as SavedItem[], collections, tags: raw.tags as TagRecord[], tagRules: [], savedSearches: [], settings, integrity: { algorithm: 'SHA-256', checksum: '', itemCount: (raw.items as unknown[]).length, collectionCount: collections.length } }
  }
  const bundle = value as Partial<ExportBundle>
  if (bundle.schemaVersion !== 3 || !Array.isArray(bundle.items) || !Array.isArray(bundle.collections) || !Array.isArray(bundle.tags) || !Array.isArray(bundle.tagRules) || !Array.isArray(bundle.savedSearches) || !bundle.settings || !bundle.integrity) throw new Error('Unsupported or incomplete backup file.')
  if (bundle.items.length > 100_000 || bundle.collections.length > 10_000 || bundle.tags.length > 50_000) throw new Error('Backup exceeds safe import limits.')
  if (bundle.items.some((item) => !item?.id || !item.kind || !item.createdAt || !item.updatedAt)) throw new Error('Backup contains invalid item records.')
  if (bundle.items.some((item) => item.imageDataUrl && (item.imageDataUrl.length > 16_000_000 || !/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(item.imageDataUrl)))) throw new Error('Backup contains an invalid or oversized image.')
  if (new Set(bundle.items.map((item) => item.id)).size !== bundle.items.length) throw new Error('Backup contains duplicate item identifiers.')
  return bundle as ExportBundle
}
export async function verifyImport(bundle: ExportBundle): Promise<void> { if (!bundle.integrity.checksum) return; const checksum = await sha256(checksumSource(bundle)); if (checksum !== bundle.integrity.checksum) throw new Error('Backup integrity verification failed. The file may be damaged or modified.') }
export async function importLibrary(input: ExportBundle, mode: RestoreMode = 'merge'): Promise<{ added: number; updated: number; skipped: number }> {
  const bundle = validateImport(input); await verifyImport(bundle); let added = 0, updated = 0, skipped = 0
  await db.transaction('rw', [db.items, db.collections, db.tags, db.itemTags, db.tagRules, db.savedSearches, db.searchIndex, db.syncQueue], async () => {
    if (mode === 'replace') await Promise.all([db.items.clear(), db.collections.clear(), db.tags.clear(), db.itemTags.clear(), db.tagRules.clear(), db.savedSearches.clear(), db.searchIndex.clear(), db.syncQueue.clear()])
    for (const collection of bundle.collections) { const existing = await db.collections.get(collection.id); if (existing && mode === 'missing') { skipped++; continue }; if (existing && mode === 'merge' && existing.updatedAt >= collection.updatedAt) { skipped++; continue }; await db.collections.put({ ...collection, sortOrder: collection.sortOrder ?? 0, driveFileId: existing?.driveFileId || collection.driveFileId }); await replaceQueuedMutation('collection', collection.id, collection.deletedAt ? 'delete' : 'upsert'); if (existing) updated++; else added++ }
    for (const item of bundle.items) { const existing = await db.items.get(item.id); if (existing && mode === 'missing') { skipped++; continue }; if (existing && mode === 'merge' && existing.updatedAt >= item.updatedAt) { skipped++; continue }; const next = { ...item, tags: normalizeTags(item.tags), domain: item.domain || safeDomain(item.url), driveFileId: existing?.driveFileId || item.driveFileId, syncState: 'pending' as const, attempts: 0 }; await db.items.put(next); await replaceItemTags(next.id, next.tags); await updateSearchIndex(next); await replaceQueuedMutation('item', next.id, next.deletedAt ? 'delete' : 'upsert'); if (existing) updated++; else added++ }
    await db.tagRules.bulkPut(bundle.tagRules); await db.savedSearches.bulkPut(bundle.savedSearches)
  })
  return { added, updated, skipped }
}

export function normalizeUrl(value?: string): string { if (!value) return ''; try { const url = new URL(value); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key); url.hostname = url.hostname.toLocaleLowerCase(); url.pathname = url.pathname.replace(/\/$/, '') || '/'; return url.toString() } catch { return value.trim().toLocaleLowerCase() } }
export function duplicateGroups(items: SavedItem[]): SavedItem[][] { const groups = new Map<string, SavedItem[]>(); for (const item of items) { const key = normalizeUrl(item.url); if (!key || item.deletedAt) continue; groups.set(key, [...(groups.get(key) || []), item]) }; return [...groups.values()].filter((group) => group.length > 1) }
