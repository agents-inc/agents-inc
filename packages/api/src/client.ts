import { hc } from "hono/client"

import type { AppType } from "server"

/**
 * The typed client both front doors reach the worker through.
 *
 * The editor and the CLI shared nothing before this package existed: the
 * editor configured `hc<AppType>` and the CLI hand-wrote a `fetch` at a URL it
 * built itself, so the two agreed about the worker's routes only by
 * coincidence. What they genuinely differ in is small and finite — where the
 * worker is, whether a session cookie rides along, and what identifies the
 * caller — so those are the parameters and everything else is shared.
 *
 * What this package deliberately does NOT own is either consumer's refusal
 * copy. The editor turns a failure into a union member a component renders;
 * the CLI turns one into a sentence a person reads in a terminal. Those are
 * different artefacts for different readers, and a shared "message" would be
 * wrong for both.
 *
 * `AppType` is a type and nothing else. `import type` erases before any
 * bundler sees it, so no worker code is reachable from the editor's bundle
 * (which fails its build on a first-paint budget) or from the CLI's.
 */

/**
 * Whether the browser's session cookie rides along.
 *
 * Only the two values either consumer has a use for, rather than the full
 * `RequestCredentials`: `same-origin` is exactly the setting that breaks the
 * editor, because the cookie is set on `.agentsinc.sh` by a different origin
 * than the one the app is served from, and naming it here would make it
 * reachable by a typo.
 */
export type ApiCredentials = "include" | "omit"

/**
 * What every request carries, however it is sent.
 *
 * `credentials` defaults to `"include"` and that direction is the point. The
 * session cookie is set by a different origin on the same registrable domain,
 * and without it sign-in appears to work and the very next request is
 * anonymous — with nothing logged on either side. A policy that has to be
 * opted INTO is one a new call site can forget silently; this one has to be
 * opted out of by name, which is a thing a reader can see.
 */
export type ApiRequestPolicy = {
  headers?: Record<string, string>
  credentials?: ApiCredentials
}

export type ApiClientOptions = ApiRequestPolicy & {
  /** Where the worker is. No default: a wrong guess is a silent wrong API. */
  baseUrl: string
  /**
   * The seam tests reach through. hc calls
   * `(opt?.fetch || fetch)(url, { body, method, headers, ...opt?.init })`, so
   * injecting one is the only way to observe what this package produces without
   * a network — and the exact shape matters, because `init` is spread LAST.
   * That is why `headers` goes through hc's own option rather than through
   * `init`: in `init` it would replace the whole `Headers` object, including
   * the content type hc sets for a JSON body.
   */
  fetch?: typeof globalThis.fetch
}

type ResolvedPolicy = {
  headers: Record<string, string>
  credentials: ApiCredentials
}

/**
 * The one place the defaults are applied, so the typed client and any
 * hand-written fetch cannot drift about what a request carries.
 */
const resolvePolicy = ({
  headers = {},
  credentials = "include",
}: ApiRequestPolicy): ResolvedPolicy => ({ headers, credentials })

/**
 * The policy as a `RequestInit`, for the paths `AppType` does not describe.
 *
 * Better Auth mounts its own surface under `/api/auth/*` with a single
 * handler rather than a described route, so there is nothing there for `hc` to
 * type — and a hand-written fetch at those paths is how the editor signs a
 * person in. This is what keeps that call on the same session policy as the
 * typed ones instead of on a second copy of it.
 *
 * Spread it LAST over a caller's own init: a caller may add a method, a body
 * or headers of its own, and may not drop the cookie.
 */
export const apiRequestInit = (policy: ApiRequestPolicy): RequestInit =>
  resolvePolicy(policy)

/**
 * Builds the client for one consumer's base URL, headers and session policy.
 *
 * The two configured values go to different places in hc's options, and which
 * goes where is load-bearing. hc spreads `init` LAST over the request it
 * built, so anything named there replaces what hc put in that field — a
 * `headers` in `init` would replace the whole `Headers` object, including the
 * `Content-Type: application/json` hc sets for a `$post({ json })`. Headers go
 * through hc's own `headers` option, which is merged into that object instead,
 * and `init` names `credentials` and nothing else.
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
    // Spread rather than named. Under `exactOptionalPropertyTypes` hc's
    // optional `fetch` does not accept an explicit `undefined`, so writing
    // `fetch,` here is a TS2379 whenever a caller omits one.
    ...(fetch && { fetch }),
  })
}

/** The configured client, for consumers that pass one around. */
export type ApiClient = ReturnType<typeof createApiClient>
