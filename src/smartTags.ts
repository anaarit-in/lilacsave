import type { SavedItem, TagRule } from './types'

const rules: Array<[RegExp, string]> = [
  [/github|gitlab|typescript|javascript|react|api|\bcode\b/i, 'development'],
  [/research|paper|study|journal|arxiv|scholar/i, 'research'],
  [/design|figma|typography|color|interface|ux|ui\b/i, 'design'],
  [/finance|invoice|payment|budget|bank|invest/i, 'finance'],
  [/youtube|vimeo|video|watch/i, 'video'],
  [/docs?|guide|tutorial|reference|manual/i, 'reference'],
  [/article|blog|medium\.com|substack/i, 'reading'],
  [/meeting|agenda|minutes|follow.?up/i, 'meeting'],
]

export interface TagSuggestionProvider { readonly id: string; suggest(input: Pick<SavedItem, 'title' | 'url' | 'content' | 'note' | 'kind' | 'tags'>, customRules?: TagRule[]): Promise<string[]> | string[] }

export function suggestTags(input: Pick<SavedItem, 'title' | 'url' | 'content' | 'note' | 'kind' | 'tags'>, customRules: TagRule[] = []): string[] {
  const text = [input.title, input.url, input.content, input.note].filter(Boolean).join(' ')
  const suggestions = rules.filter(([pattern]) => pattern.test(text)).map(([, tag]) => tag)
  for (const rule of customRules.filter((entry) => entry.enabled)) {
    const source = rule.field === 'domain' ? (() => { try { return new URL(input.url || '').hostname } catch { return '' } })() : rule.field === 'title' ? input.title : [input.content, input.note].filter(Boolean).join(' ')
    if (source.toLocaleLowerCase().includes(rule.value.toLocaleLowerCase())) suggestions.push(...rule.tags)
  }
  if (input.kind === 'note') suggestions.push('note')
  if (input.kind === 'selection') suggestions.push('highlight')
  return [...new Set(suggestions)].filter((tag) => !input.tags.some((current) => current.toLocaleLowerCase() === tag)).slice(0, 5)
}

export const localTagSuggestionProvider: TagSuggestionProvider = { id: 'local-rules', suggest: (input, customRules) => suggestTags(input, customRules) }
