// Records the narrated PROOF video, and is the end-to-end test: every scene asserts what must be true, and the
// run fails (exit 1) if anything doesn't hold. Needs the BFF on :4000, the UI dev servers on :3000-3002, and
// demo/audio/*.wav from demo/tts.py (used for pacing and the soundtrack).
//
//   node demo/record.ts            -> demo/out/schema-sharing-proof.mp4 + demo/out/report.json
import { chromium, type Page } from '../ui/node_modules/playwright-core/index.mjs'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const BFF = path.join(ROOT, 'bff')
const UI = path.join(ROOT, 'ui')
const OUT = path.join(HERE, 'out')
const SHARED = path.join(BFF, 'packages/schemas/src/shared/bank-details.ts')
const durations: Record<string, number> = JSON.parse(fs.readFileSync(path.join(HERE, 'audio/durations.json'), 'utf8'))
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const report: { scene: string, startMs: number, checks: string[] }[] = []
let t0 = 0

// ---------- BFF control (used for the "change a rule" scene) ----------
function pidsOn (port: number) {
  const out = execSync(`powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess"`, { encoding: 'utf8' })
  return [...new Set(out.split(/\s+/).filter(Boolean))]
}
async function restartBff () {
  for (const pid of pidsOn(4000)) execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
  for (let i = 0; i < 50 && pidsOn(4000).length; i++) await sleep(100)
  spawn(process.execPath, ['src/server.ts'], { cwd: path.join(BFF, 'apps/api'), detached: true, stdio: 'ignore', env: { ...process.env, LOG_LEVEL: 'warn' } }).unref()
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://localhost:4000/api/health')).ok) return } catch {}
    await sleep(100)
  }
  throw new Error('BFF did not come back')
}
const original = fs.readFileSync(SHARED, 'utf8')
async function setDigits (n: number) {
  fs.writeFileSync(SHARED, n === 10 ? original : original.replace('/^\\d{10}$/', `/^\\d{${n}}$/`).replace('must be 10 digits', `must be ${n} digits`))
  await restartBff()
  await sleep(2500) // the UI dev servers watch the linked folder and recompile
}

