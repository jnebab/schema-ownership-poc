import { defineConfig } from '@rsbuild/core'
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin'

// Builds the BFF's schemas as a Module Federation remote. Nothing is published: the BFF API serves this
// folder at GET /contracts/v1/* from its own container. "v1" = contract major version; a breaking type
// change would be built as v2 and served next to v1 until every MFE has moved.
export default defineConfig({
  source: { entry: { index: './src/index.ts' } },
  output: { assetPrefix: '/contracts/v1/', cleanDistPath: true },
  plugins: [
    pluginModuleFederation({
      name: 'bff_contracts',
      exposes: {
        './shared': './src/shared.ts',
        './bank-form': './src/bank-form.ts',
        './order-form': './src/order-form.ts'
      },
      // Also emits @mf-types.zip: the TypeScript types developers in the UI repo get, without a package.
      dts: { generateTypes: { abortOnError: true }, consumeTypes: false }
    })
  ]
})
