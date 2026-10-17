import { apiRequestInit, createApiClient } from "@workspace/api"

import { env } from "@/env"

const API_URL = env.VITE_API_URL

/**
 * The worker's route types, read off the app it exports. The cookie rides along
 * by default: a request without it is answered anonymously, which looks like a
 * silent sign-out.
 */
export const api = createApiClient({ baseUrl: API_URL })

/**
 * `credentials` is not the caller's to set; `headers` is a plain record so it
 * merges by name.
 */
type AuthRequest = Omit<RequestInit, "credentials" | "headers"> & {
  headers?: Record<string, string>
}

/**
 * Better Auth's routes, which `AppType` does not describe, on the same base URL
 * and session policy. Caller headers are merged into the policy's, or spreading
 * would drop them.
 */
export const authFetch = (
  path: string,
  { headers, ...init }: AuthRequest = {}
) =>
  fetch(`${API_URL}/api/auth/${path}`, {
    ...init,
    ...apiRequestInit(headers ? { headers } : {}),
  })
