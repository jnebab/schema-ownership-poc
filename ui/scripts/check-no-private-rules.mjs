// CI backstop: no private (server-only) rule may end up in a browser bundle. Private rules live in
// bff/apps/api, outside the linked bff/packages/schemas, so this should never fire; it catches the day someone
// moves one into the shared schemas by mistake. Run after `turbo run build`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apps = fileURLToPath(new URL('../apps/', import.meta.url))
const secrets = ['ZZZZ', 'FAKE', 'BLOCKED_BANK_CODES', 'private-rules']
const files = []
const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); e.isDirectory() ? walk(f) : files.push(f) } }
for (const app of fs.readdirSync(apps, { withFileTypes: true }).filter(d => d.isDirectory())) {
  const dist = path.join(apps, app.name, 'dist')
  if (fs.existsSync(dist)) walk(dist)
}
if (!files.length) { console.error('no build output found: run `turbo run build` first'); process.exit(1) }
const leaks = []
for (const f of files.filter(f => /\.(js|html|json|map)$/.test(f))) {
  const text = fs.readFileSync(f, 'utf8')
  for (const s of secrets) if (text.includes(s)) leaks.push(`${path.relative(apps, f)} contains "${s}"`)
}
if (leaks.length) { console.error('PRIVATE RULES IN A BROWSER BUNDLE:\n' + leaks.join('\n')); process.exit(1) }
console.log(`leaks ok: ${files.length} built files across the MFEs, no private rules`)
