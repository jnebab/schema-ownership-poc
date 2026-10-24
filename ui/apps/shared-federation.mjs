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

// Local dev servers forward API calls to the BFF, like the ingress does in production (same origin, no CORS).
export const proxyToBff = { '/api': 'http://localhost:4000' }
