export function userFolderName(email?: string): string {
  const localPart = (email || '').trim().toLocaleLowerCase().split('@')[0] || ''
  const username = localPart
    .normalize('NFKC')
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[_ .-]+|[_ .-]+$/g, '')
    .slice(0, 64)
  return `LilacSave_${username || 'user'}`
}

export async function resolveUserFolderName(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.identity) return userFolderName()
  const profile = await chrome.identity.getProfileUserInfo().catch(() => ({ email: '', id: '' }))
  return userFolderName(profile.email)
}
