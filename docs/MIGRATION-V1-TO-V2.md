# LilacSave V1 to V2 migration

LilacSave upgrades IndexedDB in place from schema 2 to schema 3. The migration preserves every item UUID, collection UUID, Google Drive file ID, timestamp, favorite/archive state, tombstone, and queued mutation.

## Added stores

- `itemTags` for normalized many-to-many tag relations
- `tagRules` for local suggestion rules
- `savedSearches` and `searchIndex`
- `backupMetadata`

Collections receive `parentId`, `icon`, and `sortOrder`. Existing collections remain top-level. A derived search record and tag relations are built for every existing item during the Dexie migration. Existing item documents and Drive folders are not renamed or recreated.

## Recovery

Before upgrading, users may export JSON from Settings. If a browser interrupts the IndexedDB upgrade, Dexie rolls the version transaction back. Reload the extension to retry. Do not clear site data. For a device recovery, use Settings → Backup and restore and select Merge, Missing only, or Replace. Replace requires confirmation and creates a Drive safety backup first.

V2 continues to read schema-2 JSON exports and converts them in memory without changing the source file.
