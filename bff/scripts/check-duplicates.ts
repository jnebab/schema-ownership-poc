// CI check 2: duplicate shapes across MFE schema files.
// Walks every object schema reachable from each MFE file's exports. Reusing shared/BankDetails is fine: it is
// the SAME schema instance everywhere. A copy-paste is a DIFFERENT instance with the same JSON shape — that is
// what gets flagged ("move it to shared/"). Warns by default (two tiny shapes can legitimately match);
// --strict turns warnings into a failing exit code.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'

const src = fileURLToPath(new URL('../packages/schemas/src/', import.meta.url))
const MIN_KEYS = 2 // shapes with fewer keys are too small to call duplicates

type Found = { file: string, where: string, schema: z.ZodObject }
const found: Found[] = []

function walk (schema: unknown, file: string, where: string, seen: Set<unknown>) {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return
  seen.add(schema)
  const def = (schema as { _zod?: { def?: Record<string, unknown> } })._zod?.def
  if (!def) return
  if (schema instanceof z.ZodObject) {
    found.push({ file, where, schema })
    for (const [key, value] of Object.entries(schema.shape)) walk(value, file, `${where}.${key}`, seen)
    return
  }
  for (const key of ['innerType', 'element', 'in', 'out', 'schema']) if (def[key]) walk(def[key], file, where, seen)
  for (const option of (def.options as unknown[] | undefined) ?? []) walk(option, file, where, seen)
}

for (const name of fs.readdirSync(src).filter(f => f.endsWith('.ts'))) {
  const mod = await import(pathToFileURL(path.join(src, name)).href) as Record<string, unknown>
  for (const [exported, value] of Object.entries(mod)) walk(value, name, exported, new Set())
}

const byShape = new Map<string, Found[]>()
for (const f of found) {
  if (Object.keys(f.schema.shape).length < MIN_KEYS) continue
  // Compare the plain shape (no checks/refinements), so a copy is caught even if someone added a rule to it.
  const shape = JSON.stringify(z.toJSONSchema(z.object(f.schema.shape), { unrepresentable: 'any' }))
  byShape.set(shape, [...(byShape.get(shape) ?? []), f])
}

const warnings: string[] = []
for (const group of byShape.values()) {
  const distinctShapes = [...new Map(group.map(g => [g.schema.shape, g])).values()]
  if (distinctShapes.length > 1) {
    warnings.push(`same shape declared ${distinctShapes.length} times: ${distinctShapes.map(g => `${g.file} (${g.where})`).join(', ')} -> move it to shared/`)
  }
}

if (warnings.length) {
  console.warn('DUPLICATE SHAPES (review):\n' + warnings.join('\n'))
  if (process.argv.includes('--strict')) process.exit(1)
} else {
  console.log(`duplicates ok: ${found.length} object schemas checked across ${new Set(found.map(f => f.file)).size} MFE files, no copies`)
}
