import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { shared, BFF_CONTRACTS, BFF_CONTRACTS_TYPES, proxyToBff } from '../shared-federation.mjs'

// Order-form MFE: hosts the Bank Form MFE inside its form and submits everything ("host submits").
export default defineConfig({
  server: { port: 3001, proxy: proxyToBff },
  html: { title: 'Order form (standalone)' },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'order_form',
      exposes: { './OrderForm': './src/OrderForm.tsx' },
      remotes: { bank_form: 'bank_form@http://localhost:3002/mf-manifest.json', bff_contracts: BFF_CONTRACTS },
      shared,
      dts: { generateTypes: true, consumeTypes: { remoteTypeUrls: BFF_CONTRACTS_TYPES } }
    })
  ]
})
