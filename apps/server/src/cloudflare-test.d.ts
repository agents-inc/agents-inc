// Gives `import { env } from "cloudflare:test"` the bindings from
// wrangler.jsonc, via the Env that `wrangler types` generates.
declare module "cloudflare:test" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging, not a supertype alias
  interface ProvidedEnv extends Env {}
}
