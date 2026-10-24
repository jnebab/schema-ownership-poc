// Records the narrated demo AND acts as the end-to-end test: every scene asserts what must be on screen,
// and the run fails (exit 1) if anything doesn't happen. Needs the BFF on :4000 and the UI dev servers on
// :3000-3002, plus demo/audio/*.wav from demo/tts.py (used for pacing and the soundtrack).
//
//   node demo/record.ts            -> demo/out/schema-ownership-demo.mp4 + demo/out/report.json
import { chromium, type Page } from '../ui/node_modules/playwright-core/index.mjs'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const BFF = path.join(ROOT, 'bff')
const OUT = path.join(HERE, 'out')
const SHARED = path.join(BFF, 'packages/schemas/src/shared.ts')
const durations: Record<string, number> = JSON.parse(fs.readFileSync(path.join(HERE, 'audio/durations.json'), 'utf8'))
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const report: { scene: string, startMs: number, checks: string[] }[] = []
const latencies: { mode: string, ms: number }[] = []
let t0 = 0

// ---------- BFF control (the "redeploy only the BFF" step) ----------
function pidOn (port: number) {
  const out = execSync('netstat -ano', { encoding: 'utf8' })
  const line = out.split('\n').find(l => /LISTENING/.test(l) && new RegExp(`[:\\]]${port}\\s`).test(l))
  return line?.trim().split(/\s+/).pop()
}
async function restartBff () {
  const pid = pidOn(4000)
  if (pid) execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
  const child = spawn(process.execPath, ['apps/api/src/server.ts'], { cwd: BFF, detached: true, stdio: 'ignore', env: { ...process.env, LOG_LEVEL: 'warn' } })
  child.unref()
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://localhost:4000/api/health')).ok) return } catch {}
    await sleep(100)
  }
  throw new Error('BFF did not come back')
}
const buildContracts = () => execSync('npx turbo run build --force', { cwd: BFF, stdio: 'ignore' })
const original = fs.readFileSync(SHARED, 'utf8')
async function setDigits (n: number) {
  fs.writeFileSync(SHARED, original.replace('/^\\d{10}$/', `/^\\d{${n}}$/`).replace('must be 10 digits', `must be ${n} digits`))
  buildContracts()
  await restartBff()
}

// ---------- on-screen overlay: captions, request log, MFE outlines ----------
const OVERLAY = `
window.__demo = {
  root () {
    let r = document.getElementById('__demo')
    if (!r) {
      r = document.createElement('div'); r.id = '__demo'
      r.innerHTML = '<div id="__cap" style="position:fixed;left:24px;right:420px;bottom:20px;background:#111c;color:#fff;font:15px/1.45 system-ui;padding:12px 16px;border-radius:10px;z-index:99999"></div>' +
        '<div id="__log" style="position:fixed;top:16px;right:16px;width:380px;max-height:70vh;overflow:hidden;background:#0b1020e6;color:#cfe3ff;font:12px/1.5 ui-monospace,Consolas,monospace;padding:10px 12px;border-radius:10px;z-index:99999"><div style="color:#fff;font-weight:600;margin-bottom:6px">Requests (live)</div><div id="__rows"></div></div>'
      document.body.appendChild(r)
    }
    return r
  },
  caption (title, text) { this.root(); document.getElementById('__cap').innerHTML = '<b style="color:#ffd27a">' + title + '</b><br>' + text },
  rows (rows) { this.root(); document.getElementById('__rows').innerHTML = rows.slice(-18).map(r => '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + r.color + '">' + r.text + '</div>').join('') },
  outline (sel, label, color) {
    const el = document.querySelector(sel); if (!el) return
    el.style.outline = '3px solid ' + color; el.style.outlineOffset = '4px'; el.style.position = 'relative'
    const tag = document.createElement('div'); tag.textContent = label
    tag.style.cssText = 'position:absolute;top:-14px;right:8px;background:' + color + ';color:#fff;font:600 11px system-ui;padding:2px 8px;border-radius:6px;z-index:9999'
    el.appendChild(tag)
  }
}`
const rows: { text: string, color: string }[] = []
function describe (url: string, method: string) {
  const u = new URL(url)
  if (u.pathname.includes('mf-manifest.json')) {
    if (u.port === '4000') return 'GET  BFF  /contracts/v1  (rules manifest)'
    return `GET  :${u.port}  ${u.port === '3001' ? 'order-form' : u.port === '3002' ? 'bank-form' : 'shell'} MFE manifest`
  }
  const expose = u.pathname.match(/__federation_expose_(\w+)/)
  if (expose && u.pathname.startsWith('/contracts/')) return `GET  BFF  /contracts/v1  rules: ${expose[1].replace('_', '-')}`
  if (expose) return `GET  :${u.port}  MFE code: ${expose[1]}`
  if (u.pathname.startsWith('/api/')) return `${method.padEnd(4)} BFF  ${u.pathname}`
  return null
}
async function renderRows (page: Page) { await page.evaluate(r => (window as any).__demo?.rows(r), rows).catch(() => {}) }
async function caption (page: Page, title: string, text: string) { await page.evaluate(([a, b]) => (window as any).__demo.caption(a, b), [title, text]) }
async function outlines (page: Page) {
  await page.evaluate(() => {
    const d = (window as any).__demo
    const main = document.querySelector('main') as HTMLElement | null
    if (main) main.style.margin = '24px 0 0 120px' // leave room for the request panel on the right
    d.outline('section', 'order-form MFE (from :3001)', '#2f7de1')
    d.outline('fieldset', 'Bank Form MFE, embedded (from :3002)', '#c2410c')
  })
}

