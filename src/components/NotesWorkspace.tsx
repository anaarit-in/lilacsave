import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  CalendarDays,
  Check,
  Clock3,
  Code2,
  FileText,
  Folder,
  Heart,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { createItem, deleteItem, updateItem } from '../repository'
import type { Collection, SavedItem } from '../types'

interface NotesWorkspaceProps {
  notes: SavedItem[]
  collections: Collection[]
  selected: Set<string>
  onToggleSelected: (id: string) => void
  createSignal: number
  onRefresh: () => Promise<void>
  onOpen: (item: SavedItem) => void
  onToast: (message: string) => void
}

type NoteFilter = 'all' | 'favorites' | 'markdown' | 'recent'
type LocalDraft = {
  title: string
  body: string
  tags: string
  collectionId: string
  markdown: boolean
  updatedAt: string
}

const DRAFT_KEY = 'lilacsaveNoteDraft'

export function NotesWorkspace({
  notes,
  collections,
  selected,
  onToggleSelected,
  createSignal,
  onRefresh,
  onOpen,
  onToast,
}: NotesWorkspaceProps) {
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [collectionFilter, setCollectionFilter] = useState('')
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string>()
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [markdown, setMarkdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const activeCollections = useMemo(
    () => collections.filter((collection) => !collection.deletedAt),
    [collections],
  )
  const collectionNames = useMemo(
    () => new Map(activeCollections.map((collection) => [collection.id, collection.name])),
    [activeCollections],
  )
  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return notes.filter((note) => {
      if (collectionFilter && note.collectionId !== collectionFilter) return false
      if (filter === 'favorites' && !note.favorite) return false
      if (filter === 'markdown' && !note.markdown) return false
      if (filter === 'recent' && Date.parse(note.updatedAt) < Date.now() - 7 * 86400000) return false
      if (!normalizedQuery) return true
      return [note.title, note.note, note.content, note.tags.join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    })
  }, [notes, filter, collectionFilter, query])
  const active = notes.find((note) => note.id === activeId) || visibleNotes[0]
  const content = (note: SavedItem) => note.note || note.content || ''
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0
  const favoriteCount = notes.filter((note) => note.favorite).length
  const markdownCount = notes.filter((note) => note.markdown).length
  const recentCount = notes.filter(
    (note) => Date.parse(note.updatedAt) >= Date.now() - 7 * 86400000,
  ).length

  const filters: Array<{ id: NoteFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: notes.length },
    { id: 'favorites', label: 'Favorites', count: favoriteCount },
    { id: 'recent', label: 'Recent', count: recentCount },
    { id: 'markdown', label: 'Markdown', count: markdownCount },
  ]

  function resetForm() {
    setTitle('')
    setBody('')
    setTags('')
    setCollectionId('')
    setMarkdown(true)
    setShowOptions(false)
    setDraftSaved(false)
  }

  async function startCreate() {
    setCreating(true)
    setEditing(false)
    setActiveId(undefined)
    resetForm()
    const stored = await chrome.storage.local.get(DRAFT_KEY)
    const draft = stored[DRAFT_KEY] as LocalDraft | undefined
    if (draft && (draft.title || draft.body)) {
      setTitle(draft.title)
      setBody(draft.body)
      setTags(draft.tags)
      setCollectionId(draft.collectionId)
      setMarkdown(draft.markdown)
      setDraftSaved(true)
      onToast('Recovered your unsaved note')
    }
    window.setTimeout(() => titleRef.current?.focus(), 0)
  }

  function startEdit(note: SavedItem) {
    setCreating(false)
    setEditing(true)
    setActiveId(note.id)
    setTitle(note.title)
    setBody(content(note))
    setTags(note.tags.join(', '))
    setCollectionId(note.collectionId || '')
    setMarkdown(Boolean(note.markdown))
    setShowOptions(false)
    setDraftSaved(false)
    window.setTimeout(() => titleRef.current?.focus(), 0)
  }

  function closeEditor() {
    setCreating(false)
    setEditing(false)
    setShowOptions(false)
    if (!activeId) setActiveId(visibleNotes[0]?.id)
  }

  useEffect(() => {
    if (createSignal > 0) void startCreate()
    // createSignal is the deliberate external composer trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal])

  useEffect(() => {
    if (!creating) return
    setDraftSaved(false)
    const timer = window.setTimeout(() => {
      const draft: LocalDraft = {
        title,
        body,
        tags,
        collectionId,
        markdown,
        updatedAt: new Date().toISOString(),
      }
      void chrome.storage.local.set({ [DRAFT_KEY]: draft }).then(() => setDraftSaved(true))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [creating, title, body, tags, collectionId, markdown])

  async function save() {
    if ((!creating && !editing) || (!title.trim() && !body.trim())) return
    setSaving(true)
    try {
      if (creating) {
        const note = await createItem({
          kind: 'note',
          title: title.trim() || 'Untitled note',
          note: body,
          tags: tags.split(','),
          collectionId: collectionId || undefined,
          markdown,
        })
        setActiveId(note.id)
        await chrome.storage.local.remove(DRAFT_KEY)
      } else if (active) {
        await updateItem(active.id, {
          title: title.trim() || 'Untitled note',
          note: body,
          tags: tags.split(','),
          collectionId: collectionId || undefined,
          markdown,
        })
        setActiveId(active.id)
      }
      await onRefresh()
      onToast(creating ? 'Note created offline' : 'Changes saved offline')
      setCreating(false)
      setEditing(false)
      setShowOptions(false)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(note: SavedItem, key: 'favorite' | 'archived') {
    await updateItem(note.id, { [key]: !note[key] })
    await onRefresh()
  }

  async function remove(note: SavedItem) {
    if (!confirm(`Move “${note.title}” to trash?`)) return
    await deleteItem(note.id)
    if (activeId === note.id) setActiveId(undefined)
    await onRefresh()
    onToast('Note moved to trash')
  }

  function editorKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void save()
    }
    if (event.key === 'Escape') closeEditor()
  }

  return (
    <div className="notes-workspace space-y-5">
      <section className="notes-hero relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2A1248] via-[#6D28D9] to-[#A855F7] p-6 text-white shadow-[0_22px_65px_rgba(109,40,217,.22)] sm:p-7">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.16em]"><NotebookPen size={13} /> Notes</div>
            <h2 className="mt-3 text-2xl font-black tracking-[-.035em] sm:text-3xl">A simpler place to think.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-violet-100/70">Find a note, start writing, and let LilacSave protect your draft automatically.</p>
          </div>
          <button onClick={() => void startCreate()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-violet-900 shadow-xl transition hover:-translate-y-0.5"><Plus size={16} /> New note</button>
        </div>
      </section>

      <section className="grid min-h-[680px] overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_18px_60px_rgba(76,29,149,.1)] lg:grid-cols-[350px_minmax(0,1fr)]">
        <aside className="border-b border-lilac-100 bg-[#FBFAFF] lg:border-b-0 lg:border-r">
          <div className="border-b border-lilac-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-sm font-black">Your notes</div><div className="mt-0.5 text-[10px] text-slate-400">{visibleNotes.length} shown</div></div>
              <button onClick={() => void startCreate()} className="grid h-9 w-9 place-items-center rounded-xl bg-lilac-600 text-white shadow-md hover:bg-lilac-700" aria-label="Create note"><Plus size={16} /></button>
            </div>
            <div className="relative mt-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field py-2.5 pl-9 text-xs" placeholder="Search notes" />{query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear note search"><X size={13} /></button>}</div>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{filters.map((entry) => <button key={entry.id} onClick={() => setFilter(entry.id)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${filter === entry.id ? 'bg-lilac-600 text-white' : 'bg-white text-slate-500 hover:bg-lilac-50'}`}>{entry.label} <span className="opacity-65">{entry.count}</span></button>)}</div>
            <select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)} className="field mt-3 py-2.5 text-xs"><option value="">All collections</option>{activeCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select>
          </div>

          <div className="max-h-[520px] overflow-y-auto p-2">
            {visibleNotes.map((note) => (
              <button key={note.id} onClick={() => { setActiveId(note.id); setCreating(false); setEditing(false) }} className={`group mb-1 w-full rounded-2xl border p-3 text-left transition ${active?.id === note.id && !creating ? 'border-lilac-200 bg-lilac-50/70 shadow-sm' : 'border-transparent hover:bg-white'}`}>
                <div className="flex items-start gap-2.5">
                  <input aria-label={`Select ${note.title}`} type="checkbox" checked={selected.has(note.id)} onClick={(event) => event.stopPropagation()} onChange={() => onToggleSelected(note.id)} className="mt-1 h-3.5 w-3.5 shrink-0 accent-lilac-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2"><h3 className="line-clamp-1 flex-1 text-xs font-extrabold text-[#241B35]">{note.title}</h3>{note.favorite && <Heart size={11} className="shrink-0 text-rose-500" fill="currentColor" />}</div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{content(note) || 'Empty note'}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[9px] text-slate-400"><CalendarDays size={10} />{new Date(note.updatedAt).toLocaleDateString()}{note.collectionId && <span className="ml-auto max-w-24 truncate rounded-md bg-white px-1.5 py-0.5 font-bold text-lilac-600">{collectionNames.get(note.collectionId)}</span>}</div>
                  </div>
                </div>
              </button>
            ))}
            {visibleNotes.length === 0 && <div className="grid min-h-64 place-items-center p-6 text-center"><div><NotebookPen className="mx-auto text-lilac-300" size={28} /><div className="mt-3 text-sm font-bold">No notes found</div><p className="mt-1 text-[10px] leading-4 text-slate-400">Try another filter or create a note.</p><button onClick={() => void startCreate()} className="mt-3 text-xs font-bold text-lilac-700">Create note</button></div></div>}
          </div>
        </aside>

        <main className="min-w-0 bg-white">
          {creating || editing ? (
            <div className="flex h-full min-h-[650px] flex-col" onKeyDown={editorKeyDown}>
              <header className="flex items-center justify-between border-b border-lilac-100 px-5 py-3.5">
                <div className="flex items-center gap-2 text-[10px] text-slate-400"><span className={`h-2 w-2 rounded-full ${saving ? 'bg-amber-400' : draftSaved || editing ? 'bg-emerald-400' : 'bg-slate-300'}`} />{saving ? 'Saving…' : creating ? draftSaved ? 'Draft saved on this device' : 'Saving draft…' : 'Editing note'}</div>
                <div className="flex items-center gap-1"><button onClick={() => setShowOptions((value) => !value)} className={`rounded-xl p-2 ${showOptions ? 'bg-lilac-50 text-lilac-700' : 'text-slate-400 hover:bg-slate-100'}`} aria-label="Note options"><MoreHorizontal size={17} /></button><button onClick={closeEditor} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close editor"><X size={17} /></button></div>
              </header>
              <div className="flex-1 p-5 sm:p-8">
                <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full border-0 bg-transparent text-2xl font-black tracking-tight outline-none placeholder:text-slate-300 sm:text-3xl" placeholder="Give your note a title" />
                <textarea value={body} onChange={(event) => setBody(event.target.value)} className="mt-5 min-h-[380px] w-full resize-none border-0 bg-transparent text-sm leading-8 text-slate-600 outline-none placeholder:text-slate-300" placeholder="Start writing…" />
              </div>
              {showOptions && <div className="grid gap-3 border-t border-lilac-100 bg-[#FBFAFF] p-4 sm:grid-cols-2"><label className="text-[10px] font-bold text-slate-400">Collection<select value={collectionId} onChange={(event) => setCollectionId(event.target.value)} className="field mt-1.5 py-2"><option value="">No collection</option>{activeCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label><label className="text-[10px] font-bold text-slate-400">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} className="field mt-1.5 py-2" placeholder="research, ideas" /></label><label className="flex items-center gap-2 text-xs font-bold text-lilac-700"><input type="checkbox" checked={markdown} onChange={(event) => setMarkdown(event.target.checked)} className="accent-lilac-600" /><Code2 size={14} /> Markdown note</label></div>}
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-lilac-100 bg-[#FBFAFF] px-5 py-4">
                <div className="text-[10px] text-slate-400">{wordCount} word{wordCount === 1 ? '' : 's'} · Ctrl/Cmd + Enter to save</div>
                <div className="flex gap-2"><button onClick={closeEditor} className="btn-secondary py-2 text-xs">Cancel</button><button disabled={saving || (!title.trim() && !body.trim())} onClick={() => void save()} className="btn-primary py-2 text-xs"><Check size={14} />{saving ? 'Saving…' : creating ? 'Create note' : 'Save changes'}</button></div>
              </footer>
            </div>
          ) : active ? (
            <article className="flex h-full min-h-[650px] flex-col">
              <header className="flex items-center justify-between border-b border-lilac-100 px-5 py-4">
                <div className="flex items-center gap-2 text-[10px] text-slate-400"><Clock3 size={12} /> Updated {new Date(active.updatedAt).toLocaleString()}</div>
                <div className="flex gap-1"><button onClick={() => void toggle(active, 'favorite')} className={`rounded-xl p-2 ${active.favorite ? 'bg-rose-50 text-rose-500' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-500'}`} aria-label="Favorite note"><Heart size={16} fill={active.favorite ? 'currentColor' : 'none'} /></button><button onClick={() => void toggle(active, 'archived')} className="rounded-xl p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600" aria-label="Archive note"><Archive size={16} /></button><button onClick={() => void remove(active)} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete note"><Trash2 size={16} /></button></div>
              </header>
              <div className="flex-1 overflow-y-auto p-6 sm:p-10">
                <div className="mb-4 flex flex-wrap gap-2">{active.markdown && <span className="rounded-lg bg-lilac-50 px-2 py-1 text-[10px] font-bold text-lilac-700">Markdown</span>}{active.collectionId && <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"><Folder size={11} />{collectionNames.get(active.collectionId)}</span>}</div>
                <h2 className="text-3xl font-black tracking-[-.04em] text-[#241B35]">{active.title}</h2>
                <div className="mt-7 whitespace-pre-wrap text-sm leading-8 text-slate-600">{content(active) || <span className="italic text-slate-300">This note is empty.</span>}</div>
                {active.tags.length > 0 && <div className="mt-9 flex flex-wrap gap-2 border-t border-slate-100 pt-5">{active.tags.map((tag) => <span key={tag} className="rounded-lg bg-lilac-50 px-2 py-1 text-[10px] font-bold text-lilac-700">#{tag}</span>)}</div>}
              </div>
              <footer className="flex items-center justify-between border-t border-lilac-100 bg-[#FBFAFF] px-5 py-4"><button onClick={() => onOpen(active)} className="text-xs font-bold text-slate-500 hover:text-lilac-700">View details</button><button onClick={() => startEdit(active)} className="btn-primary py-2 text-xs"><FileText size={14} /> Edit note</button></footer>
            </article>
          ) : (
            <div className="grid min-h-[650px] place-items-center p-8 text-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-lilac-50 text-lilac-500"><Sparkles size={27} /></div><h3 className="mt-4 text-lg font-black">Write your first note</h3><p className="mt-2 text-xs text-slate-400">Your draft saves automatically on this device.</p><button onClick={() => void startCreate()} className="btn-primary mt-5"><Plus size={15} /> New note</button></div></div>
          )}
        </main>
      </section>
    </div>
  )
}
