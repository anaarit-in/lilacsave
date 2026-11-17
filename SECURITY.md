# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub Security Advisories for this repository. Do not open a public issue containing credentials, OAuth tokens, payment details, or exploit instructions.

## Secret handling

LilacSave does not commit local `.env` files, OAuth tokens, PayPal secrets, build output, or dependency folders. PayPal order creation and capture must remain on a trusted backend. Google OAuth tokens remain managed by Chrome Identity.
