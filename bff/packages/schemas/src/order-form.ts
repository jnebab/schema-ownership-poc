// ORDER-FORM MFE's schema. It embeds the Bank Form MFE and submits the bank details itself, so it composes the
// shared BankDetails (by reference, never a copy) and applies the shared dynamic rule last.
import { z } from 'zod'
import { BankDetails, withBusinessRegistration } from './shared/bank-details.ts'

export const OrderForm = withBusinessRegistration(z.object({
  item: z.string().trim().min(1, 'Enter an item').max(40, 'Item is at most 40 characters'),
  quantity: z.number({ error: 'Quantity must be a number' }).int().min(1, 'At least 1').max(20, 'At most 20'),
  bankDetails: BankDetails
}))
export type OrderForm = z.infer<typeof OrderForm>
