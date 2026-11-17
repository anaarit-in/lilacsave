export type BillingPlan = 'free' | 'professional' | 'team' | 'business' | 'ai'
export interface PaymentRecord { id: string; date: string; plan: string; amount: number; currency: string; status: 'paid' | 'refunded' | 'failed' | 'pending'; receiptUrl?: string }
export interface BillingProfile { plan: BillingPlan; renewalDate?: string; payments: PaymentRecord[]; assignedEmail?: string; entitlementSource?: 'identity-allowlist' | 'local'; freeAccessStartedAt?: string }

export const FREE_PLAN_LIMITS = { accessDays: 30, totalSaves: 300, dailySaves: 10 } as const
export interface FreePlanUsage { now: Date; startedAt: Date; totalSaves: number; savesToday: number }

export function freePlanViolation({ now, startedAt, totalSaves, savesToday }: FreePlanUsage): string | undefined {
  const expiresAt = startedAt.getTime() + FREE_PLAN_LIMITS.accessDays * 24 * 60 * 60 * 1000
  if (!Number.isFinite(startedAt.getTime()) || now.getTime() >= expiresAt) return 'Your 30-day Free plan has expired. Upgrade to continue saving.'
  if (totalSaves >= FREE_PLAN_LIMITS.totalSaves) return 'Your Free plan has reached its 300-item limit. Upgrade to continue saving.'
  if (savesToday >= FREE_PLAN_LIMITS.dailySaves) return 'You have reached the Free plan limit of 10 saves per day. Try again tomorrow or upgrade.'
  return undefined
}

const PROFESSIONAL_EMAILS = new Set((import.meta.env.VITE_PROFESSIONAL_EMAILS || '').split(',').map((email) => email.trim().toLocaleLowerCase()).filter(Boolean))
const defaultProfile: BillingProfile = { plan: 'free', payments: [] }

export async function resolveBillingProfile(): Promise<{ profile: BillingProfile; email: string }> {
  const [stored, identity] = await Promise.all([
    chrome.storage.local.get('billingProfile'),
    chrome.identity.getProfileUserInfo().catch(() => ({ email: '', id: '' })),
  ])
  const email = identity.email.trim().toLocaleLowerCase(), saved = stored.billingProfile as BillingProfile | undefined
  const restored: BillingProfile = saved?.plan && Array.isArray(saved.payments) ? { ...defaultProfile, ...saved } : defaultProfile
  const current: BillingProfile = restored.plan === 'free' && !restored.freeAccessStartedAt ? { ...restored, freeAccessStartedAt: new Date().toISOString() } : restored
  const profile: BillingProfile = PROFESSIONAL_EMAILS.has(email)
    ? { ...current, plan: 'professional', assignedEmail: email, entitlementSource: 'identity-allowlist' }
    : current
  if (JSON.stringify(profile) !== JSON.stringify(saved)) await chrome.storage.local.set({ billingProfile: profile })
  return { profile, email }
}

export function emailInAllowlist(email: string, allowlist: Iterable<string>): boolean { const normalized = email.trim().toLocaleLowerCase(); return [...allowlist].some((allowed) => allowed.trim().toLocaleLowerCase() === normalized) }
export function isProfessionalEmail(email: string): boolean { return emailInAllowlist(email, PROFESSIONAL_EMAILS) }
