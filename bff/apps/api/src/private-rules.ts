// PRIVATE rules: business/fraud logic and checks that need server data. They live in the API app, physically
// OUTSIDE packages/schemas (the only folder the UI links), so no MFE can import them even by accident; the UI's
// leak scan (ui/scripts/check-no-private-rules.mjs) is a backstop. The browser only ever sees the message.
import type { z } from 'zod'
import { OrderForm } from '@bff/schemas/order-form'

// In production this comes from a database or a config service, not from code.
export const BLOCKED_BANK_CODES = new Set(['ZZZZ', 'FAKE'])

function notBlocked (value: { bankDetails: { bankCode: string } }, ctx: z.core.$RefinementCtx) {
  if (BLOCKED_BANK_CODES.has(value.bankDetails.bankCode)) {
    // Says what to fix without revealing the list.
    ctx.addIssue({ code: 'custom', path: ['bankDetails', 'bankCode'], message: "This bank isn't supported" })
  }
}

// What the BFF enforces on submit: the MFE's schema (identical to what runs in the browser) + private rules.
export const OrderFormServer = OrderForm.superRefine(notBlocked)
