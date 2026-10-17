import { hc } from "hono/client"

import type { AppType } from "server"

// `import type` keeps worker code out of both consumers' bundles.

/** No `same-origin`: the session cookie is set by a different origin. */
export type ApiCredentials = "include" | "omit"

/** `credentials` defaults to `"include"`; without the cookie requests are silently anonymous. */
export type ApiRequestPolicy = {
  headers?: Record<string, string>
  credentials?: ApiCredentials
}

export type ApiClientOptions = ApiRequestPolicy & {
  /** No default: a wrong guess is a silent wrong API. */
  baseUrl: string
  /** Test seam; hc calls `(opt?.fetch || fetch)(url, ...)`. */
  fetch?: typeof globalThis.fetch
}

type ResolvedPolicy = {
  headers: Record<string, string>
  credentials: ApiCredentials
}

const resolvePolicy = ({
  headers = {},
  credentials = "include",
}: ApiRequestPolicy): ResolvedPolicy => ({ headers, credentials })

/**
 * The policy as a `RequestInit`, for paths `AppType` does not describe (Better Auth's routes).
 * Spread it last over a caller's init so the cookie cannot be dropped.
 */
export const apiRequestInit = (policy: ApiRequestPolicy): RequestInit =>
  resolvePolicy(policy)

/**
 * hc spreads `init` last, so `headers` there would replace hc's JSON content type; headers go
 * through hc's merged `headers` option and `init` carries only `credentials`.
 */
export const createApiClient = ({
  baseUrl,
  fetch,
  ...policy
}: ApiClientOptions) => {
  const { headers, credentials } = resolvePolicy(policy)

  return hc<AppType>(baseUrl, {
    headers,
    init: { credentials },
    // `exactOptionalPropertyTypes` rejects an explicit undefined `fetch`.
    ...(fetch && { fetch }),
  })
}

export type ApiClient = ReturnType<typeof createApiClient>

const WHOLE_SECONDS = /^[1-9]\d*$/

/** Seconds from a 429's `retry-after`, or `null`; HTTP-date form is not read. */
export const retryAfterSeconds = ({ headers }: { headers: Headers }) => {
  const stated = headers.get("retry-after")

  return stated !== null && WHOLE_SECONDS.test(stated) ? Number(stated) : null
}
