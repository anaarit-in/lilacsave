import type { ManagedFile, ManagedFolder } from './types'

export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024
export const RESUMABLE_THRESHOLD = 5 * 1024 * 1024
export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024
const blockedExtensions = new Set(['exe', 'dll', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'js', 'jar', 'apk'])

export function sanitizeFileName(value: string): string {
  const printable = Array.from(value, (character) => character.charCodeAt(0) < 32 ? '-' : character).join('')
  const cleaned = printable.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
  return (cleaned || 'Untitled').slice(0, 180)
}
export function fileExtension(name: string): string { const match = name.toLowerCase().match(/\.([a-z0-9]{1,12})$/); return match?.[1] ?? '' }
export function validateUpload(file: Pick<File, 'name' | 'size'>): string | undefined {
  if (!file.name.trim()) return 'The file name is empty.'
  if (file.size <= 0) return 'Empty files cannot be uploaded.'
  if (file.size > MAX_FILE_SIZE) return 'Files larger than 5 GB are not supported.'
  if (blockedExtensions.has(fileExtension(file.name))) return 'Executable and script files are blocked for safety.'
  return undefined
}
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB'], index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : bytes / 1024 ** index >= 10 ? 1 : 2)} ${units[index]}`
}
export function fileCategory(file: Pick<ManagedFile, 'mimeType' | 'name'>): 'image' | 'document' | 'archive' | 'other' {
  if (file.mimeType.startsWith('image/')) return 'image'
  if (/^(text\/|application\/(pdf|json|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml))/.test(file.mimeType)) return 'document'
  if (/zip|archive|compressed|tar|gzip|rar|7z/.test(file.mimeType) || /\.(zip|rar|7z|tar|gz)$/i.test(file.name)) return 'archive'
  return 'other'
}
export function canPreview(file: Pick<ManagedFile, 'mimeType' | 'name'>): boolean {
  return file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/') || /\.(md|json|csv|log)$/i.test(file.name)
}
export function buildFolderPath(folders: ManagedFolder[], folderId?: string): ManagedFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder])), path: ManagedFolder[] = []
  let current = folderId ? byId.get(folderId) : undefined, guard = 0
  while (current && guard++ < 100) { path.unshift(current); current = current.parentId ? byId.get(current.parentId) : undefined }
  return path
}
export function uniqueFileName(name: string, existing: Iterable<string>): string {
  const names = new Set(Array.from(existing, (value) => value.toLocaleLowerCase()))
  if (!names.has(name.toLocaleLowerCase())) return name
  const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, extension = dot > 0 ? name.slice(dot) : ''
  let index = 2, candidate = `${base} (${index})${extension}`
  while (names.has(candidate.toLocaleLowerCase())) candidate = `${base} (${++index})${extension}`
  return candidate
}
