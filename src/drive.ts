import { acquireToken, authorizedFetch } from './auth'
import { db, getSettings } from './db'
import type { Collection, DriveFolders, SavedItem, Settings, SyncQueueEntry } from './types'
import { rebuildItemDerivedData } from './repository'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SUBFOLDERS = { bookmarks: 'Bookmarks', highlights: 'Highlights', notes: 'Notes', images: 'Images', screenshots: 'Screenshots', collections: 'Collections', backups: 'Backups', exports: 'Exports', files: 'Files' } as const

export class DriveApiError extends Error { constructor(message: string, public status: number, public retryAfter?: number) { super(message); this.name = 'DriveApiError' } }
const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
async function checked(response: Response, message: string): Promise<Response> {
  if (response.ok) return response
  const retry = Number(response.headers.get('Retry-After'))
  let detail = ''
  try {
    const payload = await response.clone().json() as { error?: { message?: string; errors?: Array<{ reason?: string }> } }
    const reason = payload.error?.errors?.[0]?.reason
    detail = [reason, payload.error?.message].filter(Boolean).join(': ').slice(0, 280)
  } catch { /* Google did not return a JSON error body. */ }
  throw new DriveApiError(`${message}${detail ? ` — ${detail}` : ''} (${response.status}).`, response.status, Number.isFinite(retry) ? retry : undefined)
}

type FolderMetadata = { id: string; name: string; mimeType: string; trashed: boolean; parents?: string[] }
async function getFolderMetadata(id?: string): Promise<FolderMetadata | undefined> {
  if (!id) return undefined
  try { const response = await authorizedFetch(`${FILES}/${id}?fields=id,name,mimeType,trashed,parents`); if (!response.ok) return undefined; return response.json() as Promise<FolderMetadata> } catch { return undefined }
}
async function verifyFolder(id?: string, parent?: string): Promise<boolean> {
  const file = await getFolderMetadata(id)
  return Boolean(file && file.mimeType === FOLDER_MIME && !file.trashed && (!parent || file.parents?.includes(parent) === true))
}
async function findFolder(name: string, parent?: string): Promise<string | undefined> {
  const clauses = [`name = '${escapeQuery(name)}'`, `mimeType = '${FOLDER_MIME}'`, 'trashed = false']; if (parent) clauses.push(`'${escapeQuery(parent)}' in parents`)
  const response = await checked(await authorizedFetch(`${FILES}?q=${encodeURIComponent(clauses.join(' and '))}&spaces=drive&fields=files(id,createdTime)&orderBy=createdTime&pageSize=20`), 'Could not search Google Drive')
  return ((await response.json()) as { files: { id: string }[] }).files[0]?.id
}
async function createFolder(name: string, parent?: string): Promise<string> {
  const response = await checked(await authorizedFetch(`${FILES}?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }) }), `Could not create ${name}`)
  return ((await response.json()) as { id: string }).id
}
async function ensureFolder(name: string, knownId?: string, parent?: string) { if (await verifyFolder(knownId, parent)) return knownId!; return await findFolder(name, parent) ?? await createFolder(name, parent) }
export async function ensureManagedDriveFolder(name: string, parent: string, knownId?: string): Promise<string> { return ensureFolder(name, knownId, parent) }
async function renameFolder(id: string, name: string) { await checked(await authorizedFetch(`${FILES}/${id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }), `Could not rename Drive folder to ${name}`) }
async function ensureRootFolder(name: string, knownId?: string) {
  const known = await getFolderMetadata(knownId)
  if (known && known.mimeType === FOLDER_MIME && !known.trashed) { if (known.name !== name) await renameFolder(known.id, name); return known.id }
  const current = await findFolder(name)
  if (current) return current
  for (const legacyName of ['Lilac Save', 'Smart Library', 'LilacSave_user']) {
    if (legacyName === name) continue
    const legacy = await findFolder(legacyName)
    if (legacy) { await renameFolder(legacy, name); return legacy }
  }
  return createFolder(name)
}

