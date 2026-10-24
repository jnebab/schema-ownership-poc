import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { shared, BFF_CONTRACTS, BFF_CONTRACTS_TYPES, proxyToBff } from '../shared-federation.mjs'

// Bank Form MFE: a small component that other MFEs embed (order-form does).
export default defineConfig({
  server: { port: 3002, proxy: proxyToBff },
  html: { title: 'Bank Form (standalone)' },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'bank_form',
      exposes: { './BankFields': './src/BankFields.tsx' },
      remotes: { bff_contracts: BFF_CONTRACTS },
      shared,
      dts: { generateTypes: true, consumeTypes: { remoteTypeUrls: BFF_CONTRACTS_TYPES } }
    })
  ]
})
