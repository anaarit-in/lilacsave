import { AuthenticationRequiredError } from './auth'
import { db, getSyncMetadata } from './db'
import { DriveApiError, ensureDriveStructure, pullRemoteChanges, pushQueueEntry, updateLibraryIndex } from './drive'

let activeSync: Promise<SyncResult> | undefined
export interface SyncResult { uploaded: number; downloaded: number; failed: number }
function retryDelay(attempts: number, retryAfter?: number) { if (retryAfter) return retryAfter * 1000; const base = Math.min(21_600_000, 2 ** Math.min(attempts, 12) * 1000); return base + Math.floor(Math.random() * Math.min(base * .2, 30_000)) }
async function runSync(interactive: boolean): Promise<SyncResult> {
  const metadata = await getSyncMetadata(), started = new Date().toISOString(); await db.syncMetadata.put({ ...metadata, status: 'syncing', lastAttemptAt: started, lastError: undefined })
  let uploaded = 0, failed = 0, downloaded = 0
  try {
    const folders = await ensureDriveStructure(interactive); downloaded = await pullRemoteChanges(folders)
    const due = await db.syncQueue.where('nextAttemptAt').belowOrEqual(new Date().toISOString()).sortBy('createdAt')
    for (const entry of due) try { if (entry.entityType === 'item') await db.items.update(entry.entityId, { syncState: 'syncing' }); await pushQueueEntry(entry, folders); uploaded++ } catch (error) {
      const attempts = entry.attempts + 1, message = error instanceof Error ? error.message : 'Unknown synchronization failure', retryAfter = error instanceof DriveApiError ? error.retryAfter : undefined
      await db.syncQueue.update(entry.id, { attempts, lastError: message, nextAttemptAt: new Date(Date.now() + retryDelay(attempts, retryAfter)).toISOString() }); if (entry.entityType === 'item') await db.items.update(entry.entityId, { syncState: 'failed', lastError: message, attempts }); failed++; if (error instanceof AuthenticationRequiredError) throw error
    }
    await updateLibraryIndex(folders)
    const completed = new Date().toISOString(); await db.syncMetadata.put({ id: 'sync', status: failed ? 'error' : 'idle', lastAttemptAt: started, lastSuccessfulSyncAt: completed, lastError: failed ? `${failed} change(s) will retry automatically.` : undefined }); await db.settings.update('settings', { lastSyncAt: completed }); return { uploaded, downloaded, failed }
  } catch (error) { const offline = typeof navigator !== 'undefined' && !navigator.onLine; await db.syncMetadata.put({ ...metadata, id: 'sync', status: offline ? 'offline' : 'error', lastAttemptAt: started, lastError: error instanceof Error ? error.message : 'Synchronization failed.' }); throw error }
}
export function syncLibrary(interactive = false): Promise<SyncResult> { if (!activeSync) activeSync = runSync(interactive).finally(() => { activeSync = undefined }); return activeSync }
