# SERVER-04: Accounts and saved stacks — Better Auth on the Cloudflare adapter

**Status:** LANDED 2026-08-29 and retired from `server.md` and `editor.md`. Kept as the record of what was decided and why — the archive line is the summary, this is the reasoning. Every "parked" note in §7 has since been satisfied; the statuses inline say which.
**Decided:** 2026-08-28 — owner picked `better-auth` + `better-auth-cloudflare` from three options
(hand-rolled GitHub OAuth in Hono; Better Auth; a hosted vendor)
**Spans:** `apps/server` (owner of this row), `apps/editor` (EDITOR-57), `packages/matrix` (schema)

---

## 1. What this is for, stated narrowly

Today the editor holds **exactly one** saved configuration — `agents-inc:config:v1` in localStorage,
drawn as the single `Saved stack` cell in the stack grid — and it dies with the browser profile. The
feature is: **sign in, and keep as many named stacks as you like, on any machine.**

**Anonymous use must keep working unchanged, and that is a hard constraint rather than a nicety.**
Every part of this product works with no account today: the grid, the roster, the install command,
the share link, and the CLI's `GET /configs/:id`. Login is additive. A visitor who never signs in
must see exactly what they see now, and a share link must still resolve for someone with no account
— the CLI is not a browser and will never hold a session.

## 2. The design that makes this small

**A saved stack is a name pointing at a payload that already exists.**

`POST /configs` already mints an immutable, content-addressed id for a whole configuration, and
`GET /configs/:id` already serves it to both the editor and the CLI. So saving a stack does not need
a new payload format, a new size limit, or a second copy of `seedPayloadSchema`. It needs a row:

| Store        | Holds                                                                      | Changes                 |
| ------------ | -------------------------------------------------------------------------- | ----------------------- |
| KV `CONFIGS` | the immutable payloads, content-addressed, and the skill index             | **nothing** — untouched |
| D1 (new)     | Better Auth's tables, plus `saved_stacks(id, user_id, name, config_id, …)` | new binding             |

Two consequences worth stating because they are the reason to do it this way. A saved stack and a
share link become **the same bytes** — sharing a saved stack is handing over its `config_id`, with
no export step. And the payload size cap, the version gate and the corruption check all keep
working, because nothing about the payload path moves.

**D1 rather than KV for the list.** KV is eventually consistent and content-addressed, which is
right for immutable payloads and wrong for a mutable list a person renames and deletes — a rename
that reads back stale is a bug report nobody can reproduce.

## 3. The worker side

`better-auth` + `better-auth-cloudflare`, which exists precisely for this shape (Workers + D1 + KV)
and is `withCloudflare(cloudflareOptions, betterAuthOptions)` wrapping a normal `betterAuth()` call.
Drizzle over D1 is the adapter it expects; `usePlural: true` is its convention.

Providers: **GitHub only.** The audience is developers, and the app already talks to GitHub for
skills and marketplaces. No email/password — it would mean sending mail, which is infrastructure
this repository does not have and does not want for a "remember my stacks" feature.

New routes, all under one Hono mount: `app.on(["GET","POST"], "/api/auth/*", …)` handing off to
`auth.handler`, plus four of our own — `GET /stacks`, `POST /stacks`, `PATCH /stacks/:id`,
`DELETE /stacks/:id`. They are `@hono/zod-openapi` routes like everything else in `index.ts`, so
`AppType` still flows to the editor.

**Rate limiting arrives as a side effect, and only partly.** `withCloudflare` takes Better Auth's
`rateLimit` with KV as the store, so the auth routes get `window`/`max` and `customRules` for
`/sign-in/social` for free. **`POST /configs` was not covered by that and had no limit when this was
written.** It has one now — 20 writes a minute per address, added the same day, `apps/server/src/index.ts`
— so the gap this paragraph named is closed, by a separate change rather than by Better Auth.

## 4. Cookies — the part that is easy to get wrong

The editor is `https://agentsinc.sh`; the API is `https://api.agentsinc.sh`. Different **origins**,
same **registrable domain**.

