import { acquireToken, authorizedFetch } from './auth'
import { db } from './db'
import { ensureDriveStructure, ensureManagedDriveFolder, DriveApiError } from './drive'
import { sanitizeFileName, UPLOAD_CHUNK_SIZE } from './fileManager'
import type { ShareRole, SharingMetadata } from './types'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

async function checked(response: Response, message: string): Promise<Response> {
  if (response.ok) return response
  let detail = ''
  try { detail = ((await response.clone().json()) as { error?: { message?: string } }).error?.message ?? '' } catch { /* no JSON */ }
  throw new DriveApiError(`${message}${detail ? ` — ${detail}` : ''} (${response.status}).`, response.status)
}

export interface DriveFileMetadata { id: string; name: string; mimeType: string; size?: string; parents?: string[]; webViewLink?: string; createdTime?: string; modifiedTime?: string; shared?: boolean }
export interface UploadHooks { onProgress?: (uploaded: number, total: number) => void; onSession?: (url: string) => void; signal?: AbortSignal }
export interface ShareableDriveEntry { id: string; name: string; driveFileId?: string; webViewLink?: string; entityType?: 'file' | 'folder' }

async function updateShareable(entry: Pick<ShareableDriveEntry, 'id' | 'entityType'>, changes: { shared?: boolean; webViewLink?: string; updatedAt: string }) {
  if (entry.entityType === 'folder') await db.managedFolders.update(entry.id, changes)
  else await db.managedFiles.update(entry.id, changes)
}

export async function ensureFilesRoot(interactive = true): Promise<string> { return (await ensureDriveStructure(interactive)).files! }

export async function createDriveFolder(name: string, parentDriveId?: string): Promise<string> {
  const parent = parentDriveId ?? await ensureFilesRoot(true)
  return ensureManagedDriveFolder(sanitizeFileName(name), parent)
}

export async function findDuplicateFile(name: string, parentDriveId: string): Promise<DriveFileMetadata | undefined> {
  const q = `name = '${escapeQuery(name)}' and '${escapeQuery(parentDriveId)}' in parents and trashed = false`
  const response = await checked(await authorizedFetch(`${FILES}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,mimeType,size,parents,webViewLink,createdTime,modifiedTime,shared)&pageSize=10`), 'Could not check for duplicate files')
  return ((await response.json()) as { files: DriveFileMetadata[] }).files[0]
}

async function startResumableUpload(file: File, name: string, parentDriveId: string, managedId: string): Promise<string> {
  const response = await checked(await authorizedFetch(`${UPLOAD}?uploadType=resumable&fields=id,name,mimeType,size,parents,webViewLink,createdTime,modifiedTime,shared`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': file.type || 'application/octet-stream', 'X-Upload-Content-Length': String(file.size) },
    body: JSON.stringify({ name, mimeType: file.type || 'application/octet-stream', parents: [parentDriveId], appProperties: { lilacsaveFileId: managedId, managedBy: 'LilacSave' } }),
  }, true), 'Could not start the Google Drive upload')
  const location = response.headers.get('Location')
  if (!location) throw new Error('Google Drive did not return a resumable upload session.')
  return location
}

