# Schema sharing POC: BFF-owned schemas, compiled into Module Federation MFEs

How can a **BFF own the form and request schemas** used by micro-frontends that live in **another repo**, without
publishing an npm package, without duplicating schemas between MFEs, and with **on-blur validation**?

`bff/` and `ui/` are two independent Turborepo monorepos, standing in for the two real repos.

- **Proof video** (2.7 min, narrated): [`demo/schema-sharing-proof.mp4`](demo/schema-sharing-proof.mp4). Every scene is asserted, so the recording is also the end-to-end test.
- **Explainer video** (7.3 min, narrated): [`explainer/schema-sharing-explainer.mp4`](explainer/schema-sharing-explainer.mp4). It covers a code walkthrough of how and why the sharing works, how git submodules work, and how this compares with what top teams do (pitfalls, advantages, when to revisit).
- **Alternatives and best practice** (what top teams do, and every option we weighed): kept in the team's reference doc. The runtime-served-rules variant is on the branch [`alt/runtime-contracts`](https://github.com/jnebab/schema-ownership-poc/tree/alt/runtime-contracts).

## The design in one picture

```
bff/ (BFF repo)                                   ui/ (UI repo)
  packages/schemas/src/                             vendor/bff  ← git submodule, pinned to a BFF commit
    shared/bank-details.ts   ← used by 2+ MFEs          (here: ../bff, the same folder)
    order-form.ts            ← one file per MFE     apps/order-form  ─┐ "@bff/schemas": "file:…/packages/schemas"
    bank-form.ts                                    apps/bank-form   ─┘ compiled INTO each bundle by rsbuild
  apps/api/
    src/server.ts            ← validates every submit with the SAME schemas
    src/private-rules.ts     ← server-only rules (never in a bundle)
```

1. **One owner.** Every schema lives in `bff/packages/schemas`: `shared/` holds pieces two or more MFEs need, and there is one file per MFE. A shape moves to `shared/` on its second use; nobody copies it.
2. **No package, no runtime fetch.** The UI repo pins the BFF repo as a **git submodule** and depends on its schemas folder by path (`file:` with npm, `link:` with pnpm). The bundler compiles the schemas into each MFE, so the types and the rules come from the same commit.
3. **On-blur validation in the browser.** React Hook Form's `standardSchemaResolver` runs the BFF's schema, with `mode: 'onTouched'` (validate on first blur, then on every change).
4. **The BFF has the final say.** Every submit is validated again with the same schema, plus private rules. For a well-behaved UI a `422` is rare: bypassed browsers, private rules, drift.
5. **Change policy.** A BFF schema PR ships with a UI PR that bumps the submodule pin. Shape changes stay additive for one release, since rolling deploys and open tabs make "the same time" non-atomic.

## The parts that make it work

| Concern | How | Where |
|---|---|---|
| Embedded MFE (Bank Form inside order-form, host submits) | Bank fields join the host's form via `useFormContext`; `react-hook-form` is a **singleton** in the MF shared scope | `ui/apps/bank-form/src/BankFields.tsx`, `ui/apps/shared-federation.mjs` |
| Dynamic rule (registration number required only for business) | A shared rule *function* applied last in each MFE schema, with Zod 4's `when` | `bff/packages/schemas/src/shared/bank-details.ts` |
| Zod 4: `.extend()` / `.partial()` throw on refined schemas | `shared/` objects stay unrefined; refinements go on last | same |
| `zod` in UI CI (the linked folder has no `node_modules`) | `zod` is a **peerDependency**; the UI aliases it to its own copy | `ui/apps/shared-federation.mjs` (`resolveFromUi`), app `tsconfig.json` `paths` |
| Re-check a dependent field when its trigger changes | `trigger('bankDetails.registrationNumber')` on account-type change. RHF `deps` doesn't fire for an untouched select in `onTouched` mode | `BankFields.tsx` |
| Private rules can't leak | They live in `bff/apps/api`, **outside** the linked folder; a leak scan of the built bundles is the backstop | `bff/apps/api/src/private-rules.ts`, `ui/scripts/check-no-private-rules.mjs` |

**On visibility:** public rules ("10 digits", conditional "required") are readable in the bundle, like all front-end code. That's fine: the BFF re-validates everything. Only rules that never run in the browser can be hidden.

## Checks (CI)

From `bff/`:

```bash
npm run check
```

That runs the import boundaries, the duplicate-shape check, a typecheck, and the schema and API tests.

From `bff/`, to list the MFEs a change affects (for the paired UI PR):

```bash
npm run impact -- packages/schemas/src/shared/bank-details.ts
```

From `ui/`, to build every MFE and prove no private rule is in any bundle:

```bash
npm run check:leaks
```

From `ui/`, to type-check against the BFF's field names:

```bash
npx turbo run typecheck
```

Every check was run with a negative control (a deliberate violation must fail it):

| Check | Deliberate violation | Result |
|---|---|---|
| Boundaries | An MFE importing another MFE | Fails |
| Duplicates | A copy-pasted `BankDetails` | Flagged; `--strict` fails |
| Leak scan | `ZZZZ` pulled into order-form | Fails |
| Typecheck | A misspelled field | Fails with the BFF's real field list |
| `when` test | Removing `when` | That test fails |

The UI also **builds and type-checks with `bff/node_modules` removed**, which is the UI-CI situation, using only the linked source.

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

That serves the API on http://localhost:4000.

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
- Bank Form standalone: http://localhost:3002

Things to try:
- **A short account number:** error on blur, no request.
- **Switch account type to Business:** the registration number becomes required.
- **Bank code `ZZZZ`:** the browser accepts it; the BFF rejects it on submit.
- **`?bypass`:** skips the browser check; the BFF still rejects bad data.

To re-record the proof video (needs ffmpeg; the narration uses local Qwen3-TTS, and a Python env with `qwen-tts` and a CUDA torch), generate the narration:

```bash
python -I demo/tts.py
```

Check it with Whisper:

```bash
python -I demo/check-asr.py demo/narration.json demo/audio
```

Then record:

```bash
node demo/record.ts
```

To rebuild the explainer (a [HyperFrames](https://hyperframes.heygen.com) composition: HTML + GSAP, with Three.js for the 3D scenes), generate its narration with the same voice:

```bash
python -I explainer/scripts/tts.py
```

Check it with Whisper:

```bash
python -I demo/check-asr.py explainer/narration.json explainer/audio
```

From `explainer/`, build the narration track and `timing.js`:

```bash
node scripts/assemble.mjs
```

Then render:

```bash
npx --yes hyperframes@0.8.162 render -o renders/schema-sharing-explainer.mp4
```

### Two real repos

In the UI repo, add the BFF repo as a pinned submodule:

```bash
git submodule add <bff-repo-url> vendor/bff
```

Then point each MFE at it: `"@bff/schemas": "file:../../vendor/bff/packages/schemas"`. CI checks out with submodules (for example `actions/checkout` with `submodules: true`); a private BFF repo needs a token with read access. To bump the pin in the paired UI PR, update the submodule to the latest BFF commit:

```bash
git submodule update --remote vendor/bff
```

Then commit the new `vendor/bff` pointer.
