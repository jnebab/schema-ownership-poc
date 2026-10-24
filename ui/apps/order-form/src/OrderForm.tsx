import { useState, type FormEvent } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { applyIssues, schemaResolver, timed, type Issue } from '@ui/form-kit'
// The BFF's schema for THIS MFE, linked from the BFF repo and compiled into this bundle: no runtime fetch,
// and the type and the rules come from the same commit.
import { OrderForm as OrderFormSchema, type OrderForm as OrderFormValues } from '@bff/schemas/order-form'
// Another MFE, embedded: Module Federation loads it from the Bank Form app at runtime.
import BankFields from 'bank_form/BankFields'

export default function OrderForm () {
  const [lastCheckMs, setLastCheckMs] = useState<number | null>(null)
  const [result, setResult] = useState('')

  const form = useForm<OrderFormValues>({
    // Validate a field the first time the user leaves it, then on every change.
    mode: 'onTouched',
    resolver: timed(schemaResolver(OrderFormSchema), setLastCheckMs),
    defaultValues: {
      item: '',
      quantity: 1,
      bankDetails: { accountType: 'personal', accountHolder: '', accountNumber: '', bankCode: '', registrationNumber: '' }
    }
  })

  // Submit always goes to the BFF, which validates again with the same schema plus private rules. For a
  // well-behaved UI a 422 is rare; when it happens, the messages land on the right inputs.
  async function submit (values: OrderFormValues) {
    setResult('')
    const res = await fetch('/api/order-form/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) })
    if (res.status === 201) { const { orderId } = await res.json() as { orderId: string }; setResult(`Order accepted (${orderId.slice(0, 8)})`); return }
    if (res.status === 422) { const { issues } = await res.json() as { issues: Issue[] }; applyIssues(form.setError, issues); setResult('The BFF rejected the order: see the fields'); return }
    setResult(`Unexpected response ${res.status}`)
  }

  // ?bypass skips the browser check on submit, to prove the BFF still catches everything on its own.
  const bypass = new URLSearchParams(location.search).has('bypass')
  const onSubmit = bypass ? (e: FormEvent) => { e.preventDefault(); void submit(form.getValues()) } : form.handleSubmit(submit)

  const e = form.formState.errors
  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Order form <small style={{ color: '#888' }}>(order-form MFE)</small></h2>
      <p data-testid="mode" style={{ fontSize: 13, margin: '0 0 12px' }}>
        Schema: <strong>@bff/schemas/order-form</strong> (compiled in){lastCheckMs !== null && <> · last check took <strong data-testid="latency">{lastCheckMs} ms</strong></>}
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
