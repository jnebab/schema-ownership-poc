// The BFF. It imports the SAME schema code it serves to the browser, so the check in step 5 of the flow is
// identical to the one the MFE ran in step 3. It is always the final authority.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import type { ZodType } from 'zod'
import { PlaceOrderRequest } from '@bff/schemas/order-form'
import { BankFormRequest } from '@bff/schemas/bank-form'

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })
const here = path.dirname(fileURLToPath(import.meta.url))

// One error shape for /validate and for submit, so the UI handles both the same way.
type Issue = { path: string, message: string }
function check (schema: ZodType, body: unknown): { ok: true, data: unknown } | { ok: false, issues: Issue[] } {
  const result = schema.safeParse(body)
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, issues: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }
}

// "Downloaded" mode: the rules, served as plain files by this server. Read-only, no login needed
// (validation rules aren't secret; they ship to every browser and are re-checked here anyway).
await app.register(fastifyStatic, {
  root: path.resolve(here, '../../contracts/dist'),
  prefix: '/contracts/v1/',
  // @fastify/static v10 passes the Fastify reply (not Node's raw response) to setHeaders.
  setHeaders: (reply, file) => {
    // The manifest must revalidate so a BFF deploy is picked up on the next page load; hashed chunks never change.
    reply.header('cache-control', file.endsWith('.json') ? 'no-cache' : 'public, max-age=31536000, immutable')
    reply.header('access-control-allow-origin', '*') // MFE dev servers on other ports fetch these
  }
})

// "Server" mode: the UI sends the form, the BFF answers with errors per field. One route per MFE contract.
const validators: Record<string, ZodType> = { 'order-form': PlaceOrderRequest, 'bank-form': BankFormRequest }
app.post<{ Params: { mfe: string } }>('/api/:mfe/validate', async (request, reply) => {
  const schema = validators[request.params.mfe]
  if (!schema) return reply.code(404).send({ error: 'unknown form' })
  const result = check(schema, request.body)
  return result.ok ? { issues: [] } : { issues: result.issues }
})

// Submit: always validated here, whatever the UI did.
app.post('/api/order-form/orders', async (request, reply) => {
  const result = check(PlaceOrderRequest, request.body)
  if (!result.ok) return reply.code(422).send({ issues: result.issues })
  return reply.code(201).send({ orderId: randomUUID(), received: result.data })
})

app.get('/api/health', async () => ({ ok: true }))

await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' })
