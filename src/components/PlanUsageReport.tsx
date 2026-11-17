import { useEffect, useState } from 'react'
import { CalendarClock, Database, Gauge } from 'lucide-react'
import type { BillingProfile } from '../billing'
import { FREE_PLAN_LIMITS } from '../billing'
import { db } from '../db'

interface Usage { activeItems: number; savesToday: number }
const itemLimits: Partial<Record<BillingProfile['plan'], number>> = { free: FREE_PLAN_LIMITS.totalSaves, professional: 10_000, team: 50_000 }

export function PlanUsageReport({ billing }: { billing: BillingProfile }) {
  const [usage, setUsage] = useState<Usage>({ activeItems: 0, savesToday: 0 })

  useEffect(() => {
    let mounted = true
    const refresh = async () => {
      const now = new Date(), dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
      const [activeItems, savesToday] = await Promise.all([
        db.items.filter((item) => !item.deletedAt).count(),
        db.items.where('createdAt').aboveOrEqual(dayStart.toISOString()).count(),
      ])
      if (mounted) setUsage({ activeItems, savesToday })
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5_000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [])

  const itemLimit = itemLimits[billing.plan]
  const parsedStart = new Date(billing.freeAccessStartedAt || Date.now())
  const startedAt = Number.isFinite(parsedStart.getTime()) ? parsedStart : new Date()
  const elapsedDays = Math.max(0, (Date.now() - startedAt.getTime()) / 86_400_000)
  const daysRemaining = Math.max(0, Math.ceil(FREE_PLAN_LIMITS.accessDays - elapsedDays))
  const free = billing.plan === 'free'

  return <section className="plan-usage-report rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_12px_38px_rgba(53,30,82,.06)] sm:p-6" aria-label="Plan usage report">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.17em] text-lilac-600"><Gauge size={12} /> Live usage report</div><h3 className="mt-1.5 text-sm font-black text-[#2b203d]">Your plan at a glance</h3></div>
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">Updated locally</span>
    </div>
    <div className={`mt-5 grid gap-4 ${free ? 'md:grid-cols-3' : ''}`}>
      {free && <UsageBar icon={CalendarClock} label="Free access" value={`${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`} used={Math.min(FREE_PLAN_LIMITS.accessDays, elapsedDays)} limit={FREE_PLAN_LIMITS.accessDays} detail={`Started ${startedAt.toLocaleDateString()}`} />}
      <UsageBar icon={Database} label="Saved items" value={itemLimit ? `${usage.activeItems} of ${itemLimit.toLocaleString()}` : usage.activeItems.toLocaleString()} used={usage.activeItems} limit={itemLimit} detail={itemLimit ? `${Math.max(0, itemLimit - usage.activeItems).toLocaleString()} remaining` : 'Your current library'} />
      {free && <UsageBar icon={Gauge} label="Saves today" value={`${usage.savesToday} of ${FREE_PLAN_LIMITS.dailySaves}`} used={usage.savesToday} limit={FREE_PLAN_LIMITS.dailySaves} detail={`${Math.max(0, FREE_PLAN_LIMITS.dailySaves - usage.savesToday)} remaining today`} />}
    </div>
  </section>
}

function UsageBar({ icon: Icon, label, value, used, limit, detail }: { icon: typeof Gauge; label: string; value: string; used: number; limit?: number; detail: string }) {
  const percent = limit ? Math.min(100, Math.max(0, used / limit * 100)) : 0
  const tone = percent >= 90 ? 'from-rose-500 to-orange-500' : percent >= 70 ? 'from-amber-400 to-orange-500' : 'from-lilac-500 to-violet-600'
  return <article className="plan-usage-metric rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-400"><Icon size={13} className="text-lilac-500" />{label}</div><span className="text-xs font-black text-slate-700">{value}</span></div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200/75" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit ?? used)}><div className={`h-full rounded-full bg-gradient-to-r ${tone} transition-[width] duration-500`} style={{ width: limit ? `${percent}%` : '100%' }} /></div>
    <div className="mt-2 flex items-center justify-between text-[9px] font-semibold text-slate-400"><span>{detail}</span><span>{limit ? `${Math.round(percent)}%` : 'Active'}</span></div>
  </article>
}
