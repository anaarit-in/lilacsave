import { describe, expect, it } from 'vitest'
import { emailInAllowlist, freePlanViolation } from './billing'

describe('billing entitlements', () => {
  it('assigns the configured account to Professional', () => {
    const configured = ['member@example.com']
    expect(emailInAllowlist('member@example.com', configured)).toBe(true)
    expect(emailInAllowlist(' MEMBER@EXAMPLE.COM ', configured)).toBe(true)
    expect(emailInAllowlist('another@example.com', configured)).toBe(false)
  })

  it('enforces Free access duration and save limits', () => {
    const now = new Date('2026-11-16T12:00:00.000Z'), startedAt = new Date('2026-11-01T12:00:00.000Z')
    expect(freePlanViolation({ now, startedAt, totalSaves: 299, savesToday: 9 })).toBeUndefined()
    expect(freePlanViolation({ now, startedAt, totalSaves: 300, savesToday: 9 })).toContain('300-item')
    expect(freePlanViolation({ now, startedAt, totalSaves: 20, savesToday: 10 })).toContain('10 saves per day')
    expect(freePlanViolation({ now: new Date('2026-12-01T12:00:00.000Z'), startedAt, totalSaves: 20, savesToday: 0 })).toContain('30-day')
  })
})
