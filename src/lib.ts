import type { ExtensionMessage, MessageResponse, SavedItem, SaveKind } from './types'

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<MessageResponse<T>> {
  return chrome.runtime.sendMessage(message) as Promise<MessageResponse<T>>
}

export function kindLabel(kind: SaveKind) { return ({ bookmark: 'Bookmark', selection: 'Selection', link: 'Link', note: 'Note', text: 'Text', image: 'Image', screenshot: 'Screenshot' })[kind] }

export function hostFromUrl(url?: string): string {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export function relativeTime(value: string, now = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 60) return formatter.format(seconds, 'second')
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  return formatter.format(Math.round(seconds / 86400), 'day')
}

export function matchesSearch(item: SavedItem, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return true
  return [item.title, item.url, item.content, item.note, ...item.tags].some((value) => value?.toLocaleLowerCase().includes(needle))
}

export function matchesAdvancedSearch(item: SavedItem, query: string, collectionName = ''): boolean {
  const tokens = [...query.matchAll(/(\w+):(?:"([^"]+)"|(\S+))|"([^"]+)"|(\S+)/g)]
  if (!tokens.length) return true
  return tokens.every((match) => {
    const field = match[1]?.toLocaleLowerCase(), value = (match[2] || match[3] || match[4] || match[5] || '').toLocaleLowerCase()
    if (!field) return matchesSearch(item, value)
    if (field === 'type') return item.kind === value || (value === 'highlight' && ['selection', 'text'].includes(item.kind))
    if (field === 'tag') return item.tags.some((tag) => tag.toLocaleLowerCase().includes(value))
    if (field === 'domain') return (item.domain || hostFromUrl(item.url)).toLocaleLowerCase().includes(value)
    if (field === 'collection') return collectionName.toLocaleLowerCase().includes(value)
    if (field === 'is') return value === 'favorite' ? item.favorite : value === 'archived' ? item.archived : value === 'trash' ? Boolean(item.deletedAt) : value === 'conflict' ? item.syncState === 'conflict' : false
    if (field === 'before' || field === 'after') { const target = Date.parse(value), created = Date.parse(item.createdAt); return Number.isFinite(target) && (field === 'before' ? created < target : created > target) }
    return matchesSearch(item, `${field}:${value}`)
  })
}
