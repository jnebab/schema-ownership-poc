import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { shared, resolveFromUi, proxyToBff } from '../shared-federation.mjs'

// Order-form MFE: hosts the Bank Form MFE inside its form and submits everything ("host submits").
// Its schema (@bff/schemas/order-form) is linked from the BFF repo and compiled into this bundle.
export default defineConfig({
  server: { port: 3001, proxy: proxyToBff },
  resolve: resolveFromUi,
  html: { title: 'Order form (standalone)' },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'order_form',
      exposes: { './OrderForm': './src/OrderForm.tsx' },
      remotes: { bank_form: 'bank_form@http://localhost:3002/mf-manifest.json' },
      shared,
      // Hermetic builds: remote component types come from apps/remotes.d.ts, not from a running remote.
      dts: false
    })
  ]
})
