/// <reference types="vite/client" />

/**
 * Only set for a deployment where the API is not at the root of the same origin. Unset is the
 * normal case: `/api` in development for the proxy, and nothing in production. See `src/lib/http.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
