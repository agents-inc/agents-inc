import { env } from "cloudflare:test"
import { describe, expect, it } from "vitest"

import { app } from "./index"

// The first leg of a GitHub sign-in: Better Auth builds the authorize URL and
// sets a state cookie, and GitHub is not called. Through `app.request` so a
// case can hand the worker production's bindings.

const BASE = "https://api.test"
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"

const SIGN_IN_LIMIT = 5

// What `wrangler.jsonc` sets for production.
const PRODUCTION: Env = {
  ...env,
  WEB_ORIGIN: "https://agentsinc.sh",
  AUTH_BASE_URL: "https://api.agentsinc.sh",
}

/**
 * Better Auth limits sign-ins per `x-forwarded-for`, in D1, which outlives a
 * test. A random documentation-range address per case, so nothing spent it.
 */
const freshAddress = () => {
  const subnet = Array.from(
    crypto.getRandomValues(new Uint16Array(2)),
    (part) => part.toString(16)
  ).join(":")
  return `2001:db8:${subnet}::1`
}

type SignIn = { from: string; returnTo: string; address: string }

const signIn = ({ from, returnTo, address }: SignIn, bindings: Env = env) =>
  app.request(
    `${BASE}/api/auth/sign-in/social`,
    {
      method: "POST",
      headers: {
        origin: from,
        "content-type": "application/json",
        "x-forwarded-for": address,
      },
      body: JSON.stringify({ provider: "github", callbackURL: returnTo }),
    },
    bindings
  )

const fromTheEditor = (bindings: Env = env): SignIn => ({
  from: bindings.WEB_ORIGIN,
  returnTo: `${bindings.WEB_ORIGIN}/configure`,
  address: freshAddress(),
})

const cookiesOf = (response: Response) => {
  const cookies = response.headers.get("set-cookie")
  if (cookies === null) throw new Error("the sign-in set no cookie")
  return cookies
}

describe("signing in with GitHub", () => {
  it("sends the editor to GitHub with this worker's app and callback", async () => {
    const response = await signIn(fromTheEditor())

    expect(response.status).toBe(200)
    const { url } = await response.json<{ url: string }>()
    const authorize = new URL(url)
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      GITHUB_AUTHORIZE_URL
    )
    expect(authorize.searchParams.get("client_id")).toBe(env.GITHUB_CLIENT_ID)
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `${env.AUTH_BASE_URL}/api/auth/callback/github`
    )
  })

  // The refusal beside the case above: only the editor may be returned to.
  it("refuses to send a person back anywhere but the editor", async () => {
    const response = await signIn({
      ...fromTheEditor(),
      returnTo: "https://evil.example/configure",
    })

    expect(response.status).toBe(403)
  })

  it(`lets ${String(SIGN_IN_LIMIT)} sign-ins a minute through from one address, then refuses`, async () => {
    const attempt = fromTheEditor()
    const statuses: number[] = []

    for (let count = 0; count <= SIGN_IN_LIMIT; count++) {
      statuses.push((await signIn(attempt)).status)
    }

    expect(statuses).toStrictEqual([200, 200, 200, 200, 200, 429])
  })
})

// Asserted on the state cookie; Better Auth gives every cookie it sets these
// same attributes.
describe("the cookies it sets", () => {
  // A `Secure` cookie is dropped over plain http, and localhost has no parent
  // domain to share with.
  it("keeps them to this host, and off https, while the editor runs on plain http", async () => {
    const cookies = cookiesOf(await signIn(fromTheEditor()))

    expect(cookies).toContain("SameSite=Lax")
    expect(cookies).not.toContain("Domain=")
    expect(cookies).not.toContain("Secure")
  })

  // The editor and the worker share the registrable domain.
  it("shares them with the editor's domain, over https only, in production", async () => {
    const cookies = cookiesOf(
      await signIn(fromTheEditor(PRODUCTION), PRODUCTION)
    )

    expect(cookies).toContain("Domain=.agentsinc.sh")
    expect(cookies).toContain("; Secure")
    expect(cookies).toContain("SameSite=Lax")
  })
})
