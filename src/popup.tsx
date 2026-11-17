import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ArrowRight, Bookmark, Camera, Check, ChevronRight, Cloud, CloudOff, ExternalLink, FileText, Image as ImageIcon, LayoutDashboard, LoaderCircle, NotebookPen, Search, Settings, Sparkles } from 'lucide-react'
import { Brand } from './components/Brand'
import { db } from './db'
import { matchesSearch, sendMessage } from './lib'
import type { QuickSaveDraft, SavedItem } from './types'
import './index.css'
import './theme'

type Tab = 'bookmark' | 'selection' | 'note' | 'visual'
interface PageContext { title: string; url?: string; domain?: string; favIconUrl?: string }

function Popup() {
  const [saved, setSaved] = useState(false), [busy, setBusy] = useState<'page' | 'screenshot'>(), [items, setItems] = useState<SavedItem[]>([]), [query, setQuery] = useState(''), [tab, setTab] = useState<Tab>('bookmark')
  const [connected, setConnected] = useState(false), [pending, setPending] = useState(0), [message, setMessage] = useState(''), [page, setPage] = useState<PageContext>({ title: 'Current website' })
  async function refresh() { setItems(await db.items.orderBy('createdAt').reverse().limit(30).toArray()); setPending(await db.syncQueue.count()) }
  useEffect(() => {
    void refresh()
    void sendMessage<boolean>({ type: 'AUTH_STATUS' }).then((response) => setConnected(Boolean(response.data)))
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      let domain: string | undefined
      try { domain = active?.url ? new URL(active.url).hostname.replace(/^www\./, '') : undefined } catch { /* Chrome internal page. */ }
      setPage({ title: active?.title || 'Current website', url: active?.url, domain, favIconUrl: active?.favIconUrl })
    })
  }, [])
  const recent = useMemo(() => items.filter((item) => !item.deletedAt && !item.archived && (tab === 'bookmark' ? item.kind === 'bookmark' || item.kind === 'link' : tab === 'selection' ? item.kind === 'selection' || item.kind === 'text' : tab === 'visual' ? item.kind === 'image' || item.kind === 'screenshot' : item.kind === 'note') && matchesSearch(item, query)).slice(0, 4), [items, query, tab])
  async function savePage() {
    if (!page.url || busy) return
    setBusy('page'); setMessage('')
    try {
      const response = await sendMessage({ type: 'SAVE_ITEM', payload: { kind: 'bookmark', title: page.title || 'Saved page', url: page.url, tags: [] } })
      if (!response.ok) throw new Error(response.error || 'Could not save this page')
      setSaved(true); setMessage('Page saved locally and queued for Drive'); await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this page') }
    finally { setBusy(undefined) }
  }
  async function captureScreenshot() {
    if (busy) return
    setBusy('screenshot'); setMessage('')
    try {
      const response = await sendMessage({ type: 'CAPTURE_SCREENSHOT' })
      if (!response.ok) throw new Error(response.error || 'Screenshot capture failed')
      setTab('visual'); setMessage('Screenshot saved locally and queued for Drive'); await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Screenshot capture failed') }
    finally { setBusy(undefined) }
  }
  async function openPanel(draft?: QuickSaveDraft) { if (draft) await chrome.storage.session.set({ quickSaveDraft: draft }); await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT }); window.close() }
  function openDashboard() { void sendMessage({ type: 'OPEN_DASHBOARD' }).then(() => window.close()) }
  const successful = message.includes('saved') || message.includes('queued')

  return <main className="popup-shell max-h-[600px] w-[404px] overflow-x-hidden overflow-y-auto bg-[#F9F7FF] text-[#241B35]">
    <header className="popup-header flex items-center justify-between px-5 pb-3 pt-4"><Brand /><div className="flex items-center gap-2"><button onClick={() => { if (!connected) chrome.runtime.openOptionsPage() }} className={`popup-sync-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-extrabold ${connected ? pending ? 'border-amber-100 bg-amber-50 text-amber-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>{connected ? <Cloud size={12} /> : <CloudOff size={12} />}{connected ? pending ? `${pending} waiting` : 'Drive ready' : 'Connect Drive'}</button><button onClick={() => chrome.runtime.openOptionsPage()} aria-label="Open settings" className="popup-icon-button grid h-9 w-9 place-items-center rounded-xl border border-lilac-100 bg-white text-slate-400 shadow-sm transition hover:-translate-y-0.5 hover:text-lilac-700"><Settings size={16} /></button></div></header>
    <section className="px-4 pb-4">
      <div className="popup-command relative overflow-hidden rounded-[1.65rem] bg-gradient-to-br from-[#35105F] via-[#6D28D9] to-[#C026D3] p-4 text-white shadow-[0_18px_42px_rgba(109,40,217,.28)]"><div className="absolute -right-9 -top-12 h-32 w-32 rounded-full bg-white/15 blur-2xl" /><div className="absolute -bottom-12 left-12 h-24 w-44 rounded-full bg-fuchsia-300/15 blur-2xl" /><div className="relative z-10"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-inner">{page.favIconUrl ? <img src={page.favIconUrl} alt="" className="h-6 w-6 rounded-md" /> : <Bookmark size={20} />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[.16em] text-violet-200"><Sparkles size={11} /> Ready to capture</div><h1 className="mt-1.5 truncate text-[15px] font-black" title={page.title}>{page.title}</h1><p className="mt-0.5 truncate text-[10px] text-violet-200/75">{page.domain || 'This browser page'}</p></div></div><button disabled={!page.url || Boolean(busy) || saved} onClick={() => void savePage()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-violet-900 shadow-lg shadow-violet-950/15 transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-80">{busy === 'page' ? <LoaderCircle className="animate-spin" size={16} /> : saved ? <Check size={16} /> : <Bookmark size={16} />}{busy === 'page' ? 'Saving page…' : saved ? 'Page saved' : 'Save this page'}<ArrowRight className="ml-auto" size={15} /></button></div></div>
      <div className="mt-3 grid grid-cols-2 gap-2.5"><button disabled={Boolean(busy)} onClick={() => void captureScreenshot()} className="popup-action group flex items-center gap-3 rounded-2xl border border-lilac-100 bg-white p-3 text-left shadow-[0_8px_24px_rgba(76,29,149,.06)] transition hover:-translate-y-0.5 hover:border-lilac-200"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-50 to-violet-100 text-fuchsia-600">{busy === 'screenshot' ? <LoaderCircle className="animate-spin" size={17} /> : <Camera size={17} />}</span><span className="min-w-0"><span className="block text-xs font-extrabold">Screenshot</span><span className="mt-0.5 block text-[9px] text-slate-400">Capture visible area</span></span><ChevronRight className="ml-auto text-slate-300 group-hover:text-lilac-500" size={14} /></button><button onClick={() => void openPanel({ kind: 'note', title: '', content: '', createdAt: new Date().toISOString() })} className="popup-action group flex items-center gap-3 rounded-2xl border border-lilac-100 bg-white p-3 text-left shadow-[0_8px_24px_rgba(76,29,149,.06)] transition hover:-translate-y-0.5 hover:border-lilac-200"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-cyan-100 text-blue-600"><NotebookPen size={17} /></span><span className="min-w-0"><span className="block text-xs font-extrabold">Quick note</span><span className="mt-0.5 block text-[9px] text-slate-400">Open composer</span></span><ChevronRight className="ml-auto text-slate-300 group-hover:text-lilac-500" size={14} /></button></div>
      {message && <div role="status" className={`popup-message mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold ${successful ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>{successful ? <Check size={13} /> : <CloudOff size={13} />}{message}</div>}
      <div className="mt-4 flex items-center justify-between"><div><p className="text-[9px] font-extrabold uppercase tracking-[.17em] text-lilac-500">Your library</p><h2 className="mt-0.5 text-sm font-black">Recently saved</h2></div><button onClick={openDashboard} className="inline-flex items-center gap-1 text-[10px] font-extrabold text-lilac-700 hover:text-lilac-900">View all <ExternalLink size={11} /></button></div>
      <div className="relative mt-2.5"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="popup-search w-full rounded-xl border border-lilac-100 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition placeholder:text-slate-300 focus:border-lilac-300 focus:ring-2 focus:ring-lilac-100" placeholder="Search recent content" /></div>
      <div className="popup-tabs mt-2.5 grid grid-cols-4 rounded-xl border border-lilac-50 bg-white p-1 shadow-sm">{([['bookmark', 'Pages'], ['selection', 'Highlights'], ['note', 'Notes'], ['visual', 'Visuals']] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-lg py-1.5 text-[10px] font-bold transition ${tab === id ? 'bg-gradient-to-r from-lilac-100 to-violet-50 text-lilac-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{label}</button>)}</div>
      <div className="popup-recents mt-2 min-h-[132px] space-y-1">{recent.map((item) => { const visual = item.imageDataUrl || item.imageUrl; return <button key={item.id} onClick={() => item.url ? window.open(item.url, '_blank', 'noopener,noreferrer') : openDashboard()} className="popup-recent group flex w-full items-center gap-3 rounded-xl border border-transparent bg-white/65 p-2 text-left transition hover:border-lilac-100 hover:bg-white hover:shadow-sm">{visual ? <img src={visual} alt="" className="h-9 w-11 shrink-0 rounded-lg object-cover" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lilac-50 text-lilac-600">{item.kind === 'image' || item.kind === 'screenshot' ? <ImageIcon size={15} /> : <FileText size={15} />}</span>}<span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold text-slate-700">{item.title}</span><span className="mt-0.5 block truncate text-[9px] text-slate-400">{item.domain || item.tags.join(' · ') || new Date(item.createdAt).toLocaleDateString()}</span></span><ChevronRight size={14} className="text-slate-200 transition group-hover:translate-x-0.5 group-hover:text-lilac-500" /></button> })}{recent.length === 0 && <div className="grid min-h-[124px] place-items-center rounded-xl border border-dashed border-lilac-100 bg-white/45 text-center"><div><Search className="mx-auto text-lilac-200" size={22} /><p className="mt-2 text-[11px] font-bold text-slate-400">No matching items yet</p></div></div>}</div>
      <button onClick={openDashboard} className="popup-dashboard mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-lilac-100 bg-white py-2.5 text-xs font-extrabold text-lilac-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-lilac-50"><LayoutDashboard size={15} /> Open full Dashboard <ArrowRight className="ml-auto mr-3" size={14} /></button>
    </section>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup /></React.StrictMode>)
