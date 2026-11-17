# LilacSave 2.1 Professional

LilacSave is an offline-first Chrome extension for bookmarks, highlights, Markdown notes, files, folders, collections, tags, sharing, and private Google Drive synchronization. Library mutations and file-upload metadata are committed to IndexedDB before network work begins.

## Features

- Manifest V3 service worker and Chrome Side Panel UI
- Page, link, and selected-text context menus
- Notes and manually pasted text, editing, favorites, archive/restore, search, filters, and sync status
- Dexie/IndexedDB schema with Items, Collections, Tags, Sync Queue, Sync Metadata, and Settings stores
- Five-minute scheduled synchronization, exponential retry backoff, tombstones, remote downloads, and conflict copies
- Google OAuth through `chrome.identity`
- Google Drive API v3 with the least-privilege `drive.file` scope
- React, TypeScript, Vite, Tailwind CSS, ESLint, and Vitest
- Ranked full-text search with operators, recent searches, date filters, smart views, and 10,000-item regression coverage
- Privacy-friendly local smart tagging rules, normalized tag administration, and bulk operations
- Markdown, JSON, CSV, and multi-file ZIP exports, including Drive `Exports/`
- Nested collections, duplicate URL detection, transactional restore modes, integrity-checked backups, and configurable scheduled retention
- Google Drive file manager with multi-file and folder upload, preserved paths, progress, cancellation, previews, downloads, Drive trash, and duplicate-safe names
- Resumable 8 MB chunk uploads with upload-session and byte-progress metadata stored in IndexedDB
- Explicit recipient and anyone-with-link sharing using official Google Drive links

## Google Cloud setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen.
4. Create an OAuth client with application type **Chrome Extension**. During local setup, Chrome shows the extension ID at `chrome://extensions` after the first unpacked load; use that ID for the client.
5. Replace the configuration value `oauth2.client_id` in `public/manifest.json` with the resulting public client ID. Chrome extension OAuth clients do not use or embed a client secret.
6. Add test users while the OAuth app remains in testing mode. Complete Google's verification requirements before a public Chrome Web Store release.

The extension intentionally asks only for `https://www.googleapis.com/auth/drive.file`. Do not replace it with a broad Drive scope.

## Develop and verify

```powershell
npm install
npm run lint
npm test
npm run build
```

Load `dist` as an unpacked extension from `chrome://extensions` with Developer mode enabled. After changing source files, rebuild and reload the extension.

## Storage model

Local data lives in the versioned `LilacSaveDB` database. Each Drive entity is a standalone JSON document with a schema version and stable UUID in Drive `appProperties`. Local writes never depend on network or authentication. Failed uploads remain in the retry queue across service-worker shutdowns.

Drive layout (`username` is derived from the signed-in Google email):

```text
LilacSave_username/
├── Bookmarks/
├── Highlights/
├── Notes/
├── Collections/
├── Backups/
├── Exports/
├── Files/
├── library-index.json
└── settings.json
```

Known folder IDs are verified before use. Missing, inaccessible, or moved folders are recovered by searching the correct parent before creating a replacement.

Disconnecting Google Drive revokes the cached OAuth token but retains local data. Deletions are queued offline and remove the matching extension-created Drive file on the next successful sync.

Schema v4 adds `managedFiles`, `managedFolders`, `uploadQueue`, and `sharingMetadata` without rewriting existing library tables. Upload session metadata survives reloads. After a full browser restart, Chrome requires the user to reselect a local file before its remaining bytes can resume because native `File` handles are not persisted.

## Security notes

- Extension pages contain no analytics or remotely hosted executable code.
- OAuth tokens are managed by Chrome Identity and are never written to IndexedDB or Chrome storage.
- All Google API traffic uses HTTPS and a strict Google API host permission.
- User content is rendered as React text, not injected HTML.
- Active file uploads run in the visible Dashboard rather than the Manifest V3 service worker.
- Anyone-with-link sharing requires explicit confirmation; permission creation and revocation use Drive API v3 with the `drive.file` scope.
- Executable/script extensions are rejected, names are sanitized, and PDF previews use a sandboxed iframe.
- Page metadata is captured only when the user clicks Save or chooses a LilacSave context menu; the extension does not passively collect browsing activity.
- A production release should include a published privacy policy matching the behavior above.

## PayPal checkout

Manifest V3 does not permit loading PayPal's remotely hosted SDK inside an extension page. Configure `VITE_PAYPAL_CHECKOUT_URL` with an HTTPS checkout page hosted by the LilacSave service. That backend must authenticate the user, control plan pricing, create and capture PayPal orders, verify PayPal webhooks, and grant entitlements. Never place a PayPal client secret in this repository or extension bundle.

Copy `.env.example` to the ignored `.env` file for local builds. Administrator and Professional email allowlists are build-time configuration and are intentionally not committed.

## Chrome Web Store release

1. Complete Google OAuth production verification and publish a privacy policy.
2. Run `npm run lint`, `npm test`, and `npm run build`.
3. Test the unpacked `dist` build with a clean Chrome profile, offline mode, revoked authorization, and two signed-in Chrome profiles.
4. Zip the contents of `dist` (not the directory itself) and upload it in the Chrome Web Store Developer Dashboard.
5. In the privacy form, disclose `identity`, `contextMenus`, `sidePanel`, `alarms`, local IndexedDB storage, and user-authorized Drive file storage. Declare that browsing activity is not collected.
6. Provide reviewer credentials only if the OAuth consent screen is restricted; never provide a client secret.

## Test boundaries

Unit tests cover search, import validation, transactional queueing, UUID/domain creation, mutation coalescing, tombstones, scope minimization, and CSP. Live OAuth, Drive rate limiting, multi-device synchronization, and Web Store review require the configured Google Cloud project and are documented manual release checks rather than mocked production claims.
