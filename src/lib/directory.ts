import { ApiError, api } from '@/lib/http'
import type { ProductResponse, UserResponse } from '@/types/api'

/**
 * Names for the ids a chat carries.
 *
 * `ChatResponse` is all ids — `productId`, `initiatorId`, `sellerId` — because nesting the whole
 * `UserEntity` would leak a password hash and nesting the listing would make an inbox page
 * enormous. Sound reasoning on the server, but it leaves an inbox row with nothing to render: a
 * person recognises "Marina Rousseau, about *Petrel*", not chat 41.
 *
 * So the client resolves them, and this is the seam that keeps that from becoming twenty
 * requests per row. Everything is memoised for the life of the page and keyed by id, so a seller
 * with four threads is fetched once, and the poller re-reading the inbox every 25 seconds costs
 * nothing at all.
 *
 * **If the API ever grows a `counterpartyName` and a `productName` on `ChatResponse`, delete this
 * file.** It exists to paper over a gap, not because a client-side directory is a good idea.
 *
 * What comes back from `/users/{id}` here is the **public view**: name, avatar and `isActive`,
 * with `email`, `phoneNumber` and `accountType` nulled unless the viewer happens to be the
 * subject or an admin. That is exactly what this file is for and no caller wants more — but it
 * means a `UserResponse` from here must never be read for contact details.
 */

const users = new Map<number, Promise<UserResponse | null>>()
const products = new Map<number, Promise<ProductResponse | null>>()

/**
 * A 404 is an answer, not a failure: a withdrawn listing is soft-deleted and genuinely gone from
 * every read path, and the inbox has a treatment for that. A 403 is one too — `GET /users/{id}`
 * is behind the session, so a signed-out reader is being told this is not theirs to see.
 *
 * Anything else — the API down, the proxy misconfigured — must not be cached. Caching a network
 * blip would leave every row that touched it permanently blank for the rest of the visit, so the
 * entry is dropped and the next caller gets a fresh attempt.
 */
async function lookup<T>(cache: Map<number, Promise<T | null>>, id: number, path: string) {
  const existing = cache.get(id)
  if (existing) return existing

  const pending = api.get<T>(path).catch((error: unknown) => {
    if (error instanceof ApiError && (error.isNotFound || error.isForbidden)) return null
    cache.delete(id)
    return null
  })

  cache.set(id, pending)
  return pending
}

export function lookupUser(id: number): Promise<UserResponse | null> {
  return lookup<UserResponse>(users, id, `/users/${id}`)
}

/** Null means withdrawn. The thread still opens — only the listing is gone. */
export function lookupProduct(id: number): Promise<ProductResponse | null> {
  return lookup<ProductResponse>(products, id, `/products/${id}`)
}

/**
 * Drop everything. Called on sign-out: the next visitor is a different person, and a name that
 * was readable under one session should not be handed to the next one from a cache.
 */
export function clearDirectory() {
  users.clear()
  products.clear()
}
