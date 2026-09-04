import type { ProblemDetail } from '@/types/api'

/**
 * The single way this app talks to the API.
 *
 * Four things are handled here so that no caller has to remember them:
 *
 *  1. **Cookies.** The session is a cookie, so every request needs
 *     `credentials: 'include'`. Forgetting it on one call produces an inexplicable 401.
 *  2. **CSRF.** Spring issues an `XSRF-TOKEN` cookie and expects it echoed in the
 *     `X-XSRF-TOKEN` header on every unsafe method.
 *  3. **Errors.** The API answers with RFC 7807 `ProblemDetail`. Anything non-2xx becomes an
 *     `ApiError` carrying the parsed body, so a component can show `detail` instead of inventing
 *     its own copy.
 *  4. **401.** A dead session should log the app out once, centrally, not in forty catch blocks.
 */

/**
 * Where the API lives, relative to wherever this page is served from.
 *
 * **`/api` is a development-only fiction.** The API's own routes are at the root — `/products`,
 * `/auth/login` — and the prefix exists solely so the Vite dev server knows which requests to
 * forward to `:8080`, stripping it on the way. Served the way production serves it, same-origin
 * with the API, there is nothing to mark and nothing to strip: the prefix would just be a path
 * Spring has never heard of.
 *
 * Overridable with `VITE_API_BASE` for a deployment that really does mount the API under a
 * prefix — behind a reverse proxy carving one origin into two, say. Empty string means "the root
 * of this origin", which is the same-origin case the cookie session and the CSRF double-submit
 * both assume.
 */
const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? '/api' : '')
const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'

/** Methods the server treats as state-changing, and therefore CSRF-protected. */
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemDetail | null
  /** Seconds to wait, from the `Retry-After` header on a 429. Null for every other status. */
  readonly retryAfterSeconds: number | null

  constructor(status: number, problem: ProblemDetail | null, retryAfterSeconds: number | null) {
    // `detail` is written to be shown to a person — see the API's error model. Fall back only
    // when it is genuinely absent.
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
    this.retryAfterSeconds = retryAfterSeconds
  }

  /** Not signed in, or the session expired. */
  get isUnauthenticated() {
    return this.status === 401
  }

  /** Signed in, and not allowed. Also what a failed CSRF check looks like. */
  get isForbidden() {
    return this.status === 403
  }

  get isNotFound() {
    return this.status === 404
  }

  /** The request was fine; the resource is in a state that refuses it (retired account, image cap). */
  get isConflict() {
    return this.status === 409
  }

  get isRateLimited() {
    return this.status === 429
  }
}

/**
 * Called once when any request comes back 401, so the auth store can clear itself.
 *
 * A callback rather than importing the store directly: the store imports this module, and having
 * this module import the store back would be a cycle.
 */
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) {
      // Spring URL-encodes the token; the header must carry the decoded value.
      return decodeURIComponent(part.slice(prefix.length))
    }
  }
  return null
}

function retryAfterFrom(response: Response): number | null {
  const raw = response.headers.get('Retry-After')
  if (!raw) return null
  const seconds = Number.parseInt(raw, 10)
  return Number.isFinite(seconds) ? seconds : null
}

async function problemFrom(response: Response): Promise<ProblemDetail | null> {
  // An error body is not guaranteed to be JSON — a proxy or a container-level failure can return
  // HTML — so parsing must never be what throws.
  try {
    const text = await response.text()
    return text ? (JSON.parse(text) as ProblemDetail) : null
  } catch {
    return null
  }
}

interface RequestOptions {
  /** Query parameters. Undefined and null values are dropped rather than sent as "undefined". */
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const headers = new Headers()
  const isFormData = body instanceof FormData

  // Deliberately not set for FormData: the browser has to write its own multipart boundary, and
  // setting the header by hand omits it, which makes the server reject the upload.
  if (body !== undefined && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }

  if (UNSAFE.has(method)) {
    const token = readCookie(CSRF_COOKIE)
    if (token) headers.set(CSRF_HEADER, token)
    // No token means the cookie has not been issued yet. The app primes it with a GET during
    // startup (see the auth store's bootstrap), so in practice this only happens if that was
    // skipped. Sending the request anyway produces a 403 that says so, which beats failing here
    // with an error of our own invention.
  }

  const response = await fetch(url, {
    method,
    headers,
    // Without this the session cookie is neither sent nor stored, and everything is a 401.
    credentials: 'include',
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  })

  if (response.status === 401) {
    onUnauthorized?.()
  }

  if (!response.ok) {
    throw new ApiError(response.status, await problemFrom(response), retryAfterFrom(response))
  }

  // 204 and other empty bodies are normal here — every DELETE returns one.
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T
  }

  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),

  /**
   * Multipart upload. The API takes the file under the field name `file` on both image endpoints.
   * Only JPEG and PNG are accepted — notably not HEIC, which is what an iPhone produces by
   * default, so the file picker should say so before it gets this far.
   */
  upload: <T>(path: string, file: File, method: 'POST' | 'PUT' = 'POST') => {
    const form = new FormData()
    form.append('file', file)
    return request<T>(method, path, form)
  },
}
