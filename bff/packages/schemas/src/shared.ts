// THE ONLY PLACE THESE RULES ARE WRITTEN. The UI repo never copies them.
// Shared: used by more than one MFE. BankDetails lives here because the order-form host submits it.
import { z } from 'zod'

export const BankDetails = z.object({
  accountHolder: z.string().trim().min(2, 'Enter the account holder name'),
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
  bankCode: z.string().regex(/^[A-Z]{4}$/, 'Bank code is 4 capital letters, e.g. ABCD')
})
export type BankDetails = z.infer<typeof BankDetails>
