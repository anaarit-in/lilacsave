import { describe, expect, it } from 'vitest'
import manifest from '../public/manifest.json'

describe('Manifest V3 security configuration', () => {
  it('uses MV3 and least-privilege Drive scope', () => { expect(manifest.manifest_version).toBe(3); expect(manifest.oauth2.scopes).toEqual(['https://www.googleapis.com/auth/drive.file']) })
  it('does not request browsing history or broad site access', () => { expect(manifest.permissions).not.toContain('history'); expect(manifest.host_permissions).not.toContain('<all_urls>') })
  it('blocks remote executable code', () => expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self'"))
})
