// Shared configuration for every MFE in this repo.
import path from 'node:path'
import { createRequire } from 'node:module'

// Module Federation shared scope.
// - react-hook-form MUST be a singleton: the embedded Bank Form joins the host's form through useFormContext,
//   and React context only works if both MFEs use the same module instance.
// - zod is shared so the compiled-in BFF schemas don't ship one copy of zod per MFE.
export const shared = {
  react: { singleton: true, requiredVersion: '^19.3.0' },
  'react-dom': { singleton: true, requiredVersion: '^19.3.0' },
  'react-hook-form': { singleton: true, requiredVersion: '^7.91.0' },
  zod: { singleton: true, requiredVersion: '^4.6.0' }
}

// The BFF's schemas are linked in from the BFF repo (here ../bff; in two real repos a pinned git submodule at
// vendor/bff). They declare zod as a peerDependency, so zod must resolve from THIS repo's node_modules — in UI
// CI the linked folder has no node_modules of its own. Without this alias the bundler would look next to the
// linked files' real path (inside the BFF checkout) and the build would only work on machines that also
// installed the BFF.
const require = createRequire(import.meta.url)
export const resolveFromUi = { alias: { zod: path.dirname(require.resolve('zod/package.json')) } }

// Local dev servers forward /api to the BFF, like the ingress does in production (same origin, cookies, no CORS).
export const proxyToBff = { '/api': 'http://localhost:4000' }
