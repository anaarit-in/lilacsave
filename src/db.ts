import Dexie, { type EntityTable } from 'dexie'
import type { BackupMetadata, Collection, ItemTag, ManagedFile, ManagedFolder, SavedItem, SavedSearch, SearchIndexRecord, Settings, SharingMetadata, SyncMetadata, SyncQueueEntry, TagRecord, TagRule, UploadQueueRecord } from './types'
import { resolveUserFolderName } from './folderName'

export const db = new Dexie('LilacSaveDB') as Dexie & {
  items: EntityTable<SavedItem, 'id'>; collections: EntityTable<Collection, 'id'>; tags: EntityTable<TagRecord, 'id'>
  itemTags: EntityTable<ItemTag, 'id'>; tagRules: EntityTable<TagRule, 'id'>; savedSearches: EntityTable<SavedSearch, 'id'>
  searchIndex: EntityTable<SearchIndexRecord, 'id'>; backupMetadata: EntityTable<BackupMetadata, 'id'>
  syncQueue: EntityTable<SyncQueueEntry, 'id'>; syncMetadata: EntityTable<SyncMetadata, 'id'>; settings: EntityTable<Settings, 'id'>
  managedFiles: EntityTable<ManagedFile, 'id'>; managedFolders: EntityTable<ManagedFolder, 'id'>
  uploadQueue: EntityTable<UploadQueueRecord, 'id'>; sharingMetadata: EntityTable<SharingMetadata, 'id'>
}
db.version(1).stores({ items: 'id, kind, syncState, createdAt, updatedAt, *tags', settings: 'id' })
db.version(2).stores({
  items: 'id, kind, syncState, createdAt, updatedAt, domain, collectionId, favorite, archived, deletedAt, *tags', collections: 'id, name, updatedAt, deletedAt',
  tags: 'id, &normalizedName, name', syncQueue: 'id, [entityType+entityId], nextAttemptAt, operation', syncMetadata: 'id, status', settings: 'id',
}).upgrade(async (tx) => tx.table('items').toCollection().modify((item: SavedItem) => { item.favorite = Boolean(item.favorite); item.archived = Boolean(item.archived); item.domain = safeDomain(item.url) }))
db.version(3).stores({
  items: 'id, kind, syncState, createdAt, updatedAt, domain, collectionId, favorite, archived, deletedAt, *tags',
  collections: 'id, name, parentId, sortOrder, updatedAt, deletedAt', tags: 'id, &normalizedName, name',
  itemTags: 'id, &[itemId+tagId], itemId, tagId', tagRules: 'id, name, enabled', savedSearches: 'id, name, lastUsedAt',
  searchIndex: 'id, &itemId, updatedAt', backupMetadata: 'id, createdAt, type, location',
  syncQueue: 'id, [entityType+entityId], nextAttemptAt, operation', syncMetadata: 'id, status', settings: 'id',
}).upgrade(async (tx) => {
  await tx.table('collections').toCollection().modify((collection: Collection) => { collection.sortOrder = Number.isFinite(collection.sortOrder) ? collection.sortOrder : 0 })
  const tags = await tx.table('tags').toArray() as TagRecord[]
  const byName = new Map(tags.map((tag) => [tag.normalizedName, tag]))
  const items = await tx.table('items').toArray() as SavedItem[]
  for (const item of items) {
    const terms = indexTerms(item)
    await tx.table('searchIndex').put({ id: item.id, itemId: item.id, terms, updatedAt: item.updatedAt })
    for (const name of item.tags) { const tag = byName.get(name.toLocaleLowerCase()); if (tag) await tx.table('itemTags').put({ id: `${item.id}:${tag.id}`, itemId: item.id, tagId: tag.id }) }
  }
})
db.version(4).stores({
  items: 'id, kind, syncState, createdAt, updatedAt, domain, collectionId, favorite, archived, deletedAt, *tags',
  collections: 'id, name, parentId, sortOrder, updatedAt, deletedAt', tags: 'id, &normalizedName, name',
  itemTags: 'id, &[itemId+tagId], itemId, tagId', tagRules: 'id, name, enabled', savedSearches: 'id, name, lastUsedAt',
  searchIndex: 'id, &itemId, updatedAt', backupMetadata: 'id, createdAt, type, location',
  syncQueue: 'id, [entityType+entityId], nextAttemptAt, operation', syncMetadata: 'id, status', settings: 'id',
  managedFiles: 'id, driveFileId, parentFolderId, name, mimeType, status, shared, createdAt, updatedAt, deletedAt',
  managedFolders: 'id, driveFolderId, parentId, name, relativePath, shared, createdAt, updatedAt, deletedAt',
  uploadQueue: 'id, fileId, parentFolderId, status, createdAt, updatedAt',
  sharingMetadata: 'id, fileId, driveFileId, type, role, emailAddress, updatedAt',
})

export const defaultSettings: Settings = { id: 'settings', driveFolderName: 'LilacSave_user', driveFolders: {}, autoSync: true, theme: 'system', smartTagSuggestions: true, recentSearches: [], backupRetention: 5, scheduledBackups: false }
export const defaultSyncMetadata: SyncMetadata = { id: 'sync', status: 'idle' }
export function safeDomain(url?: string): string | undefined { if (!url) return undefined; try { return new URL(url).hostname.replace(/^www\./, '') } catch { return undefined } }
export function indexTerms(item: Pick<SavedItem, 'title' | 'url' | 'domain' | 'content' | 'note' | 'tags'>): string { return [item.title, item.url, item.domain, item.content, item.note, ...item.tags].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase() }
export async function getSettings(): Promise<Settings> { const saved = await db.settings.get('settings'), driveFolderName = await resolveUserFolderName(); if (saved) { const migrated = { ...defaultSettings, ...saved, driveFolderName, driveFolders: saved.driveFolders ?? {} }; await db.settings.put(migrated); return migrated }; const settings = { ...defaultSettings, driveFolderName }; await db.settings.put(settings); return settings }
export async function getSyncMetadata(): Promise<SyncMetadata> { const saved = await db.syncMetadata.get('sync'); if (saved) return saved; await db.syncMetadata.put(defaultSyncMetadata); return defaultSyncMetadata }
