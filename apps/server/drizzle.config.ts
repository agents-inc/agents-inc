import { defineConfig } from "drizzle-kit"

// Emits SQL only — it never connects to anything.
//
// D1 is reached through a Worker binding rather than a connection string, so
// there is no URL to give drizzle-kit and no `push` that could work. The
// pipeline is: edit the schema, `drizzle-kit generate` writes a numbered .sql
// file here, and `wrangler d1 migrations apply` runs it — locally against the
// simulated database, and with `--remote` against the real one.
//
// `./migrations` is wrangler's own default `migrations_dir`, so the two tools
// agree without either being configured to.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/*.schema.ts",
  out: "./migrations",
})
