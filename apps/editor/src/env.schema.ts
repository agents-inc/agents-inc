import { z } from "zod"

// Shared by the browser and vite.config.ts, so nothing here may touch
// `import.meta`.
export const envSchema = z.object({
  // Required in production, where `.env.production` supplies it.
  VITE_API_URL: z.url(),

  // Absent disables Sentry. Empty folds to absent because CI substitutes unset
  // secrets with "".
  VITE_SENTRY_DSN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional()
  ),

  // As above; absent means PostHog is never downloaded.
  VITE_POSTHOG_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  VITE_POSTHOG_HOST: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().default("https://us.i.posthog.com")
  ),
})

export type Env = z.infer<typeof envSchema>

const DEV_DEFAULTS = {
  VITE_API_URL: "http://localhost:8787",
} as const satisfies Partial<Env>

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