// ---------- overlay: captions, a live panel (requests, later CI output), MFE outlines ----------
const OVERLAY = `
window.__demo = {
  root () {
    let r = document.getElementById('__demo')
    if (!r) {
      r = document.createElement('div'); r.id = '__demo'
      r.innerHTML = '<div id="__cap" style="position:fixed;left:24px;right:420px;bottom:20px;background:#111c;color:#fff;font:15px/1.45 system-ui;padding:12px 16px;border-radius:10px;z-index:99999"></div>' +
        '<div id="__log" style="position:fixed;top:16px;right:16px;width:380px;max-height:74vh;overflow:hidden;background:#0b1020e6;color:#cfe3ff;font:12px/1.5 ui-monospace,Consolas,monospace;padding:10px 12px;border-radius:10px;z-index:99999"><div id="__title" style="color:#fff;font-weight:600;margin-bottom:6px">Requests (live)</div><div id="__rows"></div></div>'
      document.body.appendChild(r)
    }
    return r
  },
  caption (title, text) { this.root(); document.getElementById('__cap').innerHTML = '<b style="color:#ffd27a">' + title + '</b><br>' + text },
  panel (title, rows) { this.root(); if (title.startsWith('CI')) { document.getElementById('__log').style.width = '600px'; document.getElementById('__cap').style.right = '640px' } document.getElementById('__title').textContent = title; document.getElementById('__rows').innerHTML = rows.slice(-20).map(r => '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + r.color + '">' + r.text + '</div>').join('') },
  outline (sel, label, color) {
    const el = document.querySelector(sel); if (!el) return
    el.style.outline = '3px solid ' + color; el.style.outlineOffset = '4px'; el.style.position = 'relative'
    const tag = document.createElement('div'); tag.textContent = label
    tag.style.cssText = 'position:absolute;top:-14px;right:8px;background:' + color + ';color:#fff;font:600 11px system-ui;padding:2px 8px;border-radius:6px;z-index:9999'
    el.appendChild(tag)
  }
}`
type Row = { text: string, color: string }
const rows: Row[] = []
let panel = { title: 'Requests (live)', rows }
const jsLoaded = new Set<string>()
function describe (url: string, method: string) {
  const u = new URL(url)
  if (u.pathname.includes('mf-manifest.json')) return `GET  :${u.port}  ${u.port === '3001' ? 'order-form' : u.port === '3002' ? 'bank-form' : 'shell'} MFE manifest`
  const expose = u.pathname.match(/__federation_expose_(\w+)/)
  if (expose) return `GET  :${u.port}  MFE code: ${expose[1]}`
  if (u.pathname.startsWith('/api/')) return `${method.padEnd(4)} BFF  ${u.pathname}`
  if (/schema|contract/i.test(u.pathname)) return `GET  ${u.pathname}  (schema request!)`
  return null
}
async function render (page: Page) { await page.evaluate(p => (window as any).__demo?.panel(p.title, p.rows), panel).catch(() => {}) }
async function caption (page: Page, title: string, text: string) { await page.evaluate(([a, b]) => (window as any).__demo.caption(a, b), [title, text]) }
async function outlines (page: Page) {
  await page.evaluate(() => {
    const d = (window as any).__demo
    const main = document.querySelector('main') as HTMLElement | null
    if (main) main.style.margin = '16px 0 0 120px'
    d.outline('section', 'order-form MFE (from :3001)', '#2f7de1')
    d.outline('fieldset', 'Bank Form MFE, embedded (from :3002)', '#c2410c')
  })
}
const apiCalls = () => rows.filter(r => r.text.includes(' BFF  /api/')).length
const rejected = () => rows.filter(r => r.text.includes('/api/order-form/orders') && r.text.includes('422')).length

