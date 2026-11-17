import { isAuthenticated, signOut } from './auth'
import { db, getSettings, getSyncMetadata } from './db'
import { createItem } from './repository'
import { syncLibrary } from './sync'
import { createDriveBackup } from './backup'
import type { ExtensionMessage, MessageResponse, QuickSaveDraft } from './types'

const menus: Array<{ id: 'bookmark' | 'selection' | 'link' | 'image'; title: string; contexts: chrome.contextMenus.ContextType[] }> = [
  { id: 'bookmark', title: 'Save page to Lilac Save', contexts: ['page'] }, { id: 'selection', title: 'Save selection to Lilac Save…', contexts: ['selection'] }, { id: 'link', title: 'Save link to Lilac Save', contexts: ['link'] }, { id: 'image', title: 'Save image to Lilac Save', contexts: ['image'] },
]
async function createMenus() { await chrome.contextMenus.removeAll(); for (const menu of menus) chrome.contextMenus.create({ ...menu, id: `lilacsave-${menu.id}` }) }
function scheduleSync() { chrome.alarms.create('lilacsave-sync', { delayInMinutes: 1, periodInMinutes: 5 }); chrome.alarms.create('lilacsave-backup', { delayInMinutes: 15, periodInMinutes: 24 * 60 }) }
chrome.runtime.onInstalled.addListener((details) => { void createMenus(); scheduleSync(); void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }); if (details.reason === 'install') void chrome.tabs.create({ url: chrome.runtime.getURL('landing.html') }) })
chrome.runtime.onStartup.addListener(scheduleSync)
async function imageToDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined
  try {
    const response = await fetch(url); if (!response.ok) return undefined
    const blob = await response.blob(); if (!blob.type.startsWith('image/') || blob.size > 10_000_000) return undefined
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
    return `data:${blob.type};base64,${btoa(binary)}`
  } catch { return undefined }
}
async function captureScreenshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.windowId) throw new Error('No active tab is available for capture.')
  const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  const item = await createItem({ kind: 'screenshot', title: `Screenshot · ${tab.title || 'Captured page'}`, url: tab.url, imageDataUrl, tags: ['screenshot'] })
  const settings = await getSettings(); if (settings.autoSync && await isAuthenticated()) void syncLibrary()
  return item
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const kind = String(info.menuItemId).replace('lilacsave-', '')
  if (kind === 'selection') { const draft: QuickSaveDraft = { kind: 'selection', title: tab?.title || 'Selected text', url: info.pageUrl, content: info.selectionText?.trim(), createdAt: new Date().toISOString() }; void chrome.storage.session.set({ quickSaveDraft: draft }); if (tab?.windowId) void chrome.sidePanel.open({ windowId: tab.windowId }); return }
  if (kind === 'image') { void imageToDataUrl(info.srcUrl).then((imageDataUrl) => createItem({ kind: 'image', title: `${tab?.title || 'Saved page'} · Image`, url: info.pageUrl, imageUrl: info.srcUrl, imageDataUrl, tags: ['image'] })).then(async () => { const settings = await getSettings(); if (settings.autoSync && await isAuthenticated()) void syncLibrary() }); return }
  const url = kind === 'link' ? info.linkUrl : info.pageUrl
  void createItem({ kind: kind === 'link' ? 'link' : 'bookmark', title: tab?.title || (kind === 'link' ? 'Saved link' : 'Saved page'), url, tags: [] }).then(async () => { const settings = await getSettings(); if (settings.autoSync && await isAuthenticated()) void syncLibrary() })
})
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'lilacsave-sync') void getSettings().then(async (settings) => { if (settings.autoSync && await isAuthenticated()) await syncLibrary() })
  if (alarm.name === 'lilacsave-backup') void getSettings().then(async (settings) => { if (settings.scheduledBackups && await isAuthenticated()) { await createDriveBackup('scheduled'); await db.settings.update('settings', { lastScheduledBackupAt: new Date().toISOString() }) } })
})
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open-side-panel' && tab?.windowId) void chrome.sidePanel.open({ windowId: tab.windowId })
  if (command === 'save-current-page') void createItem({ kind: 'bookmark', title: tab?.title || 'Saved page', url: tab?.url, tags: [] }).then(async () => { if (await isAuthenticated()) void syncLibrary() })
  if (command === 'new-note' && tab?.windowId) { const draft: QuickSaveDraft = { kind: 'note', title: '', content: '', createdAt: new Date().toISOString() }; void chrome.storage.session.set({ quickSaveDraft: draft }).then(() => chrome.sidePanel.open({ windowId: tab.windowId })) }
  if (command === 'sync-now') void isAuthenticated().then((authenticated) => { if (authenticated) void forceSync(false) })
  if (command === 'save-selected-text' && tab?.id) void chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection()?.toString().trim() || '' }).then(([result]) => {
    const content = String(result?.result || ''); if (!content) return
    const draft: QuickSaveDraft = { kind: 'selection', title: tab.title || 'Selected text', url: tab.url, content, createdAt: new Date().toISOString() }
    void chrome.storage.session.set({ quickSaveDraft: draft }).then(() => { if (tab.windowId) return chrome.sidePanel.open({ windowId: tab.windowId }) })
  }).catch(() => undefined)
})
async function forceSync(interactive: boolean) { await db.syncQueue.toCollection().modify({ nextAttemptAt: new Date().toISOString() }); return syncLibrary(interactive) }
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse: (response: MessageResponse) => void) => {
  const run = async (): Promise<MessageResponse> => { switch (message.type) {
    case 'SAVE_ITEM': return { ok: true, data: await createItem(message.payload) }; case 'SYNC_NOW': return { ok: true, data: await forceSync(Boolean(message.interactive)) }; case 'AUTH_STATUS': return { ok: true, data: await isAuthenticated() }
    case 'SIGN_IN': await forceSync(true); return { ok: true }; case 'SIGN_OUT': await signOut(); return { ok: true }; case 'GET_SYNC_STATUS': return { ok: true, data: { metadata: await getSyncMetadata(), pending: await db.syncQueue.count() } }
    case 'OPEN_PANEL': { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (tab?.windowId) await chrome.sidePanel.open({ windowId: tab.windowId }); return { ok: true } }
    case 'OPEN_DASHBOARD': await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }); return { ok: true }
    case 'CAPTURE_SCREENSHOT': return { ok: true, data: await captureScreenshot() }
  } }
  run().then(sendResponse).catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' })); return true
})
