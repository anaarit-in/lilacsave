import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  Cloud,
  CreditCard,
  Database,
  DollarSign,
  Download,
  ExternalLink,
  FileClock,
  Flag,
  Folder,
  HardDrive,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { Brand } from './components/Brand'
import { PlanCatalogCards } from './components/PlanCatalogCards'
import { resolveBillingProfile } from './billing'
import { createDriveBackup } from './backup'
import { db, getSettings, getSyncMetadata } from './db'
import { listDriveBackups } from './drive'
import { sendMessage } from './lib'
import type { Settings as AppSettings } from './types'
import './index.css'
import './theme'

type AdminSection =
  | 'overview'
  | 'users'
  | 'plans'
  | 'payments'
  | 'features'
  | 'security'
  | 'audit'
  | 'system'

type BillingPlan = 'free' | 'professional' | 'team' | 'business' | 'ai'
type PaymentRecord = {
  id: string
  date: string
  plan: string
  amount: number
  currency: string
  status: 'paid' | 'refunded' | 'failed' | 'pending'
  receiptUrl?: string
}
type BillingProfile = { plan: BillingPlan; renewalDate?: string; payments: PaymentRecord[] }
type AdminSnapshot = {
  items: number
  collections: number
  tags: number
  pending: number
  failed: number
  backups: number
  lastSync?: string
  authenticated: boolean
  settings: AppSettings
}

const sections: Array<{
  id: AdminSection
  label: string
  description: string
  icon: typeof BarChart3
}> = [
  { id: 'overview', label: 'Overview', description: 'Platform pulse', icon: BarChart3 },
  { id: 'users', label: 'Users', description: 'Access and accounts', icon: Users },
  { id: 'plans', label: 'Plans', description: 'Products and entitlements', icon: Sparkles },
  { id: 'payments', label: 'Payments', description: 'Revenue and invoices', icon: CreditCard },
  { id: 'features', label: 'Feature controls', description: 'Local feature flags', icon: Flag },
  { id: 'security', label: 'Security', description: 'Permissions and identity', icon: ShieldCheck },
  { id: 'audit', label: 'Audit activity', description: 'Operational timeline', icon: FileClock },
  { id: 'system', label: 'System health', description: 'Storage and services', icon: Activity },
]

const sectionCopy: Record<AdminSection, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: 'Operations center', title: 'Platform overview', description: 'Monitor the real health of this LilacSave installation and its connected services.' },
  users: { eyebrow: 'Identity', title: 'Users and access', description: 'Review the local operator now and connect a protected admin API for organization-wide account management.' },
  plans: { eyebrow: 'Products', title: 'Plans and entitlements', description: 'Keep pricing, feature boundaries, and release availability clear and consistent.' },
  payments: { eyebrow: 'Billing', title: 'Payments and invoices', description: 'Review locally available billing records and prepare secure provider-backed operations.' },
  features: { eyebrow: 'Configuration', title: 'Feature controls', description: 'Control real device-level behavior without changing or fabricating cloud account entitlements.' },
  security: { eyebrow: 'Trust center', title: 'Security and permissions', description: 'Inspect identity, data boundaries, OAuth scope, and administrative readiness.' },
  audit: { eyebrow: 'Accountability', title: 'Audit activity', description: 'A concise timeline generated from genuine local sync, billing, backup, and configuration state.' },
  system: { eyebrow: 'Reliability', title: 'System health', description: 'Check local storage, synchronization, Drive access, backups, and extension runtime status.' },
}

const defaultBilling: BillingProfile = { plan: 'free', payments: [] }
const allowedAdminEmails = (import.meta.env.VITE_SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLocaleLowerCase())
  .filter(Boolean)

function money(value: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
}

