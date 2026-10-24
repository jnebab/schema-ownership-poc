// Order-form MFE's own contract. It embeds Bank Form and submits the bank details itself ("host submits"),
// so it includes the shared BankDetails.
import { z } from 'zod'
import { BankDetails } from './shared.ts'

export const PlaceOrderRequest = z.object({
  item: z.string().trim().min(1, 'Enter an item').max(40, 'Item is at most 40 characters'),
  quantity: z.number({ error: 'Quantity must be a number' }).int().min(1, 'At least 1').max(20, 'At most 20'),
  bankDetails: BankDetails
})
export type PlaceOrderRequest = z.infer<typeof PlaceOrderRequest>
