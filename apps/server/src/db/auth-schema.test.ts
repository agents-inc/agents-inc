import { getAuthTables } from "better-auth/db"
import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { accounts, sessions, users, verifications } from "./auth.schema"

// The generator lags the installed better-auth, so check this schema against
// what the library expects. A superset is fine; a missing field is not.
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
      // `id` is implicit in Better Auth's fields and explicit in ours.
      const missing = Object.keys(expected[model]?.fields ?? {}).filter(
        (field) => !ours.has(field)
      )

      expect(missing).toStrictEqual([])
    })
  }
})