function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function SuperAdmin() {
  const [section, setSection] = useState<AdminSection>('overview')
  const [sidebar, setSidebar] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [billing, setBilling] = useState<BillingProfile>(defaultBilling)
  const [snapshot, setSnapshot] = useState<AdminSnapshot>()

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const [items, collections, tags, pending, failed, settings, metadata, authResponse, stored] =
        await Promise.all([
          db.items.filter((item) => !item.deletedAt).count(),
          db.collections.filter((collection) => !collection.deletedAt).count(),
          db.tags.count(),
          db.syncQueue.count(),
          db.items.where('syncState').equals('failed').count(),
          getSettings(),
          getSyncMetadata(),
          sendMessage<boolean>({ type: 'AUTH_STATUS' }),
          resolveBillingProfile(),
        ])
      const authenticated = Boolean(authResponse.data)
      let backups = 0
      if (authenticated) {
        try {
          backups = (await listDriveBackups()).length
        } catch {
          backups = 0
        }
      }
      setBilling(stored.profile)
      setSnapshot({
        items,
        collections,
        tags,
        pending,
        failed,
        backups,
        lastSync: metadata.lastSuccessfulSyncAt,
        authenticated,
        settings,
      })
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(''), 3200)
    return () => clearTimeout(timer)
  }, [status])

  async function updateSetting(changes: Partial<AppSettings>) {
    if (!snapshot) return
    const next = { ...snapshot.settings, ...changes }
    await db.settings.put(next)
    setSnapshot({ ...snapshot, settings: next })
    setStatus('Local feature configuration updated.')
  }

  async function synchronize() {
    setBusy(true)
    const response = await sendMessage({ type: 'SYNC_NOW', interactive: !snapshot?.authenticated })
    setStatus(response.ok ? 'Synchronization completed.' : response.error || 'Synchronization failed.')
    await refresh()
  }

  async function backup() {
    if (!snapshot?.authenticated) {
      setStatus('Connect Google Drive before creating an administrative backup.')
      return
    }
    setBusy(true)
    try {
      await createDriveBackup('manual')
      setStatus('Administrative recovery point created in Google Drive.')
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Backup failed.')
    } finally {
      setBusy(false)
    }
  }

  const paidPayments = billing.payments.filter((payment) => payment.status === 'paid')
  const revenue = paidPayments.reduce((total, payment) => total + payment.amount, 0)
  const activeCopy = sectionCopy[section]
  const healthScore = snapshot
    ? [snapshot.failed === 0, snapshot.pending === 0, snapshot.authenticated, Boolean(snapshot.lastSync)].filter(Boolean).length
    : 0
  const auditEvents = useMemo(() => {
    const events: Array<{ title: string; detail: string; time?: string; tone: 'success' | 'info' | 'warning' }> = []
    if (snapshot?.lastSync) events.push({ title: 'Google Drive synchronization completed', detail: `${snapshot.items} active records available locally.`, time: snapshot.lastSync, tone: 'success' })
    if (snapshot?.settings.lastScheduledBackupAt) events.push({ title: 'Scheduled backup recorded', detail: `${snapshot.backups} Drive backup${snapshot.backups === 1 ? '' : 's'} currently visible.`, time: snapshot.settings.lastScheduledBackupAt, tone: 'success' })
    for (const payment of billing.payments.slice(0, 5)) events.push({ title: `${payment.status === 'paid' ? 'Payment completed' : `Payment ${payment.status}`}`, detail: `${payment.plan} · ${money(payment.amount, payment.currency)}`, time: payment.date, tone: payment.status === 'paid' ? 'success' : 'warning' })
    if (!events.length) events.push({ title: 'Local admin console initialized', detail: 'No synchronized audit events are available yet.', tone: 'info' })
    return events
  }, [billing.payments, snapshot])

  const metrics = [
    { label: 'Saved records', value: snapshot?.items ?? '—', icon: Database, color: 'bg-violet-50 text-violet-700' },
    { label: 'Collections', value: snapshot?.collections ?? '—', icon: Folder, color: 'bg-blue-50 text-blue-700' },
    { label: 'Pending sync', value: snapshot?.pending ?? '—', icon: RefreshCw, color: snapshot?.pending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700' },
    { label: 'Drive backups', value: snapshot?.backups ?? '—', icon: HardDrive, color: 'bg-fuchsia-50 text-fuchsia-700' },
  ]

  return (
    <main className="admin-shell min-h-screen bg-[#f7f5fb] text-[#241B35]">
      <aside className={`admin-sidebar fixed inset-y-0 left-0 z-50 flex w-[282px] flex-col border-r border-lilac-100 bg-white p-5 shadow-[20px_0_70px_rgba(53,30,82,.08)] transition lg:translate-x-0 ${sidebar ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between">
          <Brand />
          <button aria-label="Close admin navigation" onClick={() => setSidebar(false)} className="rounded-xl p-2 text-slate-400 hover:bg-lilac-50 lg:hidden"><X size={18} /></button>
        </div>
        <div className="mt-5 rounded-2xl bg-[linear-gradient(135deg,#2b1741,#6d28d9)] p-4 text-white shadow-lg shadow-lilac-200/60">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] text-violet-200"><LockKeyhole size={12} /> Restricted console</div>
          <div className="mt-2 text-sm font-extrabold">Super Admin</div>
          <p className="mt-1 text-[10px] leading-4 text-white/55">Local operations and server-ready administration.</p>
        </div>
        <nav aria-label="Admin sections" className="mt-5 flex-1 space-y-1 overflow-y-auto pr-1">
          {sections.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return <button key={item.id} onClick={() => { setSection(item.id); setSidebar(false) }} aria-current={active ? 'page' : undefined} className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${active ? 'bg-gradient-to-r from-lilac-100 to-lilac-50 text-lilac-800 shadow-sm' : 'text-slate-500 hover:bg-lilac-50/70 hover:text-lilac-800'}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? 'bg-white text-lilac-700 shadow-sm' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-lilac-600'}`}><Icon size={16} /></span>
              <span className="min-w-0"><span className="block text-xs font-extrabold">{item.label}</span><span className="mt-0.5 block truncate text-[9px] text-slate-400">{item.description}</span></span>
            </button>
          })}
        </nav>
        <div className="space-y-1 border-t border-lilac-100 pt-4">
          <a href={chrome.runtime.getURL('dashboard.html')} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-500 hover:bg-lilac-50"><LayoutDashboard size={16} /> Open library</a>
          <a href={chrome.runtime.getURL('options.html')} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-500 hover:bg-lilac-50"><Settings size={16} /> User settings</a>
        </div>
      </aside>

      {sidebar && <button aria-label="Close menu" onClick={() => setSidebar(false)} className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" />}

      <div className="lg:pl-[282px]">
        <header className="admin-topbar sticky top-0 z-30 border-b border-lilac-100/70 bg-white/85 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1580px] items-center gap-3">
            <button aria-label="Open admin navigation" onClick={() => setSidebar(true)} className="rounded-xl border border-lilac-100 bg-white p-2.5 text-lilac-700 lg:hidden"><Menu size={18} /></button>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-black">LilacSave Administration</div><div className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">Device-scoped console</div></div>
            <span className={`hidden items-center gap-2 rounded-full px-3 py-2 text-[10px] font-extrabold sm:inline-flex ${snapshot?.authenticated ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><span className={`h-2 w-2 rounded-full ${snapshot?.authenticated ? 'bg-emerald-500' : 'bg-amber-500'}`} />{snapshot?.authenticated ? 'Drive online' : 'Local mode'}</span>
            <button disabled={busy} onClick={() => void refresh()} className="btn-secondary py-2 text-xs"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </header>

        <section className="admin-content mx-auto max-w-[1580px] p-4 sm:p-6 lg:p-8">
          <div className="admin-hero relative mb-6 overflow-hidden rounded-[30px] bg-[linear-gradient(120deg,#21132f,#48206e_55%,#713cc7)] p-6 text-white shadow-[0_24px_65px_rgba(75,38,122,.20)] sm:p-8">
            <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full border-[42px] border-white/[.045]" />
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl"><div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.08] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.2em] text-violet-100"><ShieldCheck size={11} />{activeCopy.eyebrow}</div><h1 className="mt-4 text-3xl font-black tracking-[-.04em] sm:text-4xl">{activeCopy.title}</h1><p className="mt-3 text-sm leading-6 text-white/60">{activeCopy.description}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/[.075] p-4 backdrop-blur"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${healthScore === 4 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>{healthScore === 4 ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}</span><div><div className="text-[9px] font-black uppercase tracking-wider text-white/40">Installation health</div><div className="mt-1 text-sm font-extrabold">{healthScore === 4 ? 'All systems ready' : `${healthScore}/4 checks ready`}</div></div></div></div>
            </div>
          </div>

          {section === 'overview' && <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon, color }) => <article key={label} className="admin-card rounded-3xl border border-white bg-white p-5 shadow-[0_12px_38px_rgba(53,30,82,.07)]"><div className="flex items-start justify-between"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${color}`}><Icon size={19} /></span><span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-400">Live</span></div><div className="mt-5 text-3xl font-black tracking-tight">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></article>)}</div>
            <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
              <article className="admin-card rounded-3xl border border-white bg-white p-5 shadow-[0_12px_38px_rgba(53,30,82,.07)] sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black">Operational status</h2><p className="mt-1 text-xs text-slate-400">Genuine state from IndexedDB, Chrome Identity, and Drive.</p></div><Activity size={18} className="text-lilac-600" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{[
                ['Local database', `${snapshot?.items ?? 0} active items`, true],
                ['Google Drive', snapshot?.authenticated ? 'Connected' : 'Not connected', Boolean(snapshot?.authenticated)],
                ['Synchronization', snapshot?.pending ? `${snapshot.pending} queued` : 'Queue clear', !snapshot?.pending],
                ['Failed records', snapshot?.failed ? `${snapshot.failed} need attention` : 'No failures', !snapshot?.failed],
              ].map(([label, detail, healthy]) => <div key={String(label)} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-4"><span className={`h-2.5 w-2.5 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-amber-400'}`} /><div><div className="text-xs font-extrabold text-slate-700">{label}</div><div className="mt-1 text-[10px] text-slate-400">{detail}</div></div></div>)}</div></article>
              <article className="admin-card rounded-3xl border border-white bg-white p-5 shadow-[0_12px_38px_rgba(53,30,82,.07)] sm:p-6"><h2 className="text-sm font-black">Quick operations</h2><div className="mt-4 space-y-2"><button disabled={busy} onClick={() => void synchronize()} className="btn-primary w-full"><RefreshCw size={15} /> Synchronize now</button><button disabled={busy || !snapshot?.authenticated} onClick={() => void backup()} className="btn-secondary w-full"><HardDrive size={15} /> Create Drive backup</button><button onClick={() => downloadJson(`lilacsave-admin-snapshot-${new Date().toISOString().slice(0,10)}.json`, { generatedAt: new Date().toISOString(), snapshot, billing })} className="btn-secondary w-full"><Download size={15} /> Export admin snapshot</button></div></article>
            </div>
          </div>}

          {section === 'users' && <div className="space-y-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><b>Server connection required:</b> organization-wide users, role assignment, invitations, suspension, and session revocation must be enforced by a protected backend. This extension currently exposes only the local device operator.</div>
            <article className="admin-card overflow-hidden rounded-3xl border border-white bg-white shadow-[0_12px_38px_rgba(53,30,82,.07)]"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black">Local operators</h2><p className="mt-1 text-xs text-slate-400">Accounts visible to this installation</p></div><div className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-lilac-100 text-lilac-700"><Users size={19} /></span><div><div className="text-sm font-extrabold">Device owner</div><div className="mt-1 text-[10px] text-slate-400">Local extension operator · Super Admin console access</div></div></div><div className="flex items-center gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">Active</span><span className="rounded-full bg-lilac-50 px-2.5 py-1 text-[9px] font-black uppercase text-lilac-700">Owner</span></div></div></article>
            <div className="grid gap-4 md:grid-cols-3">{[['Invitations', 'Requires email delivery and signed server tokens'], ['Roles', 'Requires server-enforced RBAC policies'], ['Sessions', 'Requires a remote identity and session store']].map(([title, description]) => <div key={title} className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-5"><LockKeyhole size={18} className="text-slate-300" /><div className="mt-3 text-xs font-extrabold text-slate-600">{title}</div><p className="mt-1 text-[10px] leading-4 text-slate-400">{description}</p></div>)}</div>
          </div>}

          {section === 'plans' && <div className="admin-plan-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <PlanCatalogCards currentPlan={billing.plan} onMessage={setStatus} />
            {[
              { id: 'free', name: 'Free', price: '$0', status: 'Available', icon: Check, features: ['Core saving', 'Collections and search', 'Drive backup and sync'] },
              { id: 'professional', name: 'Professional', price: '$12/year', status: 'Current release', icon: Sparkles, features: ['Advanced search', 'Smart tags and Markdown', 'Enhanced recovery and shortcuts'] },
              { id: 'ai', name: 'AI Knowledge Manager', price: '$129/year', status: 'Planned · Version 3.0', icon: Zap, features: ['AI summaries and search', 'Automatic categorization', 'Research assistant'] },
            ].map((plan) => { const Icon = plan.icon; const current = billing.plan === plan.id; return <article key={plan.id} className={`admin-card flex flex-col rounded-[26px] border p-6 shadow-[0_12px_38px_rgba(53,30,82,.07)] ${current ? 'border-lilac-400 bg-lilac-50/35' : 'border-white bg-white'}`}><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-lilac-100 text-lilac-700"><Icon size={18} /></span><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${current ? 'bg-lilac-600 text-white' : 'bg-slate-50 text-slate-400'}`}>{current ? 'Local plan' : plan.status}</span></div><h2 className="mt-5 text-lg font-black">{plan.name}</h2><div className="mt-2 text-3xl font-black tracking-tight">{plan.price}</div><ul className="mt-5 flex-1 space-y-2.5">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-xs font-semibold text-slate-600"><Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />{feature}</li>)}</ul><button onClick={() => setStatus('Plan mutations require verified checkout webhooks and server-side entitlements.')} className="btn-secondary mt-6 w-full">Manage entitlement</button></article> })}
          </div>}

          {section === 'payments' && <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3"><div className="admin-card rounded-2xl border border-white bg-white p-5"><DollarSign size={18} className="text-emerald-600" /><div className="mt-4 text-2xl font-black">{money(revenue)}</div><div className="mt-1 text-xs text-slate-400">Recorded paid amount</div></div><div className="admin-card rounded-2xl border border-white bg-white p-5"><Receipt size={18} className="text-lilac-600" /><div className="mt-4 text-2xl font-black">{billing.payments.length}</div><div className="mt-1 text-xs text-slate-400">Local payment records</div></div><div className="admin-card rounded-2xl border border-white bg-white p-5"><CreditCard size={18} className="text-fuchsia-600" /><div className="mt-4 text-2xl font-black capitalize">{billing.plan === 'ai' ? 'AI' : billing.plan}</div><div className="mt-1 text-xs text-slate-400">Current local plan</div></div></div>
            <article className="admin-card overflow-hidden rounded-3xl border border-white bg-white shadow-[0_12px_38px_rgba(53,30,82,.07)]"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black">Payment history</h2><p className="mt-1 text-xs text-slate-400">Only genuine records stored by a future billing integration are displayed.</p></div>{billing.payments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Receipt</th></tr></thead><tbody className="divide-y divide-slate-100">{billing.payments.map((payment) => <tr key={payment.id} className="text-xs"><td className="px-5 py-4">{new Date(payment.date).toLocaleDateString()}</td><td className="px-5 py-4 font-bold">{payment.plan}</td><td className="px-5 py-4 font-bold">{money(payment.amount, payment.currency)}</td><td className="px-5 py-4 capitalize">{payment.status}</td><td className="px-5 py-4 text-right">{payment.receiptUrl ? <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="font-bold text-lilac-700">Open <ExternalLink size={11} className="inline" /></a> : '—'}</td></tr>)}</tbody></table></div> : <div className="py-14 text-center"><Receipt size={26} className="mx-auto text-slate-300" /><div className="mt-3 text-sm font-bold text-slate-500">No payment records</div><p className="mt-1 text-xs text-slate-400">Connect a PCI-compliant payment provider and verified webhooks first.</p></div>}</article>
          </div>}

          {section === 'features' && snapshot && <div className="space-y-4">
            {[
              { key: 'autoSync', title: 'Automatic synchronization', description: 'Retry offline changes every five minutes.', checked: snapshot.settings.autoSync },
              { key: 'smartTagSuggestions', title: 'Local smart-tag suggestions', description: 'Suggest tags using device-only rules.', checked: snapshot.settings.smartTagSuggestions },
              { key: 'scheduledBackups', title: 'Scheduled Drive backups', description: 'Create periodic recovery points when Drive is connected.', checked: snapshot.settings.scheduledBackups },
            ].map((feature) => <label key={feature.key} className="admin-card flex cursor-pointer items-center justify-between gap-5 rounded-2xl border border-white bg-white p-5 shadow-[0_10px_30px_rgba(53,30,82,.05)]"><span className="flex items-center gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-lilac-50 text-lilac-700"><Flag size={17} /></span><span><span className="block text-sm font-extrabold text-slate-700">{feature.title}</span><span className="mt-1 block text-xs text-slate-400">{feature.description}</span></span></span><input type="checkbox" checked={feature.checked} onChange={(event) => void updateSetting({ [feature.key]: event.target.checked })} className="h-5 w-5 shrink-0 accent-lilac-600" /></label>)}
            <div className="rounded-2xl border border-lilac-100 bg-lilac-50/60 p-4 text-xs leading-5 text-lilac-900/70">These controls affect this device only. Global rollouts, audience targeting, staged deployment, and kill switches require signed configuration from an authenticated backend.</div>
          </div>}

          {section === 'security' && <div className="grid gap-5 xl:grid-cols-[1fr_.8fr]">
            <article className="admin-card rounded-3xl border border-white bg-white p-6 shadow-[0_12px_38px_rgba(53,30,82,.07)]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck size={20} /></span><div><h2 className="text-sm font-black">Security posture</h2><p className="mt-1 text-xs text-slate-400">Least-privilege extension architecture</p></div></div><div className="mt-5 space-y-3">{[
              ['Manifest V3', 'Modern isolated service-worker architecture'],
              ['Google OAuth', 'Tokens managed by Chrome Identity'],
              ['Drive scope', 'drive.file — extension-created files only'],
              ['Browsing privacy', 'No history permission or passive collection'],
              ['Remote code', 'Blocked by extension content security policy'],
            ].map(([title, detail]) => <div key={title} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" /><div><div className="text-xs font-extrabold text-slate-700">{title}</div><div className="mt-1 text-[10px] leading-4 text-slate-400">{detail}</div></div></div>)}</div></article>
            <article className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><LockKeyhole size={22} className="text-amber-700" /><h2 className="mt-4 text-sm font-black text-amber-950">Production admin requirements</h2><ul className="mt-4 space-y-3 text-xs leading-5 text-amber-900/70"><li>Server-enforced role-based access control</li><li>Multi-factor authentication for administrators</li><li>Signed, immutable audit records</li><li>Short-lived sessions with revocation</li><li>Verified billing-provider webhooks</li></ul><p className="mt-5 rounded-xl bg-white/60 p-3 text-[10px] leading-4 text-amber-900/60">A client-only page cannot safely grant organization-wide authority. These controls must be enforced outside the extension.</p></article>
          </div>}

          {section === 'audit' && <article className="admin-card rounded-3xl border border-white bg-white p-5 shadow-[0_12px_38px_rgba(53,30,82,.07)] sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black">Local operational timeline</h2><p className="mt-1 text-xs text-slate-400">Derived only from available device records.</p></div><button onClick={() => downloadJson(`lilacsave-audit-${new Date().toISOString().slice(0,10)}.json`, auditEvents)} className="btn-secondary py-2 text-xs"><Download size={14} /> Export</button></div><div className="mt-6 space-y-0">{auditEvents.map((event, index) => <div key={`${event.title}-${index}`} className="relative flex gap-4 pb-6 last:pb-0"><div className="relative z-10 mt-1"><span className={`block h-3 w-3 rounded-full ring-4 ring-white ${event.tone === 'success' ? 'bg-emerald-500' : event.tone === 'warning' ? 'bg-amber-500' : 'bg-lilac-500'}`} />{index < auditEvents.length - 1 && <span className="absolute left-[5px] top-4 h-[calc(100%+12px)] w-px bg-slate-200" />}</div><div><div className="text-xs font-extrabold text-slate-700">{event.title}</div><div className="mt-1 text-[10px] leading-4 text-slate-400">{event.detail}</div>{event.time && <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-300">{new Date(event.time).toLocaleString()}</div>}</div></div>)}</div></article>}

          {section === 'system' && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[
            { title: 'IndexedDB', value: `${snapshot?.items ?? 0} items · ${snapshot?.collections ?? 0} collections`, healthy: true, icon: Database },
            { title: 'Google Drive', value: snapshot?.authenticated ? 'Authenticated' : 'Not connected', healthy: Boolean(snapshot?.authenticated), icon: Cloud },
            { title: 'Sync queue', value: snapshot?.pending ? `${snapshot.pending} pending operations` : 'Queue clear', healthy: !snapshot?.pending, icon: RefreshCw },
            { title: 'Record integrity', value: snapshot?.failed ? `${snapshot.failed} failed records` : 'No failed records', healthy: !snapshot?.failed, icon: CheckCircle2 },
            { title: 'Backups', value: `${snapshot?.backups ?? 0} Drive recovery points`, healthy: Boolean(snapshot?.backups), icon: HardDrive },
            { title: 'Extension runtime', value: `Version ${chrome.runtime.getManifest().version}`, healthy: true, icon: Zap },
          ].map(({ title, value, healthy, icon: Icon }) => <article key={title} className="admin-card rounded-3xl border border-white bg-white p-5 shadow-[0_12px_38px_rgba(53,30,82,.07)]"><div className="flex items-center justify-between"><span className={`grid h-10 w-10 place-items-center rounded-2xl ${healthy ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><Icon size={18} /></span><span className={`h-2.5 w-2.5 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-amber-400'}`} /></div><h2 className="mt-5 text-sm font-black">{title}</h2><p className="mt-1 text-xs text-slate-400">{value}</p></article>)}</div>}
        </section>
      </div>

      {status && <div role="status" className="fixed bottom-5 left-1/2 z-[70] flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#21192f] px-4 py-3 text-sm font-semibold text-white shadow-2xl"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300"><Check size={15} /></span><span className="min-w-0 flex-1">{status}</span><button aria-label="Dismiss" onClick={() => setStatus('')} className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"><X size={15} /></button></div>}
    </main>
  )
}

function AdminEntry() {
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [profileEmail, setProfileEmail] = useState('')

  useEffect(() => {
    let active = true
    void chrome.identity.getProfileUserInfo().then((profile) => {
      if (!active) return
      const email = profile.email.trim().toLocaleLowerCase()
      setProfileEmail(email)
      setAccess(email && allowedAdminEmails.includes(email) ? 'allowed' : 'denied')
    }).catch(() => {
      if (active) setAccess('denied')
    })
    return () => { active = false }
  }, [])

  if (access === 'allowed') return <SuperAdmin />

  return <main className="admin-gate grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#ede2ff,transparent_38%),#f8f6fc] p-5 text-[#241B35]">
    <section className="w-full max-w-md overflow-hidden rounded-[30px] border border-white bg-white shadow-[0_28px_90px_rgba(53,30,82,.16)]">
      <div className="bg-[linear-gradient(135deg,#21132f,#5b21b6)] p-6 text-white">
        <div className="flex items-center justify-between"><Brand compact /><span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-violet-200"><LockKeyhole size={19} /></span></div>
        <div className="mt-8 text-[9px] font-black uppercase tracking-[.2em] text-violet-200">Restricted administration</div>
        <h1 className="mt-2 text-2xl font-black tracking-tight">Super Admin access</h1>
        <p className="mt-2 text-xs leading-5 text-white/55">This console is available only to explicitly approved administrators.</p>
      </div>
      <div className="p-6">
        {access === 'checking' ? <div className="flex items-center gap-3 rounded-2xl bg-lilac-50 p-4"><RefreshCw size={17} className="animate-spin text-lilac-600" /><div><div className="text-sm font-extrabold">Verifying administrator</div><div className="mt-1 text-xs text-slate-400">Checking the signed-in Chrome profile…</div></div></div> : <><div className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" /><div><div className="text-sm font-extrabold text-rose-900">Access denied</div><div className="mt-1 text-xs leading-5 text-rose-700/70">{allowedAdminEmails.length === 0 ? 'No super-admin identity has been configured for this build.' : profileEmail ? `${profileEmail} is not authorized as a super admin.` : 'Sign in to an approved Chrome profile and try again.'}</div></div></div><a href={chrome.runtime.getURL('dashboard.html')} className="btn-secondary mt-5 w-full"><LayoutDashboard size={15} /> Return to LilacSave</a></>}
      </div>
    </section>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AdminEntry /></React.StrictMode>)
