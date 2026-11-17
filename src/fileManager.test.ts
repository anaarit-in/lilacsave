import { describe, expect, it } from 'vitest'
import { buildFolderPath, canPreview, fileCategory, formatBytes, sanitizeFileName, uniqueFileName, validateUpload } from './fileManager'
import type { ManagedFolder } from './types'

describe('V2.1 file manager helpers', () => {
  it('sanitizes unsafe Drive names and resolves duplicates predictably', () => {
    expect(sanitizeFileName('  Q4: plan?.pdf  ')).toBe('Q4- plan-.pdf')
    expect(uniqueFileName('report.pdf', ['report.pdf', 'report (2).pdf'])).toBe('report (3).pdf')
  })
  it('blocks executable uploads and accepts ordinary documents', () => {
    expect(validateUpload({ name: 'installer.exe', size: 42 } as File)).toContain('blocked')
    expect(validateUpload({ name: 'research.pdf', size: 42 } as File)).toBeUndefined()
  })
  it('formats sizes and classifies previewable content', () => {
    expect(formatBytes(1536)).toBe('1.50 KB')
    expect(fileCategory({ name: 'photo.png', mimeType: 'image/png' })).toBe('image')
    expect(canPreview({ name: 'notes.md', mimeType: 'application/octet-stream' })).toBe(true)
  })
  it('builds a stable breadcrumb', () => {
    const now = new Date().toISOString(), folders: ManagedFolder[] = [
      { id: 'a', name: 'Projects', relativePath: 'Projects', shared: false, createdAt: now, updatedAt: now },
      { id: 'b', name: 'Launch', parentId: 'a', relativePath: 'Projects/Launch', shared: false, createdAt: now, updatedAt: now },
    ]
    expect(buildFolderPath(folders, 'b').map((folder) => folder.name)).toEqual(['Projects', 'Launch'])
  })
})
