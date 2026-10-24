import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FormProvider, useForm } from 'react-hook-form'
import { contractResolver, currentMode, serverResolver } from '@ui/form-kit'
import type { BankFormRequest } from 'bff_contracts/bank-form'
import BankFields from './BankFields'

// Standalone page: Bank Form on its own uses ITS OWN contract (bank-form), not the order-form one.
function Standalone () {
  const resolver = currentMode() === 'server'
    ? serverResolver<BankFormRequest>('/api/bank-form/validate')
    : contractResolver<BankFormRequest>(() => import('bff_contracts/bank-form').then(m => m.BankFormRequest))
  const form = useForm<BankFormRequest>({ mode: 'onBlur', resolver, defaultValues: { bankDetails: { accountHolder: '', accountNumber: '', bankCode: '' } } })
  const [ok, setOk] = useState(false)
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 480, margin: '24px auto', padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>Bank Form, standalone ({currentMode()} validation)</h1>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(() => setOk(true))} style={{ display: 'grid', gap: 12 }}>
          <BankFields />
          <button type="submit">Check</button>
          {ok && <p data-testid="ok">Valid by the bank-form contract.</p>}
        </form>
      </FormProvider>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Standalone />)
