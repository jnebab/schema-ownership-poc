// The BFF. On every submit it validates with the SAME schema the MFE compiled into its bundle (imported from
// packages/schemas), plus private rules the browser never gets. It is always the final authority; for a
// well-behaved UI it should rarely return an error (bypassed browsers, private rules, drift).
import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import type { ZodType } from 'zod'
import { OrderFormServer } from './private-rules.ts'

export type Issue = { path: string, message: string }

export function check (schema: ZodType, body: unknown): { ok: true, data: unknown } | { ok: false, issues: Issue[] } {
  const result = schema.safeParse(body)
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, issues: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }
}

export function buildApp () {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

  app.post('/api/order-form/orders', async (request, reply) => {
    const result = check(OrderFormServer, request.body)
    if (!result.ok) {
      // Worth a metric per field: near zero normally; a spike after a deploy means UI/BFF drift.
      request.log.warn({ issues: result.issues }, 'order rejected by server validation')
      return reply.code(422).send({ issues: result.issues })
    }
    return reply.code(201).send({ orderId: randomUUID(), received: result.data })
  })

  app.get('/api/health', async () => ({ ok: true }))
  return app
}

if (import.meta.main) {
  const app = buildApp()
  await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' })
}
