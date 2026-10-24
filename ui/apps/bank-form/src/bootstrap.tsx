import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FormProvider, useForm } from 'react-hook-form'
import { schemaResolver } from '@ui/form-kit'
// Standalone, Bank Form validates with ITS OWN schema from the BFF (bank-form), not order-form's.
import { BankForm, type BankForm as BankFormValues } from '@bff/schemas/bank-form'
import BankFields from './BankFields'

function Standalone () {
  const form = useForm<BankFormValues>({
    mode: 'onTouched',
    resolver: schemaResolver(BankForm),
    defaultValues: { bankDetails: { accountType: 'personal', accountHolder: '', accountNumber: '', bankCode: '', registrationNumber: '' } }
  })
  const [ok, setOk] = useState(false)
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 480, margin: '24px auto', padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>Bank Form, standalone</h1>
      <p style={{ fontSize: 13 }}>Schema: <strong>@bff/schemas/bank-form</strong> (compiled in)</p>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(() => setOk(true))} style={{ display: 'grid', gap: 12 }}>
          <BankFields />
          <button type="submit">Check</button>
          {ok && <p data-testid="ok">Valid by the bank-form schema.</p>}
        </form>
      </FormProvider>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Standalone />)
