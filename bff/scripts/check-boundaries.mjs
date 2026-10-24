// CI check 1: import boundaries in packages/schemas.
//   - MFE files (src/*.ts) may import only `zod` and files under ./shared/ — never another MFE's file.
//   - shared/ files may import only `zod` and other shared/ files.
// This is what keeps "MFE-level schemas" from quietly depending on each other.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../packages/schemas/src/', import.meta.url))
const imports = file => [...fs.readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1])
const problems = []

for (const name of fs.readdirSync(src).filter(f => f.endsWith('.ts'))) {
  for (const spec of imports(path.join(src, name))) {
    if (spec !== 'zod' && !spec.startsWith('./shared/')) problems.push(`${name} imports "${spec}" (MFE files may import only zod and ./shared/)`)
  }
}
for (const name of fs.readdirSync(path.join(src, 'shared')).filter(f => f.endsWith('.ts'))) {
  for (const spec of imports(path.join(src, 'shared', name))) {
    if (spec !== 'zod' && !(spec.startsWith('./') && !spec.includes('..'))) problems.push(`shared/${name} imports "${spec}" (shared files may import only zod and shared/)`)
  }
}

if (problems.length) { console.error('IMPORT BOUNDARY VIOLATIONS:\n' + problems.join('\n')); process.exit(1) }
console.log('boundaries ok: MFE files import only shared/ and zod')
