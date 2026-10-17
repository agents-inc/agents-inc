import { parseEnv } from "./env.schema"

// The app's only reader of `import.meta.env`.
export const env = parseEnv(import.meta.env, import.meta.env.PROD)