// Each scene runs its actions, then holds until its narration has finished.
async function scene (page: Page, id: string, run: (checks: string[]) => Promise<void>) {
  const startMs = Date.now() - t0
  const checks: string[] = []
  await run(checks)
  const holdUntil = t0 + startMs + (durations[id] ?? 3) * 1000 + 700
  while (Date.now() < holdUntil) { await renderRows(page); await sleep(150) }
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
async function typeInto (page: Page, testid: string, value: string) {
  const input = page.getByTestId(testid)
  await input.click()
  await input.fill('')
  await input.pressSequentially(value, { delay: 70 })
}
async function blur (page: Page) { await page.keyboard.press('Tab'); await sleep(400) }
async function readLatency (page: Page, mode: string) {
  const ms = Number((await page.getByTestId('latency').textContent())?.replace(/\D/g, ''))
  latencies.push({ mode, ms })
  return ms
}

// ---------- the recording ----------
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: path.join(OUT, 'raw'), size: { width: 1280, height: 800 } } })
await context.addInitScript(OVERLAY)
const page = await context.newPage()
t0 = Date.now()
page.on('response', async res => {
  const text = describe(res.url(), res.request().method())
  if (!text) return
  const timing = res.request().timing()
  const ms = timing.responseEnd > 0 ? ` ${Math.round(timing.responseEnd)}ms` : ''
  rows.push({ text: `${text}  → ${res.status()}${ms}`, color: res.status() >= 400 ? '#ff9b9b' : text.includes('BFF') ? '#9be59b' : '#cfe3ff' })
})

