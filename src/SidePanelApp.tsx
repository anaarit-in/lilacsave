import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkPlus, Camera, Check, ClipboardPaste, Filter, Plus, Search, Sparkles, Upload, X } from 'lucide-react'
import { db, getSettings } from './db'
import { matchesAdvancedSearch, sendMessage } from './lib'
import { createItem, deleteItem as deleteSavedItem, updateItem as updateSavedItem } from './repository'
import { suggestTags } from './smartTags'
import type { Collection, QuickSaveDraft, SavedItem, SaveKind, TagRule } from './types'
import { Brand } from './components/Brand'
import { SyncPill } from './components/SyncPill'
import { ItemCard } from './components/ItemCard'

type FilterKind = 'all' | 'favorites' | 'archived' | SaveKind

export default function SidePanelApp() {
  const [items, setItems] = useState<SavedItem[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [authenticated, setAuthenticated] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedCollection, setSelectedCollection] = useState('')
  const [filter, setFilter] = useState<FilterKind>('all')
  const [composer, setComposer] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [annotation, setAnnotation] = useState('')
  const [url, setUrl] = useState('')
  const [composerKind, setComposerKind] = useState<'note' | 'text'>('note')
  const [saveKind, setSaveKind] = useState<SaveKind>('note')
  const [tagsText, setTagsText] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [markdown, setMarkdown] = useState(false)
  const [editing, setEditing] = useState<SavedItem | null>(null)
  const [toast, setToast] = useState('')
  const [tagRules, setTagRules] = useState<TagRule[]>([])
  const [smartSuggestions, setSmartSuggestions] = useState(true)
  const [rejectedSuggestions, setRejectedSuggestions] = useState<string[]>([])
  const imageUploadRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => { setItems(await db.items.orderBy('createdAt').reverse().toArray()); setCollections((await db.collections.orderBy('name').toArray()).filter((entry) => !entry.deletedAt)); setTagRules(await db.tagRules.toArray()) }, [])
  useEffect(() => { const applyDraft = (draft?: QuickSaveDraft) => { if (!draft) return; setSaveKind(draft.kind); setComposerKind(draft.kind === 'note' ? 'note' : 'text'); setTitle(draft.title); setUrl(draft.url || ''); setNote(draft.content || ''); setComposer(true) }; const storageListener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => { if (areaName === 'session' && changes.quickSaveDraft?.newValue) applyDraft(changes.quickSaveDraft.newValue as QuickSaveDraft) }; void refresh(); void getSettings().then((settings) => setSmartSuggestions(settings.smartTagSuggestions)); void sendMessage<boolean>({ type: 'AUTH_STATUS' }).then((r) => setAuthenticated(Boolean(r.data))); void chrome.storage.session.get('quickSaveDraft').then(({ quickSaveDraft }) => applyDraft(quickSaveDraft as QuickSaveDraft | undefined)); chrome.storage.onChanged.addListener(storageListener); const interval = window.setInterval(refresh, 1500); return () => { clearInterval(interval); chrome.storage.onChanged.removeListener(storageListener) } }, [refresh])
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 2600); return () => clearTimeout(timeout) }, [toast])

  const pending = items.filter((item) => item.syncState !== 'synced').length
  const visible = useMemo(() => items.filter((item) => !item.deletedAt && (!selectedCollection || item.collectionId === selectedCollection) && (filter === 'archived' ? item.archived : !item.archived) && (filter === 'all' || filter === 'archived' || (filter === 'favorites' ? item.favorite : item.kind === filter)) && matchesAdvancedSearch(item, query, collections.find((entry) => entry.id === item.collectionId)?.name)), [items, filter, query, selectedCollection, collections])
  const parsedTags = useMemo(() => tagsText.split(',').map((tag) => tag.trim()).filter(Boolean), [tagsText])
  const tagSuggestions = useMemo(() => smartSuggestions ? suggestTags({ title, url, content: saveKind === 'note' ? undefined : note, note: saveKind === 'note' ? note : annotation, kind: saveKind, tags: parsedTags }, tagRules).filter((tag) => !rejectedSuggestions.includes(tag)) : [], [title, url, note, annotation, saveKind, parsedTags, tagRules, smartSuggestions, rejectedSuggestions])

  async function sync(interactive = false) {
    setSyncing(true)
    const response = interactive
      ? await sendMessage<{ synced: number; failed: number }>({ type: 'SIGN_IN' })
      : await sendMessage<{ synced: number; failed: number }>({ type: 'SYNC_NOW', interactive: false })
    setSyncing(false)
    if (response.ok) { setAuthenticated(true); setToast('Your library is up to date'); await refresh() } else setToast(response.error || 'Could not sync')
  }

  async function saveComposer() {
    if (!title.trim() && !note.trim()) return
    if (editing) {
      await updateSavedItem(editing.id, { title, url, ...(editing.kind === 'note' ? { note } : { content: note, note: annotation }), tags: tagsText.split(','), collectionId: collectionId || undefined, markdown })
      setToast('Changes saved offline')
    } else {
      await createItem({ kind: saveKind, title: title.trim() || (saveKind === 'note' ? 'Untitled note' : 'Saved text'), url: url || undefined, ...(saveKind === 'note' ? { note } : { content: note, note: annotation }), tags: tagsText.split(','), collectionId: collectionId || undefined, markdown })
      setToast('Saved offline')
    }
    await chrome.storage.session.remove('quickSaveDraft'); setTitle(''); setNote(''); setAnnotation(''); setUrl(''); setTagsText(''); setCollectionId(''); setMarkdown(false); setComposer(false); setEditing(null); await refresh(); if (authenticated) void sync()
  }

  function openComposer(kind: 'note' | 'text') { setComposerKind(kind); setSaveKind(kind); setEditing(null); setTitle(''); setNote(''); setAnnotation(''); setUrl(''); setTagsText(''); setCollectionId(''); setMarkdown(kind === 'note'); setComposer(true) }
  function openEdit(item: SavedItem) { setEditing(item); setSaveKind(item.kind); setComposerKind(item.kind === 'note' ? 'note' : 'text'); setTitle(item.title); setNote(item.kind === 'note' ? item.note || '' : item.content || ''); setAnnotation(item.kind === 'note' ? '' : item.note || ''); setUrl(item.url || ''); setTagsText(item.tags.join(', ')); setCollectionId(item.collectionId || ''); setMarkdown(Boolean(item.markdown)); setComposer(true) }
  async function updateItem(item: SavedItem, changes: Parameters<typeof updateSavedItem>[1]) { await updateSavedItem(item.id, changes); await refresh(); if (authenticated) void sync() }
  async function deleteItem(item: SavedItem) { await deleteSavedItem(item.id); await refresh(); setToast('Moved to trash') }

  async function retry(item: SavedItem) { await db.items.update(item.id, { syncState: 'pending', lastError: undefined }); await db.syncQueue.where('[entityType+entityId]').equals(['item', item.id]).modify({ nextAttemptAt: new Date().toISOString(), attempts: 0 }); await refresh(); void sync() }
  async function captureScreenshot() {
    setSyncing(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.url || !/^https?:/i.test(tab.url)) throw new Error('Open a normal website before capturing. Chrome pages cannot be captured.')
      const origin = `${new URL(tab.url).origin}/*`
      const permitted = await chrome.permissions.contains({ origins: [origin] }) || await chrome.permissions.request({ origins: [origin] })
      if (!permitted) throw new Error('Site access is required to capture this tab.')
      const response = await sendMessage({ type: 'CAPTURE_SCREENSHOT' })
      setToast(response.ok ? 'Screenshot saved offline' : response.error || 'Could not capture screenshot')
      if (response.ok) { setFilter('screenshot'); await refresh() }
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not capture screenshot') }
    finally { setSyncing(false) }
  }
  async function uploadImage(file?: File) { if (!file) return; if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { setToast('Choose a PNG, JPEG, WebP, or GIF image'); return }; if (file.size > 10_000_000) { setToast('Image must be 10 MB or smaller'); return }; try { const imageDataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read image')); reader.onerror = () => reject(new Error('Could not read image')); reader.readAsDataURL(file) }); await createItem({ kind: 'image', title: file.name.replace(/\.[^.]+$/, '') || 'Uploaded image', imageDataUrl, tags: ['image', 'upload'] }); setFilter('image'); setToast('Image uploaded and saved offline'); await refresh(); if (authenticated) void sync() } catch (error) { setToast(error instanceof Error ? error.message : 'Image upload failed') } finally { if (imageUploadRef.current) imageUploadRef.current.value = '' } }

  const filters: Array<{ value: FilterKind; label: string }> = [{ value: 'all', label: 'All' }, { value: 'favorites', label: 'Favorites' }, { value: 'bookmark', label: 'Pages' }, { value: 'selection', label: 'Selections' }, { value: 'image', label: 'Images' }, { value: 'screenshot', label: 'Screenshots' }, { value: 'text', label: 'Text' }, { value: 'link', label: 'Links' }, { value: 'note', label: 'Notes' }, { value: 'archived', label: 'Archive' }]
  const selectionGroups = filter === 'selection' ? Object.entries(visible.reduce<Record<string, SavedItem[]>>((groups, item) => { const key = item.url || 'No source URL'; (groups[key] ??= []).push(item); return groups }, {})) : []
  const itemCard = (item: SavedItem) => <ItemCard key={item.id} item={item} onDelete={() => void deleteItem(item)} onRetry={() => void retry(item)} onEdit={() => openEdit(item)} onFavorite={() => void updateItem(item, { favorite: !item.favorite })} onArchive={() => void updateItem(item, { archived: !item.archived })} />

  return <main className="sidepanel-shell min-h-screen bg-[radial-gradient(circle_at_top_right,_#f1e8ff_0,_transparent_38%),linear-gradient(#fdfcff,#faf8fc)]">
    <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 px-4 py-3 backdrop-blur-xl"><div className="flex items-center justify-between"><Brand compact /><SyncPill authenticated={authenticated} syncing={syncing} pending={pending} onSync={() => void sync(!authenticated)} /></div></header>
    <section className="p-4">
      <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-lilac-700 via-lilac-600 to-fuchsia-500 p-4 text-white shadow-lg shadow-lilac-200/70">
        <div className="flex items-start justify-between gap-3"><div><div className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"><Sparkles size={11} /> Offline first</div><h1 className="text-lg font-bold tracking-tight">Keep what matters.</h1><p className="mt-1 max-w-xs text-xs leading-5 text-lilac-100">Capture pages, images, screenshots, and ideas. Sync safely to your own Drive.</p></div><div className="flex gap-2"><button disabled={syncing} onClick={() => void captureScreenshot()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-50" title="Capture screenshot"><Camera size={18} /></button><button onClick={() => openComposer('text')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white transition hover:bg-white/25" title="Paste text"><ClipboardPaste size={18} /></button><button onClick={() => openComposer('note')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-lilac-700 shadow-md transition hover:scale-105" title="New note"><Plus size={20} /></button></div></div>
      </div>
      <input ref={imageUploadRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => void uploadImage(event.target.files?.[0])} />
      <button onClick={() => imageUploadRef.current?.click()} className="btn-secondary mb-3 w-full py-2.5 text-xs"><Upload size={15} /> Upload image from device</button>
      <div className="relative mb-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field py-2.5 pl-9" placeholder="Search or use tag:, type:, domain:, is:…" />{query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={15} /></button>}</div><p className="mb-3 px-1 text-[10px] text-slate-400">Try <b>tag:research</b>, <b>type:note</b>, <b>is:favorite</b>, or quoted phrases.</p>
      {collections.length > 0 && <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1"><button onClick={() => setSelectedCollection('')} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${!selectedCollection ? 'border-lilac-300 bg-lilac-50 text-lilac-700' : 'border-slate-100 bg-white text-slate-600'}`}>All collections</button>{collections.map((collection) => <button key={collection.id} onClick={() => setSelectedCollection(collection.id)} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${selectedCollection === collection.id ? 'border-lilac-300 bg-lilac-50 text-lilac-700' : 'border-slate-100 bg-white text-slate-600'}`}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: collection.color }} />{collection.name}</button>)}</div>}
      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1"><Filter size={14} className="mr-1 shrink-0 text-slate-400" />{filters.map((entry) => <button key={entry.value} onClick={() => setFilter(entry.value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === entry.value ? 'bg-lilac-600 text-white' : 'bg-white text-slate-500 hover:bg-lilac-50'}`}>{entry.label}</button>)}</div>
      {visible.length ? filter === 'selection' ? <div className="space-y-4">{selectionGroups.map(([source, group]) => <section key={source}><div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold text-slate-400"><span className="truncate">{group[0]?.domain || source}</span><span className="rounded-full bg-lilac-50 px-2 py-0.5 text-lilac-700">{group.length}</span></div><div className="space-y-2.5">{group.map(itemCard)}</div></section>)}</div> : <div className="space-y-2.5">{visible.map(itemCard)}</div> : <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-lilac-200 bg-white/60 p-6 text-center"><div><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-lilac-100 text-lilac-700"><BookmarkPlus size={22} /></div><h2 className="text-sm font-semibold text-slate-700">{items.length ? 'No matching saves' : 'Your library is ready'}</h2><p className="mx-auto mt-1 max-w-52 text-xs leading-5 text-slate-400">{items.length ? 'Try a different search or filter.' : 'Right-click any page, link, or selected text to save it here.'}</p></div></div>}
    </section>
    {composer && <div className="fixed inset-0 z-30 flex items-end bg-slate-950/25 p-3 backdrop-blur-sm"><div className="card max-h-[92vh] w-full overflow-y-auto p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-800">{editing ? 'Edit item' : saveKind === 'selection' ? 'Save highlight' : composerKind === 'note' ? 'New note' : 'Save pasted text'}</h2><button onClick={() => { setComposer(false); setEditing(null); void chrome.storage.session.remove('quickSaveDraft') }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="field mb-2" placeholder="Title" />{(editing?.url !== undefined || saveKind === 'selection') && <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="field mb-2" placeholder="Source URL" />}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} className="field resize-none" placeholder={composerKind === 'note' ? 'Write something worth keeping…' : 'Text or highlight…'} />{saveKind !== 'note' && <textarea value={annotation} onChange={(e) => setAnnotation(e.target.value)} rows={2} className="field mt-2 resize-none" placeholder="Optional note" />}<input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="field mt-2" placeholder="Tags, separated by commas" /><label className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-slate-500"><input type="checkbox" checked={smartSuggestions} onChange={(event) => { setSmartSuggestions(event.target.checked); void getSettings().then((settings) => db.settings.put({ ...settings, smartTagSuggestions: event.target.checked })) }} className="accent-lilac-600" /> Local smart tag suggestions</label>{tagSuggestions.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5"><span className="py-1 text-[10px] font-semibold text-slate-400">Suggested:</span>{tagSuggestions.map((tag) => <span key={tag} className="inline-flex overflow-hidden rounded-full bg-lilac-50 text-[10px] font-semibold text-lilac-700"><button onClick={() => setTagsText([...parsedTags, tag].join(', '))} className="px-2 py-1">+ {tag}</button><button aria-label={`Reject ${tag}`} onClick={() => setRejectedSuggestions((current) => [...current, tag])} className="px-1.5 hover:bg-lilac-100">×</button></span>)}</div>}<select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className="field mt-2"><option value="">No collection</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select>{saveKind === 'note' && <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={markdown} onChange={(e) => setMarkdown(e.target.checked)} className="accent-lilac-600" /> Markdown note</label>}<div className="mt-3 flex justify-end gap-2"><button onClick={() => { setComposer(false); setEditing(null); void chrome.storage.session.remove('quickSaveDraft') }} className="btn-secondary">Cancel</button><button onClick={() => void saveComposer()} className="btn-primary"><Check size={16} /> Save locally</button></div></div></div>}
    {toast && <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xl">{toast}</div>}
  </main>
}
