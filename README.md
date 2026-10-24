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

## Status (honest)

- ✅ **Works:**
  - The BFF serves the contracts.
  - `/validate` and submit validate with the same schemas.
  - Shell → order-form → embedded Bank Form load through Module Federation.
- ⚠️ **Open: type sharing.**
  - The BFF generates and serves `@mf-types.zip` correctly.
  - The UI's type **consumption** isn't landing the files where TypeScript looks yet.
  - Generating types for the MFEs' own exposes fails until it does.
  - This only affects editor and type-check support, not the runtime behaviour.
- **Not yet:**
  - automated browser tests of both modes
  - the latency comparison numbers
  - the rule-change demo as a scripted check
