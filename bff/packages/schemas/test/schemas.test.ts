// The rules as the BFF and both MFEs will run them (same code everywhere).
import test from 'node:test'
import assert from 'node:assert/strict'
import { OrderForm } from '../src/order-form.ts'
import { BankForm } from '../src/bank-form.ts'
import { REGISTRATION_REQUIRED } from '../src/shared/bank-details.ts'

const bank = { accountType: 'personal', accountHolder: 'Ana Cruz', accountNumber: '1234567890', bankCode: 'ABCD', registrationNumber: '' }
const order = { item: 'Margherita pizza', quantity: 2, bankDetails: bank }
const messages = (r: { success: boolean, error?: { issues: { path: PropertyKey[], message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map(i => `${i.path.join('.')}: ${i.message}`)

test('a valid personal order passes', () => {
  assert.deepEqual(messages(OrderForm.safeParse(order)), [])
})

test('format rules: 10-digit account number, 4-letter bank code', () => {
  const r = OrderForm.safeParse({ ...order, bankDetails: { ...bank, accountNumber: '12345', bankCode: 'ab' } })
  assert.deepEqual(messages(r), ['bankDetails.accountNumber: Account number must be 10 digits', 'bankDetails.bankCode: Bank code is 4 capital letters, e.g. ABCD'])
})

test('dynamic rule: registration number is optional for personal, required for business', () => {
  assert.equal(OrderForm.safeParse(order).success, true)
  const business = { ...order, bankDetails: { ...bank, accountType: 'business' } }
  assert.deepEqual(messages(OrderForm.safeParse(business)), [`bankDetails.registrationNumber: ${REGISTRATION_REQUIRED}`])
  assert.equal(OrderForm.safeParse({ ...business, bankDetails: { ...business.bankDetails, registrationNumber: 'REG-1' } }).success, true)
})

test('dynamic rule still reports while another field has a TYPE error (the `when` option)', () => {
  // An emptied number input gives NaN: a non-continuable issue that makes Zod skip refinements without `when`.
  const r = OrderForm.safeParse({ ...order, quantity: Number.NaN, bankDetails: { ...bank, accountType: 'business' } })
  assert.ok(messages(r).includes(`bankDetails.registrationNumber: ${REGISTRATION_REQUIRED}`), messages(r).join(' | '))
})

test('Bank Form standalone applies the same shared rules', () => {
  assert.deepEqual(messages(BankForm.safeParse({ bankDetails: { ...bank, accountType: 'business' } })), [`bankDetails.registrationNumber: ${REGISTRATION_REQUIRED}`])
  assert.equal(BankForm.safeParse({ bankDetails: bank }).success, true)
})