export async function ensureDriveStructure(interactive = false): Promise<DriveFolders> {
  if (interactive) await acquireToken(true)
  const settings = await getSettings(), root = await ensureRootFolder(settings.driveFolderName, settings.driveFolders.root)
  const folders: DriveFolders = { root }
  for (const [key, name] of Object.entries(SUBFOLDERS) as Array<[keyof typeof SUBFOLDERS, string]>) folders[key] = await ensureFolder(name, settings.driveFolders[key], root)
  await db.settings.put({ ...settings, driveFolders: folders })
  await ensureSystemFile('library-index.json', root, { schemaVersion: 3, app: 'LilacSave', updatedAt: new Date().toISOString(), items: [] })
  await ensureSystemFile('settings.json', root, { schemaVersion: 3, app: 'LilacSave', folderStructure: Object.values(SUBFOLDERS) })
  return folders
}

async function findAppFile(entityId: string, parent: string): Promise<string | undefined> {
  const q = `'${escapeQuery(parent)}' in parents and trashed = false and appProperties has { key='lilacsaveId' and value='${escapeQuery(entityId)}' }`
  const response = await checked(await authorizedFetch(`${FILES}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10`), 'Could not find existing file')
  return ((await response.json()) as { files: { id: string }[] }).files[0]?.id
}
async function findNamedFile(name: string, parent: string): Promise<string | undefined> {
  const q = `name = '${escapeQuery(name)}' and '${escapeQuery(parent)}' in parents and trashed = false`
  const response = await checked(await authorizedFetch(`${FILES}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id)&pageSize=10`), 'Could not find library metadata')
  return ((await response.json()) as { files: { id: string }[] }).files[0]?.id
}
async function multipart(metadata: Record<string, unknown>, data: unknown, fileId?: string): Promise<string> {
  const boundary = `lilacsave_${crypto.randomUUID()}`
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data, null, 2)}\r\n--${boundary}--`
  const endpoint = fileId ? `${UPLOAD}/${fileId}?uploadType=multipart&fields=id` : `${UPLOAD}?uploadType=multipart&fields=id`
  const response = await checked(await authorizedFetch(endpoint, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }), 'Google Drive upload failed')
  return ((await response.json()) as { id: string }).id
}
async function multipartText(metadata: Record<string, unknown>, data: string): Promise<string> {
  const boundary = `lilacsave_${crypto.randomUUID()}`
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${data}\r\n--${boundary}--`
  const response = await checked(await authorizedFetch(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }), 'Google Drive export failed')
  return ((await response.json()) as { id: string }).id
}
async function ensureSystemFile(name: string, root: string, data: unknown) { const fileId = await findNamedFile(name, root); await multipart({ name, mimeType: 'application/json', ...(fileId ? {} : { parents: [root] }), appProperties: { lilacsaveSystem: 'true' } }, data, fileId) }
const itemFolder = (item: SavedItem, folders: DriveFolders) => item.kind === 'bookmark' || item.kind === 'link' ? folders.bookmarks! : item.kind === 'selection' || item.kind === 'text' ? folders.highlights! : item.kind === 'image' ? folders.images! : item.kind === 'screenshot' ? folders.screenshots! : folders.notes!
const safeName = (title: string, id: string) => `${title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 70) || 'Untitled'} - ${id.slice(0, 8)}.json`

