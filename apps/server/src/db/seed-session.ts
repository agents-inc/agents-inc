import { createAuth } from "../auth"

// A signed-in person for the suite (OAuth cannot run here). better-auth's own
// adapter writes the rows; only `better-call`'s cookie signature is reproduced:
// HMAC-SHA256, base64, appended after a dot, URI-encoded.
export type SeededSession = {
  /** Ready for a `cookie` header, holding the signed session token. */
  cookie: string
  userId: string
  email: string
  // A token that must never reach the wire.
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

type AuthContext = Awaited<ReturnType<typeof createAuth>["$context"]>

const sessionCookie = async (auth: AuthContext, env: Env, userId: string) => {
  const session = await auth.internalAdapter.createSession(userId, false)

  return signedCookie(
    auth.authCookies.sessionToken.name,
    session.token,
    env.BETTER_AUTH_SECRET
  )
}

/** Another session for someone `seedSession` made, as a second sign-in. */
export const signInAgain = async (env: Env, userId: string) =>
  sessionCookie(await createAuth(env).$context, env, userId)

// A fresh person per call: rate limits are keyed by user id and the pool
// shares state across a file.
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
    { method: "oauth", oauth: { providerId: "github" } }
  )

  await auth.internalAdapter.createAccount({
    id: crypto.randomUUID(),
    accountId: user.id,
    providerId: "github",
    // What @better-auth/core mints for a social provider.
    issuer: "local:oauth:github",
    userId: user.id,
    accessToken: githubAccessToken,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  return {
    cookie: await sessionCookie(auth, env, user.id),
    userId: user.id,
    email,
    githubAccessToken,
  }
}