type ChunkResult = { complete: boolean; uploaded: number; metadata?: DriveFileMetadata }
async function sendChunk(sessionUrl: string, blob: Blob, start: number, total: number, token: string, hooks: UploadHooks): Promise<ChunkResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(), end = start + blob.size - 1
    const abort = () => xhr.abort()
    hooks.signal?.addEventListener('abort', abort, { once: true })
    xhr.open('PUT', sessionUrl)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream')
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${total}`)
    xhr.upload.onprogress = (event) => hooks.onProgress?.(Math.min(start + event.loaded, total), total)
    xhr.onerror = () => reject(new Error('The network interrupted the upload.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'))
    xhr.onload = () => {
      hooks.signal?.removeEventListener('abort', abort)
      if (xhr.status === 200 || xhr.status === 201) { try { resolve({ complete: true, uploaded: total, metadata: JSON.parse(xhr.responseText) as DriveFileMetadata }) } catch { reject(new Error('Google Drive returned invalid upload metadata.')) }; return }
      if (xhr.status === 308) { const range = xhr.getResponseHeader('Range'), uploaded = range ? Number(range.match(/-(\d+)$/)?.[1] ?? end) + 1 : end + 1; resolve({ complete: false, uploaded }); return }
      reject(new DriveApiError(`Google Drive upload failed (${xhr.status}).`, xhr.status))
    }
    xhr.send(blob)
  })
}

export async function uploadFileResumable(file: File, parentDriveId: string, managedId: string, hooks: UploadHooks = {}, existingSession?: string): Promise<DriveFileMetadata> {
  const name = sanitizeFileName(file.name), sessionUrl = existingSession ?? await startResumableUpload(file, name, parentDriveId, managedId)
  if (!existingSession) hooks.onSession?.(sessionUrl)
  let offset = 0, failures = 0
  while (offset < file.size) {
    if (hooks.signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError')
    try {
      const token = await acquireToken(true), chunk = file.slice(offset, Math.min(offset + UPLOAD_CHUNK_SIZE, file.size), file.type || 'application/octet-stream')
      const result = await sendChunk(sessionUrl, chunk, offset, file.size, token, hooks)
      if (result.complete && result.metadata) { hooks.onProgress?.(file.size, file.size); return result.metadata }
      offset = result.uploaded; failures = 0
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (++failures > 3) throw error
      await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** failures))
    }
  }
  throw new Error('The upload session ended before Google Drive confirmed the file.')
}

export async function listDriveFiles(parentDriveId: string): Promise<DriveFileMetadata[]> {
  const q = `'${escapeQuery(parentDriveId)}' in parents and trashed = false`
  const response = await checked(await authorizedFetch(`${FILES}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,mimeType,size,parents,webViewLink,createdTime,modifiedTime,shared)&orderBy=folder,name_natural&pageSize=1000`, {}, true), 'Could not list files')
  return ((await response.json()) as { files: DriveFileMetadata[] }).files
}
export async function renameDriveEntry(id: string, name: string): Promise<DriveFileMetadata> {
  const response = await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(id)}?fields=id,name,mimeType,size,parents,webViewLink,createdTime,modifiedTime,shared`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: sanitizeFileName(name) }) }, true), 'Could not rename the Drive item')
  return response.json() as Promise<DriveFileMetadata>
}
export async function moveDriveEntry(id: string, newParentId: string, oldParentId?: string): Promise<DriveFileMetadata> {
  const params = new URLSearchParams({ addParents: newParentId, fields: 'id,name,mimeType,size,parents,webViewLink,createdTime,modifiedTime,shared' }); if (oldParentId) params.set('removeParents', oldParentId)
  const response = await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(id)}?${params}`, { method: 'PATCH' }, true), 'Could not move the Drive item')
  return response.json() as Promise<DriveFileMetadata>
}
export async function trashDriveEntry(id: string): Promise<void> { await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(id)}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }, true), 'Could not move the Drive item to trash') }
export async function fetchDriveBlob(id: string): Promise<Blob> { return (await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(id)}?alt=media`, {}, true), 'Could not download the file')).blob() }

