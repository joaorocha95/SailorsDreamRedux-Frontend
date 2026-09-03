import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api, setUnauthorizedHandler } from '../http'

/**
 * The HTTP client is the one piece every other feature runs through, and most of what it does is
 * invisible when it works: a header that gets attached, a cookie that gets read, an error body
 * that gets parsed. Those are exactly the things that break silently, so they are what this
 * suite pins down.
 */

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function lastCall(): unknown[] {
  const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
  return calls[calls.length - 1] as unknown[]
}

/** The last call's RequestInit, for asserting on headers and credentials. */
function lastInit(): RequestInit {
  return lastCall()[1] as RequestInit
}

function lastUrl(): URL {
  return lastCall()[0] as URL
}

function headerFrom(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  // jsdom keeps cookies between tests; clear the one under test.
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  setUnauthorizedHandler(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('credentials', () => {
  it('sends cookies on every request', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await api.get('/products')

    // Without this the session cookie is neither sent nor stored, and everything 401s.
    expect(lastInit().credentials).toBe('include')
  })
})

describe('CSRF', () => {
  it('attaches the token from the cookie on unsafe methods', async () => {
    document.cookie = 'XSRF-TOKEN=abc123'
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await api.post('/chats', { productId: 1 })

    expect(headerFrom(lastInit(), 'X-XSRF-TOKEN')).toBe('abc123')
  })

  it('url-decodes the cookie value', async () => {
    // Spring URL-encodes the cookie; the header has to carry the decoded token or the
    // double-submit comparison fails on any token containing a reserved character.
    document.cookie = `XSRF-TOKEN=${encodeURIComponent('a+b/c=')}`
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await api.post('/chats', {})

    expect(headerFrom(lastInit(), 'X-XSRF-TOKEN')).toBe('a+b/c=')
  })

  it('does not attach the token on safe methods', async () => {
    document.cookie = 'XSRF-TOKEN=abc123'
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await api.get('/products')

    expect(headerFrom(lastInit(), 'X-XSRF-TOKEN')).toBeNull()
  })

  it('still sends the request when no token cookie exists', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await api.post('/chats', {})

    // Better a 403 from the server that explains itself than an error we invented here.
    expect(fetch).toHaveBeenCalled()
    expect(headerFrom(lastInit(), 'X-XSRF-TOKEN')).toBeNull()
  })
})

describe('bodies', () => {
  it('serialises JSON and sets the content type', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await api.post('/chats', { productId: 7 })

    const init = lastInit()
    expect(headerFrom(init, 'Content-Type')).toBe('application/json')
    expect(init.body).toBe('{"productId":7}')
  })

  it('leaves the content type unset for multipart uploads', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 1 }))

    await api.upload('/products/1/images', new File(['x'], 'boat.jpg', { type: 'image/jpeg' }))

    // The browser must write its own multipart boundary. Setting the header by hand omits it and
    // the server rejects the upload.
    expect(headerFrom(lastInit(), 'Content-Type')).toBeNull()
    expect(lastInit().body).toBeInstanceOf(FormData)
  })
})

describe('query parameters', () => {
  it('drops undefined, null and empty values', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ content: [] }))

    await api.get('/products', {
      query: { page: 0, name: undefined, categoryId: null, listingType: '' },
    })

    const url = lastUrl()
    expect(url.searchParams.get('page')).toBe('0')
    // Sending "undefined" as a filter value would be a 400 from the server, or worse, a match.
    expect(url.searchParams.has('name')).toBe(false)
    expect(url.searchParams.has('categoryId')).toBe(false)
    expect(url.searchParams.has('listingType')).toBe(false)
  })
})

describe('errors', () => {
  it('turns a ProblemDetail into an ApiError carrying its detail', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { status: 409, title: 'Conflict', detail: 'Product 4 already has the maximum of 8 images' },
        { status: 409 },
      ),
    )

    const error = await api.post('/products/4/images').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(409)
    expect(apiError.isConflict).toBe(true)
    // `detail` is written to be shown to a person, so it becomes the message verbatim.
    expect(apiError.message).toBe('Product 4 already has the maximum of 8 images')
  })

  it('survives an error body that is not JSON', async () => {
    // A proxy or container-level failure returns HTML. Parsing must not be what throws.
    vi.mocked(fetch).mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    )

    const error = (await api.get('/products').catch((e: unknown) => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.problem).toBeNull()
    expect(error.message).toContain('502')
  })

  it('reads Retry-After off a 429', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { status: 429, detail: 'Rate limit exceeded for startChat' },
        { status: 429, headers: { 'Retry-After': '137' } },
      ),
    )

    const error = (await api.post('/chats', {}).catch((e: unknown) => e)) as ApiError

    expect(error.isRateLimited).toBe(true)
    // A 429 without this leaves polling as the client's only strategy.
    expect(error.retryAfterSeconds).toBe(137)
  })

  it('leaves retryAfterSeconds null when the header is absent', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 400 }, { status: 400 }))

    const error = (await api.get('/products').catch((e: unknown) => e)) as ApiError

    expect(error.retryAfterSeconds).toBeNull()
  })

  it('notifies the unauthorized handler exactly once per 401', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 401 }, { status: 401 }))

    await api.get('/auth/me').catch(() => {})

    // A dead session should log the app out centrally, not in forty catch blocks.
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not notify the handler for other failures', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 403 }, { status: 403 }))

    await api.get('/reports').catch(() => {})

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('empty responses', () => {
  it('returns undefined for a 204', async () => {
    // Every DELETE in this API answers 204; JSON.parse('') would throw.
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }))

    await expect(api.delete('/wishlist/1')).resolves.toBeUndefined()
  })
})
