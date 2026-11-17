export type ProductPlanId = 'free' | 'professional' | 'team' | 'business'
export interface ProductPlan {
  id: ProductPlanId; name: string; monthly: string; monthlySuffix?: string; annual: string; bestFor: string
  members: string; savedItems: string; dailySaves: string; access: string; googleDrive: string; availability: string; accent: 'slate' | 'violet' | 'blue' | 'amber'
}

export const PRODUCT_PLANS: ProductPlan[] = [
  { id: 'free', name: 'Free', monthly: '$0', annual: '$0', bestFor: 'Trying LilacSave', members: '1', savedItems: '300 total', dailySaves: '10 per day', access: '30 days', googleDrive: 'One personal Drive connection', availability: '30-day access', accent: 'slate' },
  { id: 'professional', name: 'Pro', monthly: '$3.99', monthlySuffix: 'per person', annual: '$39.99 per person, billed yearly', bestFor: 'Developers, researchers, students, and creators', members: '1', savedItems: '10,000', dailySaves: 'No daily limit', access: 'Ongoing', googleDrive: 'One personal Drive connection with backup history', availability: 'Launch', accent: 'violet' },
  { id: 'team', name: 'Team', monthly: '$14.99', monthlySuffix: 'per workspace · pilot price', annual: 'Decide after the pilot', bestFor: 'Agencies and small teams', members: 'Up to 5 in the pilot', savedItems: '50,000 per shared workspace', dailySaves: 'No daily limit', access: 'During pilot', googleDrive: 'Workspace-managed Drive connection', availability: 'Pilot or waitlist', accent: 'blue' },
  { id: 'business', name: 'Business', monthly: 'Custom quote', annual: 'Annual contract', bestFor: 'Organizations that need centralized controls', members: 'Based on contract', savedItems: 'Based on contract and performance testing', dailySaves: 'Based on contract', access: 'Annual contract', googleDrive: 'Managed connection with organization policies', availability: 'Contact sales', accent: 'amber' },
]

export function displayPlanName(id: string): string { return PRODUCT_PLANS.find((plan) => plan.id === id)?.name ?? (id === 'ai' ? 'AI Knowledge Manager' : id) }