- **There is no third-party-cookie problem.** Same registrable domain means the request is
  same-site, so `sameSite: "lax"` is enough and `SameSite=None` is not needed. This is the single
  biggest reason this is cheaper here than in a typical SPA-plus-API split.
- The session cookie must be set on the parent domain:
  `advanced.crossSubDomainCookies: { enabled: true, domain: ".agentsinc.sh" }`, with
  `trustedOrigins: ["https://agentsinc.sh"]`.
- **`allowOnlyWebOrigin` must gain `credentials: true`.** `hono/cors` does not send
  `Access-Control-Allow-Credentials` by default, and without it the browser will neither send nor
  store the cookie — the failure looks like "signed in, then immediately signed out" and points at
  nothing. The editor's fetches need `credentials: "include"` to match.
- Local dev is `localhost:5173` → `localhost:8787`: cookies ignore port, so one host means one
  cookie jar and this works — but `secure: true` will not set over plain http, so the flag has to
  follow the environment rather than be hard-coded.

## 5. The editor side (EDITOR-57)

- `createAuthClient` from `better-auth/react`, `baseURL` from `VITE_API_URL` — the address already
  lives in `.env.production` and `.env.test` and must not gain a third copy.
- A sign-in control, and session state in a store beside the existing ones.
- The stack grid's single `Saved stack` cell becomes the signed-in visitor's list. **`SAVED_STACK`
  in `e2e/pages/configure-page.ts` is named there specifically because it is not part of the
  generated catalogue** — that page object is where this change surfaces in the suite.
- **On first sign-in, adopt the local configuration as the first saved stack.** The machinery
  exists: `adoptSeedPayload` already seats a payload that arrived from elsewhere. Signing in must
  not silently discard what the visitor already built.
- The E2E fixtures abort any request to an origin nothing stubbed. Auth calls go to the worker
  origin, which is already in `THIRD_PARTY_ORIGINS`, so the stubs belong in a new
  `e2e/support/auth.ts` alongside `sharing.ts` and `marketplace.ts`.

## 6. Order of work, following the repository's process

1. **Tests first, watched failing.** Worker: `@cloudflare/vitest-pool-workers` already runs against
   real bindings, so the D1 binding is testable the same way KV is. Editor: E2E for signed-out
   (unchanged behaviour), sign-in, save, rename, delete, and the first-sign-in adoption.
2. Implement until green.
3. `meta-design-expressive-typescript`, that skill only.
4. Hand-run: sign in, save two stacks, reload, open the second on a different browser profile, and
   confirm a share link still resolves **while signed out** and through the CLI.
5. Docs through `codex-keeper`.
6. Trackers, in the same turn.

## 7. What only the owner can supply — this is why the row is parked

1. **Two GitHub OAuth Apps** — dev and production need different callback URLs. The client id is
   public (it travels in the authorization URL every sign-in) and belongs in `wrangler.jsonc` vars;
   the secret is a Worker secret.
   - **Production: supplied 2026-08-28.** Client id `Ov23liy1WGblcNBDJoXc`; the secret is stored as
     `GITHUB_CLIENT_SECRET` on `agents-inc-api --env production` and exists nowhere in this
     repository. The client id is NOT in `wrangler.jsonc` yet, deliberately — a var nothing reads is
     a claim about a capability that does not exist, and it lands with the code that uses it.
   - **Development: supplied 2026-08-28.** Client id `Ov23liHANitAG2b0NDXj`; the secret is in
     `apps/server/.dev.vars`, which `wrangler dev` reads and nothing else does. **That file needed a
     new `.gitignore` entry before it could be written**: the existing `.env*` rule is anchored to
     the start of the name and does not match `.dev.vars`, so the near-miss would have committed a
     secret. A `.dev.vars.example` is deliberately not added yet — it lands with the code that reads
     the file, and carries no real values.
   - **Unverified either way:** nothing here has seen the callback URL that was actually entered, and
     a wrong one fails only at the moment somebody tries to sign in, with an error that names the
     app rather than the field. Worth reading back off the app's settings page before implementing.
