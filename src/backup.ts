import { db, getSettings } from './db'
import { deleteDriveBackup, uploadBackup } from './drive'
import { exportLibrary, importLibrary, validateImport, verifyImport } from './repository'
import type { BackupMetadata, ExportBundle, RestoreMode } from './types'

export interface RestorePreview { items: number; collections: number; newItems: number; updatedItems: number; duplicates: number; schemaVersion: number; createdAt: string }
export async function previewRestore(value: unknown): Promise<{ bundle: ExportBundle; preview: RestorePreview }> {
  const bundle = validateImport(value); await verifyImport(bundle)
  const local = new Map((await db.items.toArray()).map((item) => [item.id, item]))
  let newItems = 0, updatedItems = 0, duplicates = 0
  for (const item of bundle.items) { const existing = local.get(item.id); if (!existing) newItems++; else if (item.updatedAt > existing.updatedAt) updatedItems++; else duplicates++ }
  return { bundle, preview: { items: bundle.items.length, collections: bundle.collections.length, newItems, updatedItems, duplicates, schemaVersion: bundle.schemaVersion, createdAt: bundle.exportedAt } }
}
export async function createDriveBackup(type: BackupMetadata['type'] = 'manual'): Promise<BackupMetadata> {
  const data = await exportLibrary(), settings = await getSettings(), fileId = await uploadBackup(settings, data), json = JSON.stringify(data)
  const record: BackupMetadata = { id: data.backupId, fileId, name: `lilacsave-backup-${data.exportedAt.replace(/[:.]/g, '-')}.json`, createdAt: data.exportedAt, type, location: 'drive', size: new Blob([json]).size, itemCount: data.items.length, checksum: data.integrity.checksum, schemaVersion: data.schemaVersion }
  await db.backupMetadata.put(record)
  if (type === 'scheduled') await enforceScheduledRetention()
  return record
}
async function enforceScheduledRetention() {
  const settings = await getSettings(); if (settings.backupRetention === 'manual') return
  const scheduled = (await db.backupMetadata.where('type').equals('scheduled').toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const record of scheduled.slice(settings.backupRetention)) { if (record.fileId) await deleteDriveBackup(record.fileId); await db.backupMetadata.delete(record.id) }
}
export async function restoreBundle(value: unknown, mode: RestoreMode): Promise<{ added: number; updated: number; skipped: number }> {
  const { bundle } = await previewRestore(value)
  if (mode === 'replace') await createDriveBackup('safety')
  return importLibrary(bundle, mode)
}
