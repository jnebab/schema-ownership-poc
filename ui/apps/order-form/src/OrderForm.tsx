import { useState, type FormEvent } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { applyIssues, contractResolver, currentMode, serverResolver, timed, type Issue } from '@ui/form-kit'
// Types only, from the BFF's contract: the editor knows every field, but no rule is copied into this repo.
import type { PlaceOrderRequest } from 'bff_contracts/order-form'
// Another MFE, embedded: Module Federation loads it from the Bank Form app at runtime.
import BankFields from 'bank_form/BankFields'

export default function OrderForm () {
  const mode = currentMode()
  const [lastCheckMs, setLastCheckMs] = useState<number | null>(null)
  const [result, setResult] = useState('')

  // The ONE line that differs between the two approaches.
  const rules = mode === 'server'
    ? serverResolver<PlaceOrderRequest>('/api/order-form/validate')
    : contractResolver<PlaceOrderRequest>(() => import('bff_contracts/order-form').then(m => m.PlaceOrderRequest))

  const form = useForm<PlaceOrderRequest>({
    mode: 'onBlur',
    resolver: timed(rules, setLastCheckMs),
    defaultValues: { item: '', quantity: 1, bankDetails: { accountHolder: '', accountNumber: '', bankCode: '' } }
  })

  // Submit always goes to the BFF, which validates again with the same schema and has the final say.
  async function submit (values: PlaceOrderRequest) {
    setResult('')
    const res = await fetch('/api/order-form/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) })
    if (res.status === 201) { const { orderId } = await res.json() as { orderId: string }; setResult(`Order accepted (${orderId.slice(0, 8)})`); return }
    if (res.status === 422) { const { issues } = await res.json() as { issues: Issue[] }; applyIssues(form.setError, issues); setResult('The BFF rejected the order: see the fields'); return }
    setResult(`Unexpected response ${res.status}`)
  }

  // ?bypass skips the browser-side check on submit, to prove the BFF still catches everything on its own.
  const bypass = new URLSearchParams(location.search).has('bypass')
  const onSubmit = bypass ? (e: FormEvent) => { e.preventDefault(); void submit(form.getValues()) } : form.handleSubmit(submit)

  const e = form.formState.errors
  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Order form <small style={{ color: '#888' }}>(order-form MFE)</small></h2>
      <p data-testid="mode" style={{ fontSize: 13, margin: '0 0 12px' }}>
        Validation: <strong>{mode}</strong>{lastCheckMs !== null && <> · last check took <strong data-testid="latency">{lastCheckMs} ms</strong></>}
      </p>
      <FormProvider {...form}>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>Item
            <input {...form.register('item')} data-testid="item" />
            {e.item && <span role="alert" style={{ color: '#a32d2d', fontSize: 13 }}>{e.item.message}</span>}
          </label>
          <label style={{ display: 'grid', gap: 4 }}>Quantity
            <input type="number" {...form.register('quantity', { valueAsNumber: true })} data-testid="quantity" />
            {e.quantity && <span role="alert" style={{ color: '#a32d2d', fontSize: 13 }}>{e.quantity.message}</span>}
          </label>
          <BankFields />
          <button type="submit" data-testid="submit">Place order</button>
          {result && <p data-testid="result">{result}</p>}
        </form>
      </FormProvider>
    </section>
  )
}