2. **`wrangler d1 create`** — **done 2026-08-28.** `agents-inc-db` in WEUR, id
   `7e0a4407-89d0-4d24-893f-2fe0b70fa890`, bound as `DATABASE` — the name
   `better-auth-cloudflare`'s own documentation uses, so its examples read against
   `wrangler.jsonc` without translation. Stated at the top level **and** under
   `env.production`, because named environments inherit nothing and an omission removes the
   binding at the edge rather than falling back. `wrangler types` regenerated, and the
   worker's own gates re-run green afterwards (typecheck, lint, 3 files / 56 tests) — which
   is the whole claim: a binding exists and nothing regressed. **Nothing has been written to
   it and it has no tables yet**; the schema arrives with `@better-auth/cli generate`.
3. **`BETTER_AUTH_SECRET`** — **done 2026-08-28.** Generated with `openssl rand -base64 32` and set
   twice, with **different values per environment on purpose**: the two sign different databases
   behind different cookie domains, so one shared value would only mean a leak in dev reached
   production. Production is a Worker secret; local is in `.dev.vars`. Neither was printed anywhere
   and the production one cannot be read back — which costs nothing, because regenerating it only
   invalidates existing sessions and there are none. Better Auth also reads `BETTER_AUTH_SECRETS`
   (plural) for rotation without invalidating data, if that ever matters.
4. A ruling on §8.

## 8. Open decisions, for the owner rather than for the implementer

- **One KV namespace or two.** `wrangler.jsonc` argues for one, and the argument is written down:
  quotas are per account, and the two existing key spaces cannot collide because a config id is 8
  base64url characters and the index key contains a colon. Better Auth's KV keys have to be checked
  against that claim before reusing the namespace rather than assumed to be safe — and if they are
  not obviously disjoint, the honest answer is a second namespace even though it buys no quota.
- **Does sign-in also store a GitHub access token? — SETTLED 2026-08-28: KEEP IT.** Owner ruling.
  **The question was posed wrongly the first time and the correction is the point**: this was
  offered as an opt-in feature, and it is not one — Better Auth's `accounts` table stores a social
  provider's access and refresh tokens by default, so the real choice was whether to write code
  that throws one away. Keeping it makes SERVER-01's ceiling disappear, because the add-skill
  dialog's 10 requests/minute limit exists only for want of a token that cannot ship in a bundle.
  **What it obliges.** Holding another service's user credentials is a different posture from
  holding a session, and two things follow rather than being optional: the token column is
  encrypted at rest by Better Auth's own secret and must never be logged, and no route may return
  it to a browser — the editor asks the worker to call GitHub, it never receives the token to call
  GitHub itself. **This unblocks SERVER-01's remaining half**, which should be re-read against this
  row rather than left as written.
- **Better Auth Infrastructure — in or out?** Surfaced 2026-08-28 when the owner hit its onboarding
  and pasted a `BETTER_AUTH_API_KEY`. It is a **separate hosted product** from the library this row
  chose: `@better-auth/infra` plugins (`dash` for analytics, event logging and an admin dashboard;
  `sentinel` for security checks) talking to `dash.better-auth.com` and `kv.better-auth.com`. Its own
  prerequisite is a working Better Auth installation, so **it cannot be adopted before this row
  lands** — there is nothing to connect yet, and the key is for afterwards.
  **The decision is not about cost, it is about what was bought by self-hosting.** A hosted vendor
  was rejected for this feature partly to keep a third party out of the login path, and `dash` puts
  one back in — every auth event leaves the edge, with the latency and the failure mode that
  implies. `sentinel` has a sharper version of the same problem: its own documented behaviour with
  no key is `Security checks may fall back to allow mode`, which is a control that **fails open**.
  Recommend: land the row without it, then decide against a working system.
- **Are saved stacks ever public?** Share links already cover "give this to someone". Recommend
  keeping the list private and letting sharing stay the separate thing it is.
