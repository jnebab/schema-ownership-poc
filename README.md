# Schema ownership POC: the BFF owns the schemas, the MFEs use them

Small, local proof of concept for one architectural question:

> Our UI (micro-frontends with Module Federation) and our BFF live in **two different repos**. How can the
> **BFF own** the request/response and form-validation schemas, with a shared schema plus a separate schema per
> MFE, **without publishing an npm package**?

`bff/` and `ui/` are two independent Turborepo monorepos. They stand in for the two real repos and share **no code
and no package**.

## The idea in five steps

1. **The BFF team writes each rule once** (`bff/packages/schemas`), for example "account number must be 10 digits".
   - `shared.ts`: rules used by several MFEs (`BankDetails`).
   - `order-form.ts`, `bank-form.ts`: one contract per MFE.
2. **The BFF hosts those rules at a URL**: `GET /contracts/v1/*`, plain read-only files served by the BFF itself.
   - They're built as a Module Federation remote by `bff/apps/contracts`.
   - No CDN, no registry.
3. **The MFE loads the rules in the browser** and checks the form while the user types.
4. **The user submits.**
5. **The BFF checks again with the same code** (`bff/apps/api`). It returns `201`, or `422` with errors per field
   (`{ path: "bankDetails.accountNumber", message }`) that the form shows on the right input.

For developers, Module Federation's type sharing also downloads the TypeScript **types** of the contracts (a
`@mf-types.zip` the BFF serves next to the rules), so the editor knows every field. The UI repo contains no rule.

## Two modes, side by side

The same form runs in either mode, and only one line differs (`ui/apps/order-form/src/OrderForm.tsx`):

| `?validation=` | Where the check runs while typing | What the UI holds |
|---|---|---|
| `downloaded` (default) | In the browser, with the rules downloaded from the BFF | Nothing but a loader |
| `server` | In the BFF (`POST /api/<mfe>/validate` on blur) | Nothing at all |

In both modes the BFF validates again on submit and has the final say. The page shows how long each check took,
so you can compare the latency.

## MFE inside an MFE: Bank Form

- `ui/apps/bank-form` exposes `BankFields`.
- `ui/apps/order-form` embeds it and **submits the bank details itself** ("host submits"). That's why `BankDetails`
  lives in the shared contract.
- The bank fields join the host's form through `useFormContext`. For that, `react-hook-form` is a **singleton** in the
  Module Federation shared scope; otherwise each MFE would have its own React context and the fields wouldn't connect.
- Standalone (`localhost:3002`), Bank Form validates with **its own** `bank-form` contract.

## Run it

Needs Node 24 or newer.

Start the BFF first, in one terminal:

```bash
cd bff
```

```bash
npm install
```

```bash
npm start
```

That serves the API and `/contracts/v1` on http://localhost:4000.

Then start the UI, in a second terminal:

```bash
cd ui
```

```bash
npm install
```

```bash
npm run dev
```

The ports are:
- shell: http://localhost:3000
- order-form: 3001
- bank-form: 3002

Open http://localhost:3000/?validation=downloaded, then http://localhost:3000/?validation=server.

Things to try:
- **Type a short account number and leave the field.** The error comes from the BFF's rule, in both modes.
- **Change the rule in `bff/packages/schemas/src/shared.ts`** (for example 10 to 12 digits), then rebuild and restart
  only the BFF. Reload the page: the UI enforces the new rule **without rebuilding the UI**.
- **Add `&bypass` to the URL** to skip the browser check on submit. The BFF still rejects bad data with field errors.

## Demo video and end-to-end test

[`demo/schema-ownership-demo.mp4`](demo/schema-ownership-demo.mp4) (2 min, narrated) shows, in a real browser:
- the happy and error paths in both modes
- the Bank Form MFE inside the order-form MFE
- the BFF rejecting bad data when the browser check is bypassed
- a 10 → 12-digit rule change shipped by redeploying **only the BFF**

The recorder is also the end-to-end test: every scene asserts what must be on screen, and the run fails otherwise.

Narration is generated locally with Qwen3-TTS (open source); it needs a Python env with `qwen-tts` and a CUDA torch:

```bash
python -I demo/tts.py
```

Then record. This needs the BFF and the UI dev servers running, plus ffmpeg:

```bash
node demo/record.ts
```

Local timings from the run:
- downloaded rules: the check runs in the browser in 0–1 ms
- server mode: a `/validate` round trip of about 3 ms on localhost (real networks add latency)

## Gotchas found while building it

- **Relative `publicPath` in the contracts manifest.** The browser fetches the rule files from the *page's* origin.
  - So each UI server (and the ingress in production) must route `/contracts` to the BFF.
  - Without that, the rules silently fail to load, and the form falls back to BFF-only validation.
  - The fallback worked as designed, which is exactly why it hid the problem until the recorder asserted that the rule code itself loaded.
- **The same relative path breaks the type download.**
  - Module Federation's type consumer can't resolve a relative URL, so the UI tells it the types URL explicitly (`BFF_CONTRACTS_TYPES`).
  - The BFF's exposed files re-export the schemas **by relative path**, so the types zip is self-contained (the UI repo has no `@bff/schemas`).
- **The UI's typecheck uses the BFF's field names.** Misspelling `bankDetails.accountNumber` in the UI fails `tsc` with the BFF's real field list.
- **`react-hook-form` must be a singleton** in the shared scope, or the embedded Bank Form can't join the host's form.
- **Clicking a button right after typing** can miss when the blur removes an error line and the layout shifts.

## Status

- ✅ **Works:**
  - BFF-owned schemas served at `/contracts/v1`
  - browser and server validation from the same code
  - MFE inside MFE
  - type sharing with no package
  - a passing end-to-end recording
