// The BFF as the final authority: same schema as the browser, plus private rules.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/server.ts'

const bank = { accountType: 'personal', accountHolder: 'Ana Cruz', accountNumber: '1234567890', bankCode: 'ABCD', registrationNumber: '' }
const order = { item: 'Margherita pizza', quantity: 2, bankDetails: bank }
const post = async (payload: unknown) => {
  const app = buildApp()
  const res = await app.inject({ method: 'POST', url: '/api/order-form/orders', payload: payload as object })
  await app.close()
  return { status: res.statusCode, body: res.json() }
}

test('valid order: 201', async () => {
  assert.equal((await post(order)).status, 201)
})

test('a bypassed browser still cannot get bad data in: 422 with field paths', async () => {
  const r = await post({ ...order, bankDetails: { ...bank, accountNumber: '42' } })
  assert.equal(r.status, 422)
  assert.deepEqual(r.body.issues, [{ path: 'bankDetails.accountNumber', message: 'Account number must be 10 digits' }])
})

test('private rule (server only): a blocked bank passes the shared schema but the BFF rejects it', async () => {
  const r = await post({ ...order, bankDetails: { ...bank, bankCode: 'ZZZZ' } })
  assert.equal(r.status, 422)
  assert.deepEqual(r.body.issues, [{ path: 'bankDetails.bankCode', message: "This bank isn't supported" }])
})

test('dynamic rule is enforced on the server too', async () => {
  const r = await post({ ...order, bankDetails: { ...bank, accountType: 'business' } })
  assert.equal(r.status, 422)
  assert.equal(r.body.issues[0].path, 'bankDetails.registrationNumber')
})
