import { parseEnv } from "./env.schema"

// The app's only reader of `import.meta.env`. Everything else imports `env`,
// so a variable cannot be referenced anywhere without having been declared in
// the schema and checked at build time.
export const env = parseEnv(import.meta.env, import.meta.env.PROD)
