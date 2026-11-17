export type SaveKind = 'bookmark' | 'selection' | 'link' | 'note' | 'text' | 'image' | 'screenshot'
export type SyncState = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'
export type ThemePreference = 'light' | 'dark' | 'system'
export type RestoreMode = 'merge' | 'missing' | 'replace'
export type BackupRetention = 5 | 10 | 'manual'
export type ManagedFileStatus = 'local' | 'queued' | 'uploading' | 'synced' | 'failed' | 'cancelled'
export type UploadStatus = 'queued' | 'preparing' | 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type ShareRole = 'reader' | 'commenter' | 'writer'

export interface SavedItem {
  id: string; kind: SaveKind; title: string; url?: string; domain?: string; content?: string; note?: string; markdown?: boolean; imageUrl?: string; imageDataUrl?: string
  tags: string[]; collectionId?: string; createdAt: string; updatedAt: string; syncState: SyncState; driveFileId?: string
  lastError?: string; attempts: number; favorite: boolean; archived: boolean; deletedAt?: string; conflictCopy?: boolean
}
export interface Collection { id: string; name: string; color: string; icon?: string; parentId?: string; sortOrder: number; createdAt: string; updatedAt: string; driveFileId?: string; deletedAt?: string }
export interface TagRecord { id: string; name: string; normalizedName: string; createdAt: string }
export interface ItemTag { id: string; itemId: string; tagId: string }
export interface TagRule { id: string; name: string; field: 'domain' | 'title' | 'content'; operator: 'contains'; value: string; tags: string[]; enabled: boolean; createdAt: string; updatedAt: string }
export interface SavedSearch { id: string; name: string; query: string; createdAt: string; updatedAt: string; lastUsedAt?: string }
export interface SearchIndexRecord { id: string; itemId: string; terms: string; updatedAt: string }
export interface BackupMetadata { id: string; fileId?: string; name: string; createdAt: string; type: 'manual' | 'scheduled' | 'safety' | 'local'; location: 'local' | 'drive'; size?: number; itemCount: number; checksum: string; schemaVersion: number }
export interface SyncQueueEntry { id: string; entityType: 'item' | 'collection'; entityId: string; operation: 'upsert' | 'delete'; createdAt: string; attempts: number; nextAttemptAt: string; lastError?: string }
export interface SyncMetadata { id: 'sync'; status: 'idle' | 'syncing' | 'offline' | 'error'; lastAttemptAt?: string; lastSuccessfulSyncAt?: string; lastError?: string; remoteChangeToken?: string }
export interface DriveFolders { root?: string; bookmarks?: string; highlights?: string; notes?: string; images?: string; screenshots?: string; collections?: string; backups?: string; exports?: string; files?: string }
export interface ManagedFolder { id: string; name: string; parentId?: string; relativePath: string; driveFolderId?: string; webViewLink?: string; createdAt: string; updatedAt: string; shared: boolean; deletedAt?: string }
export interface ManagedFile {
  id: string; name: string; mimeType: string; size: number; extension?: string; parentFolderId?: string; relativePath?: string
  driveFileId?: string; webViewLink?: string; driveCreatedTime?: string; driveModifiedTime?: string; checksum?: string
  status: ManagedFileStatus; progress: number; shared: boolean; createdAt: string; updatedAt: string; lastError?: string; deletedAt?: string
}
export interface UploadQueueRecord {
  id: string; fileId: string; fileName: string; parentFolderId?: string; relativePath?: string; uploadUrl?: string
  uploadedBytes: number; totalBytes: number; status: UploadStatus; attempts: number; createdAt: string; updatedAt: string; lastError?: string
}
export interface SharingMetadata {
  id: string; fileId: string; driveFileId: string; permissionId?: string; type: 'restricted' | 'anyone' | 'user' | 'group' | 'domain'
  entityType?: 'file' | 'folder'; role: ShareRole | 'owner'; emailAddress?: string; displayName?: string; photoLink?: string; allowFileDiscovery?: boolean; webViewLink?: string; createdAt: string; updatedAt: string
}
export interface Settings { id: 'settings'; driveFolderName: string; driveFolders: DriveFolders; autoSync: boolean; theme: ThemePreference; lastSyncAt?: string; smartTagSuggestions: boolean; recentSearches: string[]; backupRetention: BackupRetention; scheduledBackups: boolean; lastScheduledBackupAt?: string }
export interface QuickSaveDraft { kind: SaveKind; title: string; url?: string; content?: string; createdAt: string }
export type NewItemInput = Pick<SavedItem, 'kind' | 'title'> & Partial<Pick<SavedItem, 'url' | 'content' | 'note' | 'markdown' | 'imageUrl' | 'imageDataUrl' | 'collectionId' | 'favorite' | 'archived'>> & { tags?: string[] }
export type ExtensionMessage =
  | { type: 'SAVE_ITEM'; payload: NewItemInput }
  | { type: 'SYNC_NOW'; interactive?: boolean }
  | { type: 'AUTH_STATUS' }
  | { type: 'SIGN_IN' }
  | { type: 'SIGN_OUT' }
  | { type: 'OPEN_PANEL' }
  | { type: 'OPEN_DASHBOARD' }
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'GET_SYNC_STATUS' }
export interface MessageResponse<T = unknown> { ok: boolean; data?: T; error?: string }
export interface ExportBundle { schemaVersion: 3; appVersion: string; backupId: string; exportedAt: string; items: SavedItem[]; collections: Collection[]; tags: TagRecord[]; tagRules: TagRule[]; savedSearches: SavedSearch[]; settings: Settings; integrity: { algorithm: 'SHA-256'; checksum: string; itemCount: number; collectionCount: number } }
export interface MarkdownExportOptions { includeUrls: boolean; includeTags: boolean; includeDates: boolean; includeNotes: boolean; includeHighlights: boolean; includeCollections: boolean; yamlFrontMatter: boolean; individualFiles: boolean }
