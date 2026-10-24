import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { shared, resolveFromUi, proxyToBff } from '../shared-federation.mjs'

export default defineConfig({
  server: { port: 3000, proxy: proxyToBff },
  resolve: resolveFromUi,
  html: { title: 'Schema sharing POC' },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'shell',
      remotes: { order_form: 'order_form@http://localhost:3001/mf-manifest.json' },
      shared,
      // Hermetic builds: remote component types come from apps/remotes.d.ts, not from a running remote.
      dts: false
    })
  ]
})
