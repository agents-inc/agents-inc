import * as appSchema from "./app.schema"
import * as authSchema from "./auth.schema"

// App tables stay out of `auth.schema.ts` so regenerating it cannot delete them.
export const schema = { ...authSchema, ...appSchema } as const
