// `cloudflare:test`'s `env` is `Cloudflare.Env`, which `wrangler types` declares.
declare namespace Cloudflare {
  interface Env {
    // Test-only: the D1 migrations vitest.config.ts reads off disk.
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[]
  }
}
