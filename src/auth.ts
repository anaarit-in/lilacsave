import { db, getSettings } from './db'

export class AuthenticationRequiredError extends Error { constructor(message = 'Connect your Google account to synchronize.') { super(message); this.name = 'AuthenticationRequiredError' } }

const getToken = (interactive: boolean) => new Promise<string>((resolve, reject) => chrome.identity.getAuthToken({ interactive }, (result) => {
  const error = chrome.runtime.lastError, token = typeof result === 'string' ? result : undefined
  if (error || !token) reject(new AuthenticationRequiredError(error?.message)); else resolve(token)
}))
const removeToken = (token: string) => new Promise<void>((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve))
export const acquireToken = (interactive = false) => getToken(interactive)
export async function isAuthenticated() { try { await acquireToken(false); return true } catch { return false } }

export async function signOut(): Promise<void> {
  try { const token = await acquireToken(false); await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined); await removeToken(token) } catch { /* Already disconnected. */ }
  const settings = await getSettings(); await db.settings.put({ ...settings, driveFolders: {}, lastSyncAt: undefined })
}

export async function authorizedFetch(url: string, init: RequestInit = {}, interactive = false): Promise<Response> {
  let token = await acquireToken(interactive)
  let response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (response.status === 401) {
    await removeToken(token)
    try { token = await acquireToken(interactive) } catch { throw new AuthenticationRequiredError('Google authorization expired or was revoked. Reconnect your account.') }
    response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
    if (response.status === 401 || response.status === 403) { await removeToken(token); throw new AuthenticationRequiredError('Google authorization was revoked. Reconnect your account.') }
  }
  return response
}
