import { Archive, Bookmark, Camera, ExternalLink, FileText, Image as ImageIcon, Link2, MessageSquareText, Pencil, RotateCw, Star, Trash2 } from 'lucide-react'
import { kindLabel, hostFromUrl, relativeTime } from '../lib'
import type { SavedItem } from '../types'

const icons = { bookmark: Bookmark, selection: FileText, link: Link2, note: MessageSquareText, text: FileText, image: ImageIcon, screenshot: Camera }

export function ItemCard({ item, collectionName, selected, onSelect, onOpen, onDelete, onRetry, onEdit, onFavorite, onArchive }: { item: SavedItem; collectionName?: string; selected?: boolean; onSelect?: () => void; onOpen?: () => void; onDelete: () => void; onRetry: () => void; onEdit: () => void; onFavorite: () => void; onArchive: () => void }) {
  const Icon = icons[item.kind]
  const excerpt = item.content || item.note
  const visual = item.imageDataUrl || item.imageUrl
  return <article className={`item-card group rounded-3xl border bg-white/95 p-4 shadow-[0_8px_30px_rgba(76,29,149,.06)] transition duration-200 hover:-translate-y-1 hover:border-lilac-200 hover:shadow-[0_18px_45px_rgba(76,29,149,.12)] ${selected ? 'border-lilac-400 ring-4 ring-lilac-100' : 'border-white'}`}>
    {visual && <button onClick={() => window.open(visual, '_blank', 'noopener,noreferrer')} className="relative mb-4 block h-40 w-full overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#ede9fe,#f5d0fe)] text-left"><img src={visual} alt={item.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" /><span className="absolute bottom-2 left-2 rounded-lg bg-slate-950/65 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur">{item.kind === 'screenshot' ? 'Screenshot' : 'Saved image'}</span></button>}
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex shrink-0 flex-col items-center gap-2">{onSelect && <input aria-label={`Select ${item.title}`} type="checkbox" checked={Boolean(selected)} onChange={onSelect} className="h-4 w-4 rounded accent-lilac-600" />}<div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-lilac-100 to-violet-50 text-lilac-700 shadow-inner"><Icon size={18} /></div></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-800"><button onClick={onOpen} className="text-left hover:text-lilac-700">{item.title}</button></h3><div className="flex shrink-0 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button onClick={onFavorite} title={item.favorite ? 'Remove favorite' : 'Favorite'} className={`rounded-lg p-1.5 hover:bg-amber-50 ${item.favorite ? 'text-amber-500' : 'text-slate-400 hover:text-amber-600'}`}><Star size={14} fill={item.favorite ? 'currentColor' : 'none'} /></button>
          <button onClick={onEdit} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-lilac-50 hover:text-lilac-700"><Pencil size={14} /></button>
          <button onClick={onArchive} title={item.archived ? 'Restore' : 'Archive'} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Archive size={14} /></button>
          {item.syncState === 'failed' && <button onClick={onRetry} title="Retry sync" className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"><RotateCw size={14} /></button>}
          <button onClick={onDelete} title="Delete local copy" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
        </div></div>
        {excerpt && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-500">{excerpt}</p>}
        {item.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-md bg-lilac-50 px-1.5 py-0.5 text-[10px] font-medium text-lilac-700">#{tag}</span>)}</div>}
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-400"><span className="rounded-lg bg-slate-50 px-2 py-1 font-bold uppercase tracking-wide text-slate-500">{kindLabel(item.kind)}</span>{collectionName && <span className="max-w-24 truncate rounded-lg bg-lilac-50 px-2 py-1 font-semibold text-lilac-700">{collectionName}</span>}{hostFromUrl(item.url) && <span className="hidden truncate sm:inline">{hostFromUrl(item.url)}</span>}<span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${item.syncState === 'synced' ? 'bg-emerald-400' : item.syncState === 'failed' || item.syncState === 'conflict' ? 'bg-rose-400' : 'bg-amber-400'}`} title={`Sync: ${item.syncState}`} /><span className="shrink-0">{relativeTime(item.createdAt)}</span>{item.url && <a href={item.url} target="_blank" rel="noreferrer" title="Open link" className="rounded-lg p-1 text-lilac-500 hover:bg-lilac-50 hover:text-lilac-700"><ExternalLink size={13} /></a>}</div>
      </div>
    </div>
  </article>
}
