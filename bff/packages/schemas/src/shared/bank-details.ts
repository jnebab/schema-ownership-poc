// SHARED: a domain piece used by two or more MFEs. It lives here because both the order-form MFE (which
// submits it: "host submits") and the Bank Form MFE need it. Rule: the moment a second MFE needs a shape,
// it moves to shared/ — nobody copies it (CI flags copies: scripts/check-duplicates.ts).
import { z } from 'zod'

export const ACCOUNT_TYPES = ['personal', 'business'] as const

// A plain object, deliberately WITHOUT cross-field rules: in Zod 4, .extend() and .partial() throw on schemas
// that carry refinements, so shared objects stay unrefined and each MFE file applies the rules last.
export const BankDetails = z.object({
  accountType: z.enum(ACCOUNT_TYPES),
  accountHolder: z.string().trim().min(2, 'Enter the account holder name'),
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
  bankCode: z.string().regex(/^[A-Z]{4}$/, 'Bank code is 4 capital letters, e.g. ABCD'),
  // Optional... until accountType is "business" (the dynamic rule below).
  registrationNumber: z.string().trim().optional()
})
export type BankDetails = z.infer<typeof BankDetails>

export const REGISTRATION_REQUIRED = 'Registration number is required for business accounts'

const ruleInputs = BankDetails.pick({ accountType: true, registrationNumber: true })

/**
 * Dynamic rule, shared as a function so every MFE applies the SAME rule without copying it:
 * "registrationNumber is optional, but required when accountType is business".
 * `when`: Zod 4 skips refinements once any field has a NON-continuable issue, i.e. a type error. Forms hit that
 * often (an emptied number input gives NaN). `when` runs this rule whenever ITS OWN inputs are valid, so the
 * error still appears on blur. (Plain format errors, like a short account number, don't block refinements.)
 */
export function withBusinessRegistration<S extends z.ZodType<{ bankDetails: BankDetails }>> (schema: S) {
  return schema.refine(
    value => !(value.bankDetails.accountType === 'business' && !value.bankDetails.registrationNumber),
    {
      path: ['bankDetails', 'registrationNumber'],
      message: REGISTRATION_REQUIRED,
      when: payload => ruleInputs.safeParse((payload.value as { bankDetails?: unknown } | undefined)?.bankDetails).success
    }
  )
}
