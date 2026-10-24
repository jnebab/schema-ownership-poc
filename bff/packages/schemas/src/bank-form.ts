// BANK FORM MFE's own schema, used when Bank Form runs on its own. Same shared BankDetails, same dynamic rule:
// one declaration, two MFEs.
import { z } from 'zod'
import { BankDetails, withBusinessRegistration } from './shared/bank-details.ts'

export const BankForm = withBusinessRegistration(z.object({
  bankDetails: BankDetails
}))
export type BankForm = z.infer<typeof BankForm>
