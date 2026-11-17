/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPER_ADMIN_EMAILS?: string
  readonly VITE_PROFESSIONAL_EMAILS?: string
  readonly VITE_PAYPAL_CHECKOUT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
