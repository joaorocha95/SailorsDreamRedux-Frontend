import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
// Vite's forthcoming native config loader warns that this import has no file extension. Adding
// one needs `allowImportingTsExtensions`, which breaks `vue-tsc --build`, so the warning stays
// until the scaffold's tsconfig moves. It is informational, about a future default.
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
