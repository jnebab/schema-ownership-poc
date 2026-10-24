import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'
import { shared, proxyToBff } from '../shared-federation.mjs'

export default defineConfig({
  server: { port: 3000, proxy: proxyToBff },
  html: { title: 'Schema ownership POC' },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'shell',
      remotes: { order_form: 'order_form@http://localhost:3001/mf-manifest.json' },
      shared,
      dts: { generateTypes: false, consumeTypes: true }
    })
  ]
})
