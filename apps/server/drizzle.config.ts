import { defineConfig } from "drizzle-kit"

// Emits SQL only; `wrangler d1 migrations apply` runs it. D1 has no URL to
// connect to.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/*.schema.ts",
  out: "./migrations",
})