async function scene (page: Page, id: string, run: (checks: string[]) => Promise<void>) {
  const startMs = Date.now() - t0
  const checks: string[] = []
  await run(checks)
  const holdUntil = t0 + startMs + (durations[id] ?? 3) * 1000 + 700
  while (Date.now() < holdUntil) { await render(page); await sleep(150) }
  report.push({ scene: id, startMs, checks })
  console.log(`  ✔ ${id} (${checks.join('; ')})`)
}
async function expectText (page: Page, text: string, checks: string[], timeout = 6000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
  } catch {
    const shown = await page.locator('[role=alert], [data-testid=result]').allTextContents()
    throw new Error(`expected "${text}" on ${page.url()}, page showed: ${JSON.stringify(shown)}`)
  }
  checks.push(`saw "${text}"`)
}
async function expectNoText (page: Page, text: string, checks: string[]) {
  await sleep(300)
  if (await page.getByText(text, { exact: false }).count()) throw new Error(`did not expect "${text}"`)
  checks.push(`no "${text}"`)
}
async function typeInto (page: Page, testid: string, value: string) {
  const input = page.getByTestId(testid)
  await input.click()
  await input.fill('')
  await input.pressSequentially(value, { delay: 65 })
}
async function blur (page: Page) { await page.keyboard.press('Tab'); await sleep(400) }
async function fillValid (page: Page, overrides: Record<string, string> = {}) {
  const v = { item: 'Margherita pizza', accountHolder: 'Ana Cruz', accountNumber: '1234567890', bankCode: 'ABCD', ...overrides }
  for (const [k, value] of Object.entries(v)) await typeInto(page, k, value)
  await blur(page)
}
function run (cmd: string, cwd: string) {
  try { return { ok: true, out: execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } } catch (e: any) { return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` } }
}

// ---------- the recording ----------
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: path.join(OUT, 'raw'), size: { width: 1280, height: 800 } } })
await context.addInitScript(OVERLAY)
const page = await context.newPage()
t0 = Date.now()
page.on('response', async res => {
  const u = res.url()
  if (/\.js(\?|$)/.test(u) && /localhost:300\d/.test(u)) jsLoaded.add(u)
  const text = describe(u, res.request().method())
  if (!text) return
  const timing = res.request().timing()
  const ms = timing.responseEnd > 0 ? ` ${Math.round(timing.responseEnd)}ms` : ''
  rows.push({ text: `${text}  → ${res.status()}${ms}`, color: res.status() >= 400 ? '#ff9b9b' : text.includes('BFF') ? '#9be59b' : '#cfe3ff' })
})

let ok = false
try {
  await page.goto('http://localhost:3000/')
  await page.getByTestId('item').waitFor()
  await outlines(page)

  await scene(page, 'intro', async checks => {
    await caption(page, 'Schema sharing: final design', '<b>bff/</b> owns every schema · <b>ui/</b> links it (pinned git submodule) · the bundler compiles it into each MFE · no package, no runtime fetch.')
    await expectText(page, '@bff/schemas/order-form', checks)
  })

  await scene(page, 'architecture', async checks => {
    await caption(page, 'Architecture', 'Shell (:3000) → <span style="color:#7fb3ff">order-form MFE (:3001)</span> → embeds <span style="color:#ffb37f">Bank Form MFE (:3002)</span>. Rules: <b>already inside each MFE\'s code</b>.')
    if (!rows.some(r => r.text.includes('MFE code: BankFields'))) throw new Error('Bank Form was not loaded from its own server')
    if (rows.some(r => r.text.includes('schema request'))) throw new Error('a schema was fetched at runtime')
    checks.push('Bank Form loaded from :3002 inside order-form', '0 schema requests')
  })

  await scene(page, 'error-blur', async checks => {
    await caption(page, 'Error path · on blur, in the browser', 'Typing a 5-digit account number into the <b>embedded Bank Form</b>, then leaving the field.')
    await typeInto(page, 'item', 'Margherita pizza')
    await typeInto(page, 'accountHolder', 'Ana Cruz')
    const before = apiCalls()
    await typeInto(page, 'accountNumber', '12345')
    await blur(page)
    await expectText(page, 'Account number must be 10 digits', checks)
    if (apiCalls() !== before) throw new Error('the blur made a request')
    const ms = Number((await page.getByTestId('latency').textContent())?.replace(/\D/g, ''))
    checks.push(`no request; checked in ${ms} ms`)
    await caption(page, 'Error path · on blur, in the browser', `The BFF's rule ran <b>in the browser</b>: <b>${ms} ms</b>, <b>no request</b>.`)
  })

  await scene(page, 'conditional', async checks => {
    await caption(page, 'Dynamic rule (written once, in the BFF)', 'Registration number: optional for <b>personal</b>, required for <b>business</b>.')
    await page.getByTestId('accountType').selectOption('business')
    await expectText(page, 'Registration number is required for business accounts', checks)
    await sleep(4000) // long enough to read the 'required' state on screen
    await page.getByTestId('accountType').selectOption('personal')
    await expectNoText(page, 'Registration number is required', checks)
    await caption(page, 'Dynamic rule (written once, in the BFF)', 'Business → <b>required at once</b>. Personal → <b>optional again</b>. One shared rule, applied by every MFE schema.')
  })

  await scene(page, 'happy', async checks => {
    await caption(page, 'Happy path', 'Valid bank details → order-form submits <b>everything</b> (host submits) → the BFF validates again and accepts.')
    await typeInto(page, 'accountNumber', '1234567890')
    await typeInto(page, 'bankCode', 'ABCD')
    await blur(page)
    await page.getByTestId('submit').click()
    await expectText(page, 'Order accepted', checks)
  })

  await page.goto('http://localhost:3000/?bypass')
  await page.getByTestId('item').waitFor()
  await outlines(page)
  await scene(page, 'bypass', async checks => {
    await caption(page, 'Server check · rare by design', 'Browser check <b>skipped</b> on submit (?bypass). Bad data goes straight to the BFF.')
    await fillValid(page, { accountNumber: '42' })
    const before = rejected()
    await page.getByTestId('submit').click()
    await expectText(page, 'The BFF rejected the order', checks)
    await expectText(page, 'Account number must be 10 digits', checks)
    if (rejected() !== before + 1) throw new Error('expected a NEW 422 from the BFF')
    checks.push('BFF answered 422, mapped onto the embedded field')
  })

  await page.goto('http://localhost:3000/')
  await page.getByTestId('item').waitFor()
  await outlines(page)
  await scene(page, 'private-rule', async checks => {
    await caption(page, 'Private rule · BFF only', 'Bank code <b>ZZZZ</b> has a valid format, so the browser accepts it…')
    await fillValid(page, { bankCode: 'ZZZZ' })
    await expectNoText(page, "This bank isn't supported", checks)
    // Every JS file this browser actually downloaded: none may contain the blocklist.
    let matches = 0
    for (const u of jsLoaded) matches += ((await (await fetch(u)).text()).match(/ZZZZ|FAKE|BLOCKED_BANK_CODES/g) ?? []).length
    if (matches) throw new Error(`blocklist found in browser JS (${matches})`)
    checks.push(`0 blocklist matches in ${jsLoaded.size} JS files the browser downloaded`)
    const before = rejected()
    await page.getByTestId('submit').click()
    await expectText(page, "This bank isn't supported", checks)
    if (rejected() !== before + 1) throw new Error('expected a NEW 422 from the BFF')
    await caption(page, 'Private rule · BFF only', `…but on submit the <b>BFF</b> rejects it. The blocklist is in <b>0 of ${jsLoaded.size}</b> JS files the browser downloaded.`)
  })

  await scene(page, 'rule-change', async checks => {
    await caption(page, 'Change a rule: BFF + UI together', 'Editing <b>bff/packages/schemas/src/shared/bank-details.ts</b>: <code>/^\\d{10}$/</code> → <code>/^\\d{12}$/</code>. In production: a BFF PR + a UI PR that bumps the submodule pin.')
    await setDigits(12)
    await caption(page, 'Change a rule: BFF + UI together', 'BFF restarted · the linked folder changed, so the MFEs recompiled. Same file, both sides.')
    checks.push('BFF restarted on the 12-digit rule; UI dev servers recompiled')
  })

  await scene(page, 'rule-after', async checks => {
    let seen = false
    for (let i = 0; i < 10 && !seen; i++) {
      await page.goto('http://localhost:3000/')
      await page.getByTestId('item').waitFor()
      await outlines(page)
      await typeInto(page, 'accountNumber', '1234567890')
      await blur(page)
      seen = (await page.getByText('Account number must be 12 digits').count()) > 0
      if (!seen) await sleep(1000)
    }
    await expectText(page, 'Account number must be 12 digits', checks)
    const res = await fetch('http://localhost:4000/api/order-form/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: 'x', quantity: 1, bankDetails: { accountType: 'personal', accountHolder: 'Ana Cruz', accountNumber: '1234567890', bankCode: 'ABCD', registrationNumber: '' } }) })
    const body = await res.json() as { issues?: { message: string }[] }
    if (res.status !== 422 || !body.issues?.some(i => i.message.includes('12 digits'))) throw new Error('BFF did not enforce the 12-digit rule')
    checks.push('BFF also rejects 10 digits (422, "12 digits")')
    await caption(page, 'Same file, both sides', 'The embedded Bank Form now wants <b>12 digits</b>, and the BFF answers <b>422 "must be 12 digits"</b> for the old value.')
  })

  await setDigits(10) // the original rule back before the last scenes
  await page.goto('http://localhost:3002/')
  await page.getByTestId('accountNumber').waitFor()
  await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null
    if (main) main.style.margin = '16px 0 0 120px'
    ;(window as any).__demo.outline('fieldset', 'Bank Form MFE, standalone (:3002)', '#c2410c')
  })
  await scene(page, 'standalone', async checks => {
    await caption(page, 'Bank Form MFE on its own (:3002)', 'Standalone, it validates with <b>its own schema</b> (@bff/schemas/bank-form), built from the same shared BankDetails.')
    await typeInto(page, 'accountHolder', 'Ana Cruz')
    await page.getByTestId('accountType').selectOption('business')
    await expectText(page, 'Registration number is required for business accounts', checks)
    await typeInto(page, 'registrationNumber', 'REG-2026-001')
    await typeInto(page, 'accountNumber', '1234567890')
    await typeInto(page, 'bankCode', 'ABCD')
    await blur(page)
    await page.getByRole('button', { name: 'Check' }).click()
    await expectText(page, 'Valid by the bank-form schema', checks)
  })

  await scene(page, 'ci', async checks => {
    await caption(page, 'CI checks (running now)', 'The checks that keep "one schema, owned by the BFF" true over time.')
    const out: Row[] = []
    panel = { title: 'CI checks (live)', rows: out }
    const step = (label: string, r: { ok: boolean, out: string }, pick: (s: string) => string) => {
      out.push({ text: `$ ${label}`, color: '#cfe3ff' })
      out.push({ text: `  ${r.ok ? '✔' : '✖'} ${pick(r.out)}`, color: r.ok ? '#9be59b' : '#ff9b9b' })
      if (!r.ok) throw new Error(`${label} failed: ${r.out}`)
      checks.push(label)
    }
    step('bff: check-boundaries', run('node scripts/check-boundaries.mjs', BFF), s => s.trim())
    await render(page)
    step('bff: check-duplicates', run('node scripts/check-duplicates.ts', BFF), s => s.trim())
    await render(page)
    step('bff: tests (schemas + API)', run('npm test', BFF), s => (s.match(/ℹ pass \d+/)?.[0] ?? '') + ' · ' + (s.match(/ℹ fail \d+/)?.[0] ?? ''))
    await render(page)
    step('ui: typecheck order-form (BFF field names)', run('npx tsc -p apps/order-form/tsconfig.json', UI), () => 'no type errors')
    await render(page)
    step('ui: build + leak scan', run('npx turbo run build && node scripts/check-no-private-rules.mjs', UI), s => s.trim().split('\n').pop() ?? '')
    await render(page)
  })

  await page.goto('http://localhost:3000/')
  await page.getByTestId('item').waitFor()
  await outlines(page)
  await scene(page, 'outro', async checks => {
    await caption(page, 'Summary', 'One set of schemas owned by the BFF · shared/ + one file per MFE · compiled in via a pinned submodule · on-blur validation in the browser · the BFF always has the final say.')
    checks.push('done')
  })
  ok = true
} finally {
  if (fs.readFileSync(SHARED, 'utf8') !== original) await setDigits(10).catch(() => {})
  const video = page.video()
  await context.close()
  await browser.close()
  const raw = await video!.path()
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ok, scenes: report }, null, 2))
  if (ok) {
    const inputs = report.flatMap(s => ['-i', path.join(HERE, 'audio', `${s.scene}.wav`)])
    const delays = report.map((s, i) => `[${i + 1}:a]adelay=${s.startMs}|${s.startMs}[a${i}]`).join(';')
    const mix = `${delays};${report.map((_, i) => `[a${i}]`).join('')}amix=inputs=${report.length}:normalize=0[aout]`
    const mp4 = path.join(OUT, 'schema-sharing-proof.mp4')
    const r = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', mp4], { stdio: 'inherit' })
    await new Promise<void>((resolve, reject) => r.on('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
    console.log(`video: ${mp4}`)
  }
  if (!ok) process.exitCode = 1
}
