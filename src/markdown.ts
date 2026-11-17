import type { MarkdownExportOptions, SavedItem } from './types'

export const defaultMarkdownOptions: MarkdownExportOptions = { includeUrls: true, includeTags: true, includeDates: true, includeNotes: true, includeHighlights: true, includeCollections: true, yamlFrontMatter: true, individualFiles: false }
const stripControls = (value: string) => Array.from(value).filter((character) => { const code = character.charCodeAt(0); return code === 9 || code === 10 || code === 13 || code >= 32 }).join('')
const yaml = (value: string) => JSON.stringify(stripControls(value))
const heading = (value: string) => value.replace(/^#+\s*/gm, '').replace(/[\r\n]+/g, ' ').trim() || 'Untitled'
export function safeExportName(value: string, extension = 'md'): string { const base = stripControls(value.normalize('NFKC')).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'untitled'; return `${base}.${extension}` }
export function itemToMarkdown(item: SavedItem, collectionName = '', options: MarkdownExportOptions = defaultMarkdownOptions): string {
  const body = item.kind === 'note' ? item.note : options.includeHighlights ? item.content : ''
  const front = options.yamlFrontMatter ? [
    '---', `id: ${yaml(item.id)}`, `title: ${yaml(item.title)}`, `type: ${item.kind}`,
    ...(options.includeUrls && item.url ? [`source: ${yaml(item.url)}`] : []),
    ...(options.includeCollections && collectionName ? [`collection: ${yaml(collectionName)}`] : []),
    ...(options.includeTags && item.tags.length ? [`tags: [${item.tags.map(yaml).join(', ')}]`] : []),
    ...(options.includeDates ? [`created: ${yaml(item.createdAt)}`, `updated: ${yaml(item.updatedAt)}`] : []), '---', '',
  ] : []
  const metadata = options.yamlFrontMatter ? [] : [
    `**Type:** ${item.kind}`, ...(options.includeUrls && item.url ? [`**Source:** ${item.url}`] : []),
    ...(options.includeCollections && collectionName ? [`**Collection:** ${collectionName}`] : []),
    ...(options.includeTags && item.tags.length ? [`**Tags:** ${item.tags.join(', ')}`] : []),
    ...(options.includeDates ? [`**Saved:** ${item.createdAt.slice(0, 10)}`] : []), '',
  ]
  return [...front, `# ${heading(item.title)}`, '', ...metadata, ...(body ? [item.kind === 'note' ? '## Note' : '## Highlight', '', body, ''] : []), ...(options.includeNotes && item.note && item.kind !== 'note' ? ['## Personal Notes', '', item.note, ''] : [])].join('\n').trimEnd() + '\n'
}
export function libraryToMarkdown(items: SavedItem[], collectionNames: Map<string, string> = new Map(), options: MarkdownExportOptions = defaultMarkdownOptions): string { return items.filter((item) => !item.deletedAt).map((item) => itemToMarkdown(item, collectionNames.get(item.collectionId || '') || '', options)).join('\n\n---\n\n') }
export function itemsToCsv(items: SavedItem[], collectionNames: Map<string, string> = new Map()): string {
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [['ID', 'Title', 'Type', 'URL', 'Domain', 'Collection', 'Tags', 'Content', 'Notes', 'Favorite', 'Archived', 'Created', 'Updated'].map(cell).join(','), ...items.filter((item) => !item.deletedAt).map((item) => [item.id, item.title, item.kind, item.url, item.domain, collectionNames.get(item.collectionId || ''), item.tags.join('|'), item.content, item.note, item.favorite, item.archived, item.createdAt, item.updatedAt].map(cell).join(','))].join('\r\n')
}
