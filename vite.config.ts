import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Where the Spring API lives in development. Override with API_TARGET when
 * running against something other than a local backend.
 */
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx(), vueDevTools()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    /**
     * The dev proxy, and the reason there is no CORS configuration in the backend.
     *
     * The browser refuses to let JavaScript on http://localhost:5173 read a response from
     * http://localhost:8080 — different port, different origin. Rather than opening the API up
     * with CORS, the dev server fetches on our behalf: the browser only ever talks to 5173, so
     * there is no cross-origin request left to permit.
     *
     * That matters more here than it would for a token-based API. Session cookies and the CSRF
     * double-submit both assume the client and the API share an origin; the alternative is an
     * exact-origin allow-list, `allowCredentials`, a permitted `X-XSRF-TOKEN` header, and a fix
     * for the preflight `OPTIONS` that `anyRequest().authenticated()` would otherwise reject with
     * a 401 before the real request was ever sent.
     *
     * This is dev only — `vite dev` is not running in production. There, serve the built SPA from
     * the same origin as the API (Spring's static resources, or one reverse proxy in front of
     * both) so the same assumptions still hold.
     */
    proxy: {
      '/api': {
        target: API_TARGET,
        // The API's routes live at the root (/products, /auth/login), so the /api prefix exists
        // only to mark which requests to forward. Strip it before it reaches Spring.
        rewrite: (path) => path.replace(/^\/api/, ''),
        // Host stays localhost, which is what the backend sees anyway. Set this to true only if
        // the target ever starts validating the Host header.
        changeOrigin: false,
      },
    },
  },
})
