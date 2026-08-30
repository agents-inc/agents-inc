import { createAuth } from "../auth"

/**
 * A signed-in person, for the suite.
 *
 * WHY THIS EXISTS AT ALL: the OAuth round trip cannot be walked in this
 * runtime — nothing here can complete a redirect to github.com — so every
 * authenticated route was covered only by its 401. The rest of it was pinned
 * by `tsc`, which cannot tell a projection that drops the owner column from
 * one that stopped.
 *
 * WHAT IS REPRODUCED BY HAND is exactly one thing: the signature on the
 * session cookie. Everything else — the user row, the account row, the session
 * in KV and its shape — is written by better-auth's own internal adapter, so a
 * library release that changes where a session lives changes this fixture with
 * it rather than leaving it seeding a store nothing reads. The signature is
 * `better-call`'s: HMAC-SHA256 over the token, base64 with padding, appended
 * after a dot and URI-encoded as one cookie value. It is a transitive
 * dependency and not this workspace's to import, and getting it wrong cannot
 * pass quietly — the session resolves to nobody and every test using it 401s.
 *
 * It lives beside the schema because what it does is seed rows: a person, the
 * GitHub account row that carries their token, and their session.
 */
export type SeededSession = {
  /** Ready for a `cookie` header, holding the signed session token. */
  cookie: string
  userId: string
  email: string
  /**
   * On the account row and never on the wire. A session belonging to somebody
   * with no GitHub token proves nothing about a token not leaking.
   */
  githubAccessToken: string
}

const signatureOf = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  )

  return btoa(String.fromCharCode(...new Uint8Array(signed)))
}

/** One `cookie` header value, in the spelling `better-call` reads back. */
const signedCookie = async (name: string, value: string, secret: string) =>
  `${name}=${encodeURIComponent(`${value}.${await signatureOf(value, secret)}`)}`

/**
 * Writes a person and a session, and hands back the cookie a browser holding
 * that session would send.
 *
 * A fresh person per call, deliberately. The pool shares state across a file
 * since `isolatedStorage` went, so two tests sharing a seeded person would
 * share their stacks and their rate-limit allowance — and `COMPOSE_CALLS` is
 * keyed by user id, so an exhausted allowance would make the next test's
 * failure look like a bug in the route.
 */
export const seedSession = async (env: Env): Promise<SeededSession> => {
  const auth = await createAuth(env).$context
  const email = `${crypto.randomUUID()}@example.test`
  const githubAccessToken = `gho_${crypto.randomUUID()}`

  const user = await auth.internalAdapter.createUser(
    {
      id: crypto.randomUUID(),
      name: "Test Person",
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    // How this person arrived, which for the only provider this worker offers
    // is a GitHub OAuth round trip.
    { method: "oauth", oauth: { providerId: "github" } }
  )

  await auth.internalAdapter.createAccount({
    id: crypto.randomUUID(),
    accountId: user.id,
    providerId: "github",
    // What `createOAuthAccountIssuer` in @better-auth/core mints for a social
    // provider, spelled out because that package is better-auth's dependency
    // rather than this workspace's. Nothing here reads the value back — the
    // column is required by the type and the row exists to carry the token.
    issuer: "local:oauth:github",
    userId: user.id,
    accessToken: githubAccessToken,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const session = await auth.internalAdapter.createSession(user.id, false)

  return {
    cookie: await signedCookie(
      auth.authCookies.sessionToken.name,
      session.token,
      env.BETTER_AUTH_SECRET
    ),
    userId: user.id,
    email,
    githubAccessToken,
  }
}
