// Bank Form MFE's own contract. Standalone, it validates just the bank details.
import { z } from 'zod'
import { BankDetails } from './shared.ts'

export const BankFormRequest = z.object({ bankDetails: BankDetails })
export type BankFormRequest = z.infer<typeof BankFormRequest>
