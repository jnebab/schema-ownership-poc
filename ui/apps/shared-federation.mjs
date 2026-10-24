// Shared scope for every MFE in this repo. react-hook-form MUST be a singleton: Bank Form reads the host's
// form through useFormContext, and React context only works if both MFEs use the same module instance.
export const shared = {
  react: { singleton: true, requiredVersion: '^19.3.0' },
  'react-dom': { singleton: true, requiredVersion: '^19.3.0' },
  'react-hook-form': { singleton: true, requiredVersion: '^7.91.0' }
}

// Where the BFF serves its contracts. In production this is the same origin behind the ingress
// (/contracts/v1/...); locally the BFF runs on :4000.
export const BFF_CONTRACTS = 'bff_contracts@http://localhost:4000/contracts/v1/mf-manifest.json'

// Where the BFF serves the contract TYPES. Given explicitly because the contracts manifest uses a relative
// publicPath (/contracts/v1/, same-origin in production), and the type downloader can't resolve a relative URL.
export const BFF_CONTRACTS_TYPES = {
  bff_contracts: {
    zip: 'http://localhost:4000/contracts/v1/@mf-types.zip',
    api: 'http://localhost:4000/contracts/v1/@mf-types.d.ts'
  }
}

// Local dev servers forward /api AND /contracts to the BFF, like the ingress does in production (same origin).
// /contracts matters: the contracts manifest uses a relative publicPath, so the browser fetches the rule files
// from the PAGE's origin. Without this proxy the shell's dev server answers with its HTML page and the rules
// never load (the form then silently falls back to BFF-only validation, which is how we found it).
export const proxyToBff = { '/api': 'http://localhost:4000', '/contracts': 'http://localhost:4000' }
