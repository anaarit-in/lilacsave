import { useEffect, useState } from 'react'
import { ArrowUpRight, Crown, Sparkles, Zap } from 'lucide-react'
import { resolveBillingProfile, type BillingProfile } from '../billing'

export function SidebarPlanCard({ mobileOpen }: { mobileOpen: boolean }) {
  const [billing, setBilling] = useState<BillingProfile>({ plan: 'free', payments: [] })
  useEffect(() => { void resolveBillingProfile().then(({ profile }) => setBilling(profile)) }, [])
  const professional = billing.plan === 'professional', ai = billing.plan === 'ai', Icon = ai ? Zap : professional ? Crown : Sparkles
  const name = ai ? 'AI Knowledge Manager' : professional ? 'Pro' : 'Free'
  return <button onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('options.html#plan') })} aria-label={`Open ${name} plan settings`} className={`sidebar-plan-card fixed bottom-[76px] left-5 z-50 w-[240px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-[0_9px_28px_rgba(53,30,82,.11)] transition hover:-translate-y-0.5 ${mobileOpen ? 'flex' : 'hidden'} lg:flex ${professional ? 'border-lilac-200 bg-gradient-to-r from-lilac-50 to-violet-100' : ai ? 'border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 to-purple-100' : 'border-slate-200 bg-white'}`}>
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-sm ${ai ? 'bg-gradient-to-br from-fuchsia-500 to-purple-700' : professional ? 'bg-gradient-to-br from-lilac-600 to-violet-700' : 'bg-gradient-to-br from-slate-500 to-slate-700'}`}><Icon size={14} /></span>
    <span className="min-w-0 flex-1 truncate text-xs font-black text-[#342543]">{name}</span>
    <ArrowUpRight size={13} className="shrink-0 text-lilac-500" />
  </button>
}
