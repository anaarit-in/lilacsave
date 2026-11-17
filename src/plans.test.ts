import { describe, expect, it } from 'vitest'
import { PRODUCT_PLANS } from './plans'

describe('product plan catalog', () => {
  it('keeps the approved Free, Pro, Team, and Business pricing', () => {
    expect(PRODUCT_PLANS.map((plan) => plan.name)).toEqual(['Free', 'Pro', 'Team', 'Business'])
    expect(PRODUCT_PLANS.find((plan) => plan.id === 'free')).toMatchObject({ access: '30 days', savedItems: '300 total', dailySaves: '10 per day' })
    expect(PRODUCT_PLANS.find((plan) => plan.id === 'professional')).toMatchObject({ monthly: '$3.99', annual: '$39.99 per person, billed yearly', savedItems: '10,000' })
    expect(PRODUCT_PLANS.find((plan) => plan.id === 'team')).toMatchObject({ monthly: '$14.99', members: 'Up to 5 in the pilot', savedItems: '50,000 per shared workspace' })
    expect(PRODUCT_PLANS.find((plan) => plan.id === 'business')).toMatchObject({ monthly: 'Custom quote', annual: 'Annual contract' })
  })
})
