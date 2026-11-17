import { Check, CloudOff, LoaderCircle, RefreshCw } from 'lucide-react'

export function SyncPill({ authenticated, syncing, pending, onSync }: { authenticated: boolean; syncing: boolean; pending: number; onSync: () => void }) {
  const icon = syncing ? <LoaderCircle size={13} className="animate-spin" /> : !authenticated ? <CloudOff size={13} /> : pending ? <RefreshCw size={13} /> : <Check size={13} />
  const label = syncing ? 'Syncing' : !authenticated ? 'Offline' : pending ? `${pending} pending` : 'Synced'
  return <button onClick={onSync} disabled={syncing} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold ${!authenticated ? 'bg-slate-100 text-slate-500' : pending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{icon}{label}</button>
}
