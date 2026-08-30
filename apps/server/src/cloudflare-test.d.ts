// `import { env } from "cloudflare:test"` is typed `Cloudflare.Env`, which
// `wrangler types` declares — so bindings from wrangler.jsonc arrive on their
// own and nothing here has to restate them.
//
// This file used to declare `interface ProvidedEnv extends Env {}` for that
// purpose. IT HAD STOPPED DOING ANYTHING: @cloudflare/vitest-pool-workers 0.20
// types the export as `Cloudflare.Env` and refers to `ProvidedEnv` nowhere, so
// the augmentation named an interface the package no longer reads. It was
// invisible because it was harmless — the bindings resolved regardless, via
// the generated type — and it only surfaced when something genuinely needed
// adding here and did not appear.
declare namespace Cloudflare {
  interface Env {
    // Not a worker binding, and deliberately not in wrangler.jsonc: the D1
    // schema, read off disk by vitest.config.ts and handed to the runtime so
    // vitest.setup.ts can apply it to a database that starts empty. It exists
    // only under test, which is why it is declared here rather than generated.
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[]
  }
}