export async function getOfficialLink(driveFileId: string): Promise<string | undefined> {
  const response = await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(driveFileId)}?fields=webViewLink`, {}, true), 'Could not retrieve the Drive link')
  return ((await response.json()) as { webViewLink?: string }).webViewLink
}
export async function createPermission(file: ShareableDriveEntry, type: 'anyone' | 'user', role: ShareRole, emailAddress?: string): Promise<SharingMetadata> {
  if (!file.driveFileId) throw new Error('Upload the file before sharing it.')
  if (type === 'user' && (!emailAddress?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress.trim()))) throw new Error('Enter a valid recipient email address.')
  const params = new URLSearchParams({ fields: 'id,type,role,emailAddress,displayName,photoLink,allowFileDiscovery', supportsAllDrives: 'true' }); if (type === 'user') params.set('sendNotificationEmail', 'true')
  const response = await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(file.driveFileId)}/permissions?${params}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, role, ...(type === 'user' ? { emailAddress: emailAddress!.trim() } : {}) }) }, true), 'Could not update sharing')
  const permission = await response.json() as { id: string; type: 'anyone' | 'user'; role: ShareRole; emailAddress?: string; displayName?: string; photoLink?: string; allowFileDiscovery?: boolean }, now = new Date().toISOString(), webViewLink = await getOfficialLink(file.driveFileId)
  const metadata: SharingMetadata = { id: `${file.id}:${permission.id}`, fileId: file.id, driveFileId: file.driveFileId, permissionId: permission.id, type: permission.type, entityType: file.entityType ?? 'file', role: permission.role, emailAddress: permission.emailAddress, displayName: permission.displayName, photoLink: permission.photoLink, allowFileDiscovery: permission.allowFileDiscovery, webViewLink, createdAt: now, updatedAt: now }
  await db.sharingMetadata.put(metadata); await updateShareable(file, { shared: true, webViewLink, updatedAt: now })
  return metadata
}
export async function revokePermission(permission: SharingMetadata): Promise<void> {
  if (permission.role === 'owner') throw new Error('The file owner cannot be removed.')
  if (permission.permissionId) await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(permission.driveFileId)}/permissions/${encodeURIComponent(permission.permissionId)}`, { method: 'DELETE' }, true), 'Could not revoke sharing')
  await db.sharingMetadata.delete(permission.id)
  const remaining = await db.sharingMetadata.where('fileId').equals(permission.fileId).filter((entry) => entry.role !== 'owner').count()
  if (!remaining) await updateShareable({ id: permission.fileId, entityType: permission.entityType }, { shared: false, updatedAt: new Date().toISOString() })
}
export async function updatePermissionRole(permission: SharingMetadata, role: ShareRole): Promise<SharingMetadata> {
  if (!permission.permissionId) throw new Error('The Drive permission identifier is missing.')
  if (permission.role === 'owner') throw new Error('The owner role cannot be changed here.')
  const response = await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(permission.driveFileId)}/permissions/${encodeURIComponent(permission.permissionId)}?fields=id,type,role,emailAddress,displayName,photoLink,allowFileDiscovery&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) }, true), 'Could not change the permission role')
  const remote = await response.json() as { id: string; type: SharingMetadata['type']; role: ShareRole; emailAddress?: string; displayName?: string; photoLink?: string; allowFileDiscovery?: boolean }
  const next: SharingMetadata = { ...permission, ...remote, id: permission.id, permissionId: remote.id, updatedAt: new Date().toISOString() }; await db.sharingMetadata.put(next); return next
}
export async function refreshDrivePermissions(file: ShareableDriveEntry): Promise<SharingMetadata[]> {
  if (!file.driveFileId) throw new Error('Upload the file before managing sharing.')
  const response = await checked(await authorizedFetch(`${FILES}/${encodeURIComponent(file.driveFileId)}/permissions?fields=permissions(id,type,role,emailAddress,displayName,photoLink,allowFileDiscovery)&supportsAllDrives=true`, {}, true), 'Could not refresh Drive permissions')
  const remote = (await response.json()) as { permissions: Array<{ id: string; type: SharingMetadata['type']; role: SharingMetadata['role']; emailAddress?: string; displayName?: string; photoLink?: string; allowFileDiscovery?: boolean }> }
  const now = new Date().toISOString(), webViewLink = await getOfficialLink(file.driveFileId)
  const records = remote.permissions.map((permission): SharingMetadata => ({ id: `${file.id}:${permission.id}`, fileId: file.id, driveFileId: file.driveFileId!, permissionId: permission.id, type: permission.type, entityType: file.entityType ?? 'file', role: permission.role, emailAddress: permission.emailAddress, displayName: permission.displayName, photoLink: permission.photoLink, allowFileDiscovery: permission.allowFileDiscovery, webViewLink, createdAt: now, updatedAt: now }))
  const shared = records.some((permission) => permission.role !== 'owner')
  await db.sharingMetadata.where('fileId').equals(file.id).delete(); if (records.length) await db.sharingMetadata.bulkPut(records); await updateShareable(file, { shared, webViewLink, updatedAt: now })
  return records
}
export async function listPermissions(fileId: string): Promise<SharingMetadata[]> { return db.sharingMetadata.where('fileId').equals(fileId).toArray() }
export { FOLDER_MIME }
