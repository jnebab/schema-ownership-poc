// CI check 3: impact report for the "BFF and UI change together" rule.
// Given the files a BFF PR changed (args, or `git diff --name-only <base>`), lists which MFEs' schemas are
// affected, so the paired UI PR (submodule pin bump + MFE changes) is complete.
//   node scripts/impact.mjs packages/schemas/src/shared/bank-details.ts
//   node scripts/impact.mjs --base origin/main
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const src = path.join(root, 'packages/schemas/src')
const baseAt = process.argv.indexOf('--base')
const changed = (baseAt > -1
  ? execSync(`git diff --name-only ${process.argv[baseAt + 1]} -- packages/schemas/src`, { cwd: root, encoding: 'utf8' }).split('\n')
  : process.argv.slice(2)
).filter(Boolean).map(f => path.resolve(root, f.replace(/^bff\//, '')))

const mfeFiles = fs.readdirSync(src).filter(f => f.endsWith('.ts'))
const affected = new Map()
for (const file of mfeFiles) {
  const full = path.join(src, file)
  const deps = [...fs.readFileSync(full, 'utf8').matchAll(/from\s+['"](\.\/shared\/[^'"]+)['"]/g)].map(m => path.resolve(src, m[1]))
  const why = changed.filter(c => c === full || deps.includes(c)).map(c => path.relative(root, c).replaceAll('\\', '/'))
  if (why.length) affected.set(file.replace(/\.ts$/, ''), why)
}

if (!affected.size) { console.log('impact: no MFE schema affected'); process.exit(0) }
console.log('impact: the paired UI PR must update these MFEs')
for (const [mfe, why] of affected) console.log(`  - ${mfe}  (because: ${why.join(', ')})`)
