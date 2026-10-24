import { useEffect, useRef, type ReactNode } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
// A TYPE only: the rules themselves come from whichever schema the HOST form validates with.
import type { BankDetails } from '@bff/schemas/shared/bank-details'

type WithBank = { bankDetails: BankDetails }

// The bank fields, rendered inside WHOEVER hosts them. They join the host's form through useFormContext,
// which is why react-hook-form is a singleton in the shared scope. The host decides how values are
// validated and submitted ("host submits"); this component only renders inputs and shows errors.
export default function BankFields () {
  const { register, control, trigger, formState: { errors } } = useFormContext<WithBank>()
  const e = errors.bankDetails
  // What is SHOWN depends on the account type; what is REQUIRED is decided by the BFF's schema.
  const accountType = useWatch({ control, name: 'bankDetails.accountType' })
  // When the account type changes, re-check the registration number at once (required <-> optional).
  // RHF's `deps` option doesn't help here: in 'onTouched' mode an untouched select never validates, so its
  // deps never fire. trigger() asks the BFF's schema (via the host's resolver) for just that field.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    void trigger('bankDetails.registrationNumber')
  }, [accountType, trigger])
  return (
    <fieldset style={{ border: '1px dashed #888', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
      <legend>Bank details <small style={{ color: '#888' }}>(Bank Form MFE)</small></legend>
      <Field label="Account type" error={e?.accountType?.message}>
        <select {...register('bankDetails.accountType')} data-testid="accountType">
          <option value="personal">Personal</option>
          <option value="business">Business</option>
        </select>
      </Field>
      <Field label="Account holder" error={e?.accountHolder?.message}><input {...register('bankDetails.accountHolder')} data-testid="accountHolder" /></Field>
      <Field label="Account number" error={e?.accountNumber?.message}><input {...register('bankDetails.accountNumber')} data-testid="accountNumber" inputMode="numeric" /></Field>
      <Field label="Bank code" error={e?.bankCode?.message}><input {...register('bankDetails.bankCode')} data-testid="bankCode" /></Field>
      {accountType === 'business' && (
        <Field label="Company registration number" error={e?.registrationNumber?.message}><input {...register('bankDetails.registrationNumber')} data-testid="registrationNumber" /></Field>
      )}
    </fieldset>
  )
}

function Field ({ label, error, children }: { label: string, error?: string, children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span>{label}</span>
      {children}
      {error && <span role="alert" style={{ color: '#a32d2d', fontSize: 13 }}>{error}</span>}
    </label>
  )
}
