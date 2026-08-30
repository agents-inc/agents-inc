import { getAuthTables } from "better-auth/db"
import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { accounts, sessions, users, verifications } from "./auth.schema"

// THE GUARD THAT SHOULD HAVE EXISTED BEFORE THE FIRST SIGN-IN.
//
// `auth.schema.ts` began as `@better-auth/cli generate` output, and the
// generator is version-lagged: its latest is 1.4.21 against a library at 1.7.2,
// so it emitted an `accounts` table with no `issuer` column. Nothing caught it.
// The worker booted, 65 tests passed, and the first person to click Sign in got
// "the field issuer does not exist in the schema for the model accounts" from
// inside the library, at the callback — the one moment nothing else covers.
//
// So this asks the INSTALLED better-auth what it expects, through its own
// `getAuthTables`, and compares. A version that adds a field now fails here
// rather than at somebody's sign-in.
//
// It asserts a SUPERSET rather than equality: a column of ours that Better Auth
// does not know about is fine and will happen, and the failure worth catching
// is the other direction — a field it will read and we do not have.
const TABLES = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
}

describe("the drizzle schema against the better-auth this repository runs", () => {
  const expected = getAuthTables({})

  for (const [model, table] of Object.entries(TABLES)) {
    it(`${model} has every column the library expects`, () => {
      const ours = new Set(Object.keys(getTableColumns(table)))
      // `id` is implicit in Better Auth's model definitions and explicit in
      // ours, so it is never in `fields` and always in the table.
      const missing = Object.keys(expected[model]?.fields ?? {}).filter(
        (field) => !ours.has(field)
      )

      expect(missing).toStrictEqual([])
    })
  }
})
