import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { shared, resolveFromUi, proxyToBff } from '../shared-federation.mjs'

// Bank Form MFE: a small component other MFEs embed (order-form does), and a page of its own.
// Its schema (@bff/schemas/bank-form) is linked from the BFF repo and compiled into this bundle.
export default defineConfig({
  server: { port: 3002, proxy: proxyToBff },
  resolve: resolveFromUi,
  html: { title: 'Bank Form (standalone)' },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'bank_form',
      exposes: { './BankFields': './src/BankFields.tsx' },
      shared,
      // Hermetic builds: remote component types come from apps/remotes.d.ts, not from a running remote.
      dts: false
    })
  ]
})
