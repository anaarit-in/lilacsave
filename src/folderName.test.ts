import { describe, expect, it } from 'vitest'
import { userFolderName } from './folderName'

describe('user-specific Drive folder name', () => {
  it('uses the signed-in email username', () => {
    expect(userFolderName('sample.user@example.com')).toBe('LilacSave_sample.user')
    expect(userFolderName(' Name+Admin@example.com ')).toBe('LilacSave_name_admin')
  })

  it('uses a safe fallback when no identity is available', () => {
    expect(userFolderName()).toBe('LilacSave_user')
  })
})
