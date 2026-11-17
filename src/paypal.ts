export type PayPalCheckoutPlan = 'professional' | 'team'
export type PayPalBillingCycle = 'monthly' | 'annual'

export function buildPayPalCheckoutUrl(baseUrl: string, plan: PayPalCheckoutPlan, cycle: PayPalBillingCycle): string {
  if (!baseUrl.trim()) throw new Error('PayPal checkout is not configured yet. Add VITE_PAYPAL_CHECKOUT_URL to the production build.')
  const url = new URL(baseUrl)
  const localDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) throw new Error('PayPal checkout must use HTTPS.')
  url.searchParams.set('plan', plan)
  url.searchParams.set('billing', cycle)
  url.searchParams.set('source', 'chrome-extension')
  return url.toString()
}

export async function openPayPalCheckout(plan: PayPalCheckoutPlan, cycle: PayPalBillingCycle): Promise<void> {
  const checkoutUrl = buildPayPalCheckoutUrl(import.meta.env.VITE_PAYPAL_CHECKOUT_URL || '', plan, cycle)
  await chrome.tabs.create({ url: checkoutUrl })
}