export async function pushQueueEntry(entry: SyncQueueEntry, folders: DriveFolders): Promise<void> {
  if (entry.entityType === 'item') {
    const item = await db.items.get(entry.entityId); if (!item) { await db.syncQueue.delete(entry.id); return }
    if (entry.operation === 'delete' || item.deletedAt) { const parent = itemFolder(item, folders), existing = item.driveFileId ?? await findAppFile(item.id, parent); const driveFileId = await multipart({ name: safeName(`Deleted ${item.kind}`, item.id), mimeType: 'application/json', ...(existing ? {} : { parents: [parent] }), appProperties: { lilacsaveId: item.id, entityType: 'item', tombstone: 'true' } }, { schemaVersion: 3, entityType: 'item', id: item.id, kind: item.kind, deletedAt: item.deletedAt ?? new Date().toISOString(), updatedAt: item.updatedAt }, existing); await db.items.update(item.id, { driveFileId, syncState: 'synced', lastError: undefined }); await db.syncQueue.delete(entry.id); return }
    const parent = itemFolder(item, folders), existing = item.driveFileId ?? await findAppFile(item.id, parent)
    const driveFileId = await multipart({ name: safeName(item.title, item.id), mimeType: 'application/json', ...(existing ? {} : { parents: [parent] }), appProperties: { lilacsaveId: item.id, entityType: 'item', kind: item.kind } }, { schemaVersion: 3, entityType: 'item', ...item, syncState: undefined, lastError: undefined, attempts: undefined, driveFileId: undefined }, existing)
    await db.items.update(item.id, { driveFileId, syncState: 'synced', attempts: 0, lastError: undefined }); await db.syncQueue.delete(entry.id); return
  }
  const collection = await db.collections.get(entry.entityId); if (!collection) { await db.syncQueue.delete(entry.id); return }
  if (entry.operation === 'delete' || collection.deletedAt) { const parent = folders.collections!, existing = collection.driveFileId ?? await findAppFile(collection.id, parent); const driveFileId = await multipart({ name: safeName('Deleted collection', collection.id), mimeType: 'application/json', ...(existing ? {} : { parents: [parent] }), appProperties: { lilacsaveId: collection.id, entityType: 'collection', tombstone: 'true' } }, { schemaVersion: 3, entityType: 'collection', id: collection.id, deletedAt: collection.deletedAt ?? new Date().toISOString(), updatedAt: collection.updatedAt }, existing); await db.collections.update(collection.id, { driveFileId }); await db.syncQueue.delete(entry.id); return }
  const parent = folders.collections!, existing = collection.driveFileId ?? await findAppFile(collection.id, parent)
  const driveFileId = await multipart({ name: safeName(collection.name, collection.id), mimeType: 'application/json', ...(existing ? {} : { parents: [parent] }), appProperties: { lilacsaveId: collection.id, entityType: 'collection' } }, { schemaVersion: 3, entityType: 'collection', ...collection, driveFileId: undefined }, existing)
  await db.collections.update(collection.id, { driveFileId }); await db.syncQueue.delete(entry.id)
}

async function listRemote(parent: string): Promise<Array<{ id: string; appProperties?: Record<string, string> }>> {
  const q = `'${escapeQuery(parent)}' in parents and trashed = false`
  const response = await checked(await authorizedFetch(`${FILES}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,appProperties)&pageSize=1000`), 'Could not download remote library')
  return ((await response.json()) as { files: Array<{ id: string; appProperties?: Record<string, string> }> }).files.filter((file) => file.appProperties?.lilacsaveId)
}
async function downloadJson<T>(id: string): Promise<T> { const response = await checked(await authorizedFetch(`${FILES}/${id}?alt=media`), 'Could not read remote item'); return response.json() as Promise<T> }

