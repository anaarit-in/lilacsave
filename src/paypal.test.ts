import { describe, expect, it } from 'vitest'
import { buildPayPalCheckoutUrl } from './paypal'

describe('PayPal hosted checkout', () => {
  it('builds a server-controlled HTTPS checkout URL', () => {
    expect(buildPayPalCheckoutUrl('https://app.example.com/paypal', 'professional', 'annual')).toBe('https://app.example.com/paypal?plan=professional&billing=annual&source=chrome-extension')
  })

  it('rejects missing or insecure production checkout URLs', () => {
    expect(() => buildPayPalCheckoutUrl('', 'professional', 'annual')).toThrow('not configured')
    expect(() => buildPayPalCheckoutUrl('http://app.example.com/paypal', 'professional', 'annual')).toThrow('HTTPS')
  })
})
