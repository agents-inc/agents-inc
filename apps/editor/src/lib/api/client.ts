import { apiRequestInit, createApiClient } from "@workspace/api"

import { env } from "@/env"

// How the editor reaches the worker (apps/server). Dev talks to `wrangler dev`
// on its default port; a deployment points VITE_API_URL at the real thing.
// There is no fallback on purpose — see `env.schema.ts`.
//
// It is one module because it was two conventions: the config calls went
// through `hc<AppType>` while the auth, stack and compose calls went through a
// hand-written `fetch`, and the reason the newer three did was that the client
// had not been told to carry the session. That is a reason to configure it
// once.
const API_URL = env.VITE_API_URL

/**
 * The worker's own route types, read straight off the app it exports, so no
 * call here can drift from what it serves: a renamed path or a changed body
 * shape fails a typecheck rather than a share link.
 *
 * `@workspace/api` owns how the client is built and what every request
 * carries; this file owns only the two answers that are the editor's — where
 * the worker is, and that the browser's session cookie rides along. The cookie
 * is the package's default rather than a flag named here, and that direction is
 * deliberate: the session is set on `.agentsinc.sh` by a different origin, so a
 * request that omits it is not refused — it is answered anonymously, which
 * looks like being signed out for no reason with nothing logged on either side.
 * A policy that must be opted into is one a new call site can forget in
 * silence. `client.test.ts` holds the whole set to it.
 */
export const api = createApiClient({ baseUrl: API_URL })

/**
 * A caller's half of a request to Better Auth: everything a `RequestInit`
 * carries except the two fields the shared policy owns.
 *
 * `credentials` is absent because dropping the cookie is the failure this
 * whole arrangement exists to prevent, and `headers` is narrowed to a plain
 * record so the two sets can be merged by name — a `Headers` object or an
 * entry array would have to be normalised first, and no caller here sends one.
 */
type AuthRequest = Omit<RequestInit, "credentials" | "headers"> & {
  headers?: Record<string, string>
}

/**
 * Better Auth's surface, which `AppType` deliberately does not describe.
 *
 * The worker mounts a dozen paths under `/api/auth/*` with one handler
 * (`app.on`, not the OpenAPI chain) because describing somebody else's
 * contract in `createRoute` would be a transcription that rots. So there is
 * nothing for `hc` to type, and this is the seam that keeps those calls on the
 * same base URL and the same session policy as the typed ones rather than on a
 * second copy of both.
 *
 * The caller's headers go INTO the policy rather than under it. `apiRequestInit`
 * returns a `headers` of its own, so spreading its result over a caller that
 * named some replaces theirs wholesale — and the caller that loses most by that
 * is `signIn`, whose JSON body then arrives as `text/plain` and is refused by
 * the worker rather than failing here. Merging first and spreading last is what
 * lets a caller add a method, a body or a header and still not drop the cookie.
 */
export const authFetch = (
  path: string,
  { headers, ...init }: AuthRequest = {}
) =>
  fetch(`${API_URL}/api/auth/${path}`, {
    ...init,
    ...apiRequestInit(headers ? { headers } : {}),
  })