export async function pullRemoteChanges(folders: DriveFolders): Promise<number> {
  let downloaded = 0
  for (const parent of [folders.bookmarks!, folders.highlights!, folders.notes!, folders.images!, folders.screenshots!]) {
    for (const remote of await listRemote(parent)) {
      const data = await downloadJson<SavedItem & { schemaVersion?: number; entityType?: string }>(remote.id); if (!data.id || data.entityType !== 'item') continue
      const local = await db.items.get(data.id)
      if (data.deletedAt) { if (local && data.updatedAt > local.updatedAt) { await db.items.update(local.id, { deletedAt: data.deletedAt, updatedAt: data.updatedAt, driveFileId: remote.id, syncState: 'synced' }); await db.syncQueue.where('[entityType+entityId]').equals(['item', local.id]).delete(); downloaded++ }; continue }
      if (!local) { const next = { ...data, driveFileId: remote.id, syncState: 'synced' as const, attempts: 0 }; await db.items.put(next); await rebuildItemDerivedData(next); downloaded++; continue }
      if (new Date(data.updatedAt).getTime() <= new Date(local.updatedAt).getTime()) continue
      const queued = await db.syncQueue.where('[entityType+entityId]').equals(['item', local.id]).first()
      if (queued) { const conflictId = crypto.randomUUID(); await db.items.add({ ...data, id: conflictId, title: `${data.title} (Conflict copy)`, driveFileId: undefined, conflictCopy: true, syncState: 'conflict', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attempts: 0 }); continue }
      const next = { ...data, driveFileId: remote.id, syncState: 'synced' as const, attempts: 0 }; await db.items.put(next); await rebuildItemDerivedData(next); downloaded++
    }
  }
  for (const remote of await listRemote(folders.collections!)) { const data = await downloadJson<Collection & { entityType?: string }>(remote.id); if (!data.id || data.entityType !== 'collection') continue; const local = await db.collections.get(data.id); if (data.deletedAt) { if (local && data.updatedAt > local.updatedAt) { await db.collections.update(local.id, { deletedAt: data.deletedAt, updatedAt: data.updatedAt, driveFileId: remote.id }); await db.syncQueue.where('[entityType+entityId]').equals(['collection', local.id]).delete(); downloaded++ }; continue }; if (!local || data.updatedAt > local.updatedAt) { await db.collections.put({ ...data, sortOrder: data.sortOrder ?? 0, driveFileId: remote.id }); downloaded++ } }
  return downloaded
}

export async function updateLibraryIndex(folders: DriveFolders) {
  const items = (await db.items.filter((item) => !item.deletedAt).toArray()).map(({ id, kind, title, domain, tags, collectionId, favorite, archived, createdAt, updatedAt, driveFileId }) => ({ id, kind, title, domain, tags, collectionId, favorite, archived, createdAt, updatedAt, driveFileId }))
  await ensureSystemFile('library-index.json', folders.root!, { schemaVersion: 3, app: 'LilacSave', updatedAt: new Date().toISOString(), items })
}

export async function uploadBackup(settings: Settings, data: unknown): Promise<string> {
  const folders = settings.driveFolders.backups ? settings.driveFolders : await ensureDriveStructure(true), stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return multipart({ name: `lilacsave-backup-${stamp}.json`, mimeType: 'application/json', parents: [folders.backups!], appProperties: { lilacsaveBackup: 'true' } }, data)
}

export interface DriveBackup { id: string; name: string; createdTime: string; size?: string }
export async function listDriveBackups(): Promise<DriveBackup[]> {
  const folders = await ensureDriveStructure(true), q = `'${escapeQuery(folders.backups!)}' in parents and trashed = false`
  const response = await checked(await authorizedFetch(`${FILES}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,createdTime,size)&orderBy=createdTime%20desc&pageSize=20`), 'Could not list backups')
  return ((await response.json()) as { files: DriveBackup[] }).files
}
export async function downloadBackup(id: string): Promise<unknown> { return downloadJson<unknown>(id) }
export async function downloadLatestBackup(): Promise<unknown> {
  const file = (await listDriveBackups())[0]; if (!file) throw new Error('No Google Drive backup was found.')
  return downloadBackup(file.id)
}
export async function uploadMarkdownExport(name: string, markdown: string): Promise<string> { const folders = await ensureDriveStructure(true); return multipartText({ name, mimeType: 'text/markdown', parents: [folders.exports!], appProperties: { lilacsaveExport: 'true' } }, markdown) }
export async function deleteDriveBackup(id: string): Promise<void> { await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Could not delete backup') }
