import * as appSchema from "./app.schema"
import * as authSchema from "./auth.schema"

/**
 * Everything in D1, in the one object drizzle wants.
 *
 * Two files behind it rather than one: `auth.schema.ts` is generated and is
 * rewritten whole every time the auth config changes, and `app.schema.ts` is
 * ours. Merging them into a single generated file would delete `saved_stacks`
 * on the next generate, quietly, with the failure arriving as a missing table
 * at runtime.
 */
export const schema = { ...authSchema, ...appSchema } as const
