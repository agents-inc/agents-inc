import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { nodeConfig } from "@workspace/vitest-config/node"
import { mergeConfig } from "vitest/config"

// Tests run inside the Workers runtime. Since pool 0.20, KV state leaks between
// tests in a file (no `isolatedStorage`) and outbound calls are mocked with
// `msw/node` (no `fetchMock`). `environment: "node"` is the only value the
// pool accepts.
//
// Migrations are read here because the setup file runs without a filesystem;
// D1 executes one statement per call, hence the split. Resolved against this
// file so runs from the repository root (knip) find it.
const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations"
)

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name,
    queries: readFileSync(join(MIGRATIONS_DIR, name), "utf8")
      .split("--> statement-breakpoint")
      .map((query) => query.trim())
      .filter(Boolean),
  }))

// Worthless secrets that override `.dev.vars`, so no run can use a real key.
// `BETTER_AUTH_SECRET` signs seeded session cookies and needs 32+ characters.
const FAKE_SECRETS = {
  ANTHROPIC_API_KEY: "sk-ant-not-a-real-key",
  BETTER_AUTH_SECRET: "not-a-real-secret-not-a-real-secret-32",
  GITHUB_CLIENT_SECRET: "not-a-real-github-client-secret",
}

export default mergeConfig(nodeConfig, {
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations, ...FAKE_SECRETS },
      },
    }),
  ],
  test: { setupFiles: ["./vitest.setup.ts"] },
})
