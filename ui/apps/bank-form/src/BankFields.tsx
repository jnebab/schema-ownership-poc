import type { ReactNode } from 'react'
import { useFormContext } from 'react-hook-form'
// A TYPE from the BFF's contract (downloaded by Module Federation's dts plugin). No rules live here.
import type { BankDetails } from 'bff_contracts/shared'

type WithBank = { bankDetails: BankDetails }

// The bank fields, rendered inside WHOEVER hosts them. They join the host's form through useFormContext,
// which is why react-hook-form is a singleton in the shared scope. The host decides how values are
// validated and submitted ("host submits"); this component only renders inputs and shows errors.
export default function BankFields () {
  const { register, formState: { errors } } = useFormContext<WithBank>()
  const e = errors.bankDetails
  return (
    <fieldset style={{ border: '1px dashed #888', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
      <legend>Bank details <small style={{ color: '#888' }}>(Bank Form MFE)</small></legend>
      <Field label="Account holder" error={e?.accountHolder?.message}><input {...register('bankDetails.accountHolder')} data-testid="accountHolder" /></Field>
      <Field label="Account number" error={e?.accountNumber?.message}><input {...register('bankDetails.accountNumber')} data-testid="accountNumber" inputMode="numeric" /></Field>
      <Field label="Bank code" error={e?.bankCode?.message}><input {...register('bankDetails.bankCode')} data-testid="bankCode" /></Field>
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
