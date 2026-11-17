import { hostFromUrl } from './lib'
import type { Collection, SavedItem } from './types'

export type SearchSort = 'relevance' | 'newest' | 'oldest' | 'updated' | 'title'
export interface SearchFilter { field?: string; value: string; phrase: boolean }
export interface ParsedSearch { filters: SearchFilter[]; error?: string }
export interface SearchResult { item: SavedItem; score: number }

const supported = new Set(['type', 'tag', 'domain', 'collection', 'is', 'before', 'after', 'updated-before', 'updated-after', 'sync'])
export function parseSearch(query: string): ParsedSearch {
  const filters: SearchFilter[] = []
  let index = 0
  while (index < query.length) {
    while (/\s/.test(query[index] || '')) index++
    if (index >= query.length) break
    const start = index
    let field: string | undefined
    const fieldMatch = query.slice(index).match(/^([\w-]+):/)
    if (fieldMatch) { field = fieldMatch[1].toLocaleLowerCase(); index += fieldMatch[0].length; if (!supported.has(field)) return { filters, error: `Unknown search filter “${field}:”.` } }
    let value = ''
    if (query[index] === '"') { index++; const end = query.indexOf('"', index); if (end < 0) return { filters, error: 'A quoted phrase is missing its closing quote.' }; value = query.slice(index, end); index = end + 1 } else { while (index < query.length && !/\s/.test(query[index])) value += query[index++] }
    if (!value) return { filters, error: `Missing value after “${query.slice(start, index)}”.` }
    if ((field === 'before' || field === 'after' || field === 'updated-before' || field === 'updated-after') && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { filters, error: `${field}: expects YYYY-MM-DD.` }
    filters.push({ field, value: value.normalize('NFKC').toLocaleLowerCase(), phrase: query[start + (field ? field.length + 1 : 0)] === '"' })
  }
  return { filters }
}

function textScore(item: SavedItem, value: string): number {
  const title = item.title.toLocaleLowerCase(), url = item.url?.toLocaleLowerCase() || '', domain = (item.domain || hostFromUrl(item.url)).toLocaleLowerCase(), content = `${item.content || ''} ${item.note || ''}`.toLocaleLowerCase()
  if (title === value) return 100
  let score = 0
  if (title.includes(value)) score += 40
  if (item.tags.some((tag) => tag.toLocaleLowerCase() === value)) score += 30
  else if (item.tags.some((tag) => tag.toLocaleLowerCase().includes(value))) score += 18
  if (domain.includes(value)) score += 20
  if (url.includes(value)) score += 12
  if (content.includes(value)) score += 10
  return score
}
function filterScore(item: SavedItem, filter: SearchFilter, collectionName: string): number {
  const { field, value } = filter
  if (!field) { const score = textScore(item, value); return score > 0 ? score : -1 }
  if (field === 'type') return item.kind === value || (value === 'highlight' && ['selection', 'text'].includes(item.kind)) || (value === 'bookmark' && item.kind === 'link') ? 10 : -1
  if (field === 'tag') return item.tags.some((tag) => tag.toLocaleLowerCase().includes(value)) ? 10 : -1
  if (field === 'domain') return (item.domain || hostFromUrl(item.url)).toLocaleLowerCase().includes(value) ? 10 : -1
  if (field === 'collection') return collectionName.toLocaleLowerCase().includes(value) ? 10 : -1
  if (field === 'sync') return item.syncState === value ? 10 : -1
  if (field === 'is') return value === 'favorite' ? item.favorite ? 10 : -1 : value === 'archived' ? item.archived ? 10 : -1 : value === 'trash' ? item.deletedAt ? 10 : -1 : value === 'conflict' ? item.syncState === 'conflict' ? 10 : -1 : -1
  const target = Date.parse(`${value}T00:00:00`), stamp = Date.parse(field.startsWith('updated-') ? item.updatedAt : item.createdAt)
  if (!Number.isFinite(target)) return -1
  return field.endsWith('before') ? stamp < target ? 10 : -1 : stamp >= target ? 10 : -1
}
export function searchItems(items: SavedItem[], collections: Collection[], query: string, sort: SearchSort = 'relevance'): { results: SearchResult[]; error?: string } {
  const parsed = parseSearch(query); if (parsed.error) return { results: [], error: parsed.error }
  const names = new Map(collections.map((collection) => [collection.id, collection.name]))
  const results = items.map((item) => ({ item, score: parsed.filters.reduce((score, filter) => { if (score < 0) return score; const next = filterScore(item, filter, names.get(item.collectionId || '') || ''); return next < 0 ? -1 : score + next }, parsed.filters.length ? 0 : 1) })).filter((result) => result.score >= 0)
  results.sort((a, b) => sort === 'title' ? a.item.title.localeCompare(b.item.title) : sort === 'newest' ? b.item.createdAt.localeCompare(a.item.createdAt) : sort === 'oldest' ? a.item.createdAt.localeCompare(b.item.createdAt) : sort === 'updated' ? b.item.updatedAt.localeCompare(a.item.updatedAt) : b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
  return { results }
}
export function dateOperator(preset: 'today' | 'yesterday' | '7days' | '30days', now = new Date()): string {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  if (preset === 'yesterday') { const yesterday = new Date(start); yesterday.setDate(yesterday.getDate() - 1); return `after:${yesterday.toISOString().slice(0, 10)} before:${start.toISOString().slice(0, 10)}` }
  if (preset === '7days') start.setDate(start.getDate() - 7)
  if (preset === '30days') start.setDate(start.getDate() - 30)
  return `after:${start.toISOString().slice(0, 10)}`
}