let ok = false
try {
  await page.goto('http://localhost:3000/?validation=downloaded')
  await page.getByTestId('item').waitFor()
  await outlines(page)

  await scene(page, 'intro', async checks => {
    await caption(page, 'Schema ownership POC', 'Two repos: <b>bff/</b> owns every rule, <b>ui/</b> (shell + MFEs) keeps no copy. No npm package is published.')
    await expectText(page, 'Validation: downloaded', checks)
  })

  await scene(page, 'architecture', async checks => {
    await caption(page, 'Architecture', 'Shell (:3000) → <span style="color:#7fb3ff">order-form MFE (:3001)</span> → embeds <span style="color:#ffb37f">Bank Form MFE (:3002)</span>. Rules: <span style="color:#9be59b">BFF /contracts/v1</span>.')
    // The rules CODE must have loaded (not just the manifest), or the form would silently fall back to BFF-only.
    if (!rows.some(r => r.text.includes('rules: order-form') && r.text.includes('→ 200'))) throw new Error('order-form rules were not loaded from the BFF')
    checks.push('order-form rules loaded from BFF /contracts/v1', 'Bank Form rendered inside order-form')
    await page.getByTestId('accountNumber').waitFor()
  })

  await scene(page, 'error-downloaded', async checks => {
    await caption(page, 'Error path · rules downloaded from the BFF', 'Typing a 5-digit account number into the <b>embedded Bank Form</b>, then leaving the field.')
    await typeInto(page, 'item', 'Margherita pizza')
    await typeInto(page, 'accountHolder', 'Ana Cruz')
    await typeInto(page, 'accountNumber', '12345')
    await blur(page)
    await expectText(page, 'Account number must be 10 digits', checks)
    const ms = await readLatency(page, 'downloaded')
    await caption(page, 'Error path · rules downloaded from the BFF', `The BFF's rule ran <b>in the browser</b>: checked in <b>${ms} ms</b>, no request needed.`)
    checks.push(`client check ${ms} ms`)
  })

  await scene(page, 'happy-downloaded', async checks => {
    await caption(page, 'Happy path', 'Valid bank details → order-form submits <b>everything</b> (host submits) → the BFF validates again and accepts.')
    await typeInto(page, 'accountNumber', '1234567890')
    await typeInto(page, 'bankCode', 'ABCD')
    await blur(page)
    await page.getByTestId('submit').click()
    await expectText(page, 'Order accepted', checks)
  })

  await page.goto('http://localhost:3000/?validation=server')
  await page.getByTestId('item').waitFor()
  await outlines(page)
  await scene(page, 'error-server', async checks => {
    await caption(page, 'Error path · rules only in the BFF', 'No rules in the browser. Leaving a field calls <b>POST /api/order-form/validate</b>.')
    await typeInto(page, 'item', 'Margherita pizza')
    await typeInto(page, 'accountHolder', 'Ana Cruz')
    await typeInto(page, 'accountNumber', '12345')
    await blur(page)
    await expectText(page, 'Account number must be 10 digits', checks)
    const ms = await readLatency(page, 'server')
    if (!rows.some(r => r.text.includes('/api/order-form/validate'))) throw new Error('no /validate call seen')
    await caption(page, 'Error path · rules only in the BFF', `Same message, answered by the BFF's /validate in <b>${ms} ms</b> (a round trip).`)
    checks.push('answered by /validate', `server check ${ms} ms`)
  })

  await scene(page, 'happy-server', async checks => {
    await caption(page, 'Happy path · server mode', 'Valid details pass the BFF check and the order is accepted.')
    await typeInto(page, 'accountNumber', '1234567890')
    await typeInto(page, 'bankCode', 'ABCD')
    await blur(page)
    await page.getByTestId('submit').click()
    await expectText(page, 'Order accepted', checks)
  })

  await page.goto('http://localhost:3000/?validation=downloaded&bypass')
  await page.getByTestId('item').waitFor()
  await outlines(page)
  await scene(page, 'bypass', async checks => {
    await caption(page, 'Error path · the BFF has the final say', 'Browser check <b>skipped</b> on submit (?bypass). Bad data goes straight to the BFF.')
    await typeInto(page, 'item', 'Margherita pizza')
    await typeInto(page, 'accountHolder', 'Ana Cruz')
    await typeInto(page, 'accountNumber', '42')
    await typeInto(page, 'bankCode', 'ABCD')
    await page.getByTestId('submit').click()
    await expectText(page, 'The BFF rejected the order', checks)
    await expectText(page, 'Account number must be 10 digits', checks)
    if (!rows.some(r => r.text.includes('/api/order-form/orders') && r.text.includes('422'))) throw new Error('expected a 422 from the BFF')
    checks.push('BFF answered 422, error mapped onto the embedded field')
  })

  await scene(page, 'rule-change', async checks => {
    await caption(page, 'Change the rule in the BFF only', 'Editing <b>bff/packages/schemas/src/shared.ts</b>: <code>/^\\d{10}$/</code> → <code>/^\\d{12}$/</code>, rebuilding and restarting <b>only the BFF</b>…')
    await setDigits(12)
    await caption(page, 'Change the rule in the BFF only', 'BFF redeployed with the 12-digit rule. <b>The UI was not touched or rebuilt.</b>')
    checks.push('BFF rebuilt + restarted; UI untouched')
  })

  await page.goto('http://localhost:3000/?validation=downloaded')
  await page.getByTestId('item').waitFor()
  await outlines(page)
  await scene(page, 'rule-after', async checks => {
    await caption(page, 'Same UI, new rule', 'Reloaded the page. The old valid 10-digit number is now rejected by the embedded Bank Form.')
    await typeInto(page, 'accountNumber', '1234567890')
    await blur(page)
    await expectText(page, 'Account number must be 12 digits', checks)
  })

  await setDigits(10) // put the original rule back before the last scenes
  await page.goto('http://localhost:3002/?validation=downloaded')
  await page.getByTestId('accountNumber').waitFor()
  await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null
    if (main) main.style.margin = '24px 0 0 120px'
    ;(window as any).__demo.outline('fieldset', 'Bank Form MFE, standalone (:3002)', '#c2410c')
  })
  await scene(page, 'standalone', async checks => {
    await caption(page, 'Bank Form MFE on its own (:3002)', 'Standalone, it validates with <b>its own bank-form contract</b> from the BFF.')
    await typeInto(page, 'accountHolder', 'Ana Cruz')
    await typeInto(page, 'accountNumber', '999')
    await blur(page)
    await expectText(page, 'Account number must be 10 digits', checks)
    await typeInto(page, 'accountNumber', '1234567890')
    await typeInto(page, 'bankCode', 'ABCD')
    // Leave the field first: the blur clears an error line, the layout shifts up, and a click in the same
    // gesture would land where the button used to be (a real UX papercut worth knowing about).
    await blur(page)
    await page.getByRole('button', { name: 'Check' }).click()
    await expectText(page, 'Valid by the bank-form contract', checks)
    if (!rows.some(r => r.text.includes('rules: bank-form'))) throw new Error('bank-form contract not loaded')
    checks.push('loaded the bank-form contract')
  })

  await page.goto('http://localhost:3000/?validation=downloaded')
  await page.getByTestId('item').waitFor()
  await outlines(page)
  await scene(page, 'outro', async checks => {
    await caption(page, 'Summary', 'One source of truth in the BFF · a contract per MFE (+ shared) · MFE inside MFE works · BFF always re-checks · no published package.')
    checks.push('done')
  })
  ok = true
} finally {
  if (!ok) await setDigits(10).catch(() => {}) // never leave the 12-digit rule behind
  const video = page.video()
  await context.close()
  await browser.close()
  const raw = await video!.path()
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ok, latencies, scenes: report }, null, 2))

  if (ok) {
    // Lay each narration clip at its scene's start time and mux with the video.
    const inputs = report.flatMap(s => ['-i', path.join(HERE, 'audio', `${s.scene}.wav`)])
    const delays = report.map((s, i) => `[${i + 1}:a]adelay=${s.startMs}|${s.startMs}[a${i}]`).join(';')
    const mix = `${delays};${report.map((_, i) => `[a${i}]`).join('')}amix=inputs=${report.length}:normalize=0[aout]`
    const mp4 = path.join(OUT, 'schema-ownership-demo.mp4')
    const r = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', mp4], { stdio: 'inherit' })
    await new Promise<void>((resolve, reject) => r.on('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
    console.log(`video: ${mp4}`)
  }
  console.log(`latency: ${JSON.stringify(latencies)}`)
  if (!ok) process.exitCode = 1
}
