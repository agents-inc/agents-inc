import { z } from "zod"

// Read from two places with different runtimes: the browser bundle (`env.ts`,
// via `import.meta.env`) and the build itself (`vite.config.ts`, via Vite's
// `loadEnv` in Node). Nothing here may touch `import.meta` — that is what lets
// the build validate before it emits, so a missing variable fails CI rather
// than reaching a visitor.
export const envSchema = z.object({
  // The config-sharing worker. Defaulted for local dev only: a production
  // build that omitted this would ship pointing at localhost, and every share
  // would fail with a message that reads like an outage rather than a typo.
  // In production the value comes from the committed `.env.production`, which
  // Vite ranks above any local `.env` — so this staying required is what turns
  // "somebody deleted that file" into a failed build instead of a bad deploy.
  VITE_API_URL: z.url(),

  // Optional on purpose, and optional in production too. Error reporting that
  // refuses to build is worse than error reporting that is switched off, so an
  // absent DSN disables Sentry rather than failing the deploy.
  //
  // Empty is folded into absent because that is what "not configured" actually
  // looks like in CI: GitHub substitutes an unset secret with an empty string,
  // so without this the build would fail on the very case the field is
  // optional for.
  VITE_SENTRY_DSN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional()
  ),

  // Optional for the same reasons, and folded the same way. Absent means
  // PostHog is never even downloaded — see `lib/analytics/posthog.ts`.
  VITE_POSTHOG_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  // Region-specific (`https://eu.i.posthog.com` or `https://us.i.posthog.com`)
  // and meaningless without a key, so it carries the US default rather than
  // being a second thing to remember.
  VITE_POSTHOG_HOST: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().default("https://us.i.posthog.com")
  ),
})

export type Env = z.infer<typeof envSchema>

// Partial, not Env: this covers only what dev needs supplied. Anything the
// schema already defaults for itself does not belong here twice.
const DEV_DEFAULTS = {
  VITE_API_URL: "http://localhost:8787",
} as const satisfies Partial<Env>

// `bun dev` needs no setup; a production build must state everything.
export const parseEnv = (
  source: Record<string, unknown>,
  isProduction: boolean
): Env => {
  const parsed = envSchema.safeParse(
    isProduction ? source : { ...DEV_DEFAULTS, ...source }
  )
  if (parsed.success) return parsed.data

  const named = parsed.error.issues
    .map((issue) => `${issue.path.join(".")} (${issue.message})`)
    .join(", ")

  throw new Error(
    `Invalid environment: ${named}. See apps/editor/.env.example for what each one is, ` +
      `and apps/editor/.env.production for the values a production build uses.`
  )
}
