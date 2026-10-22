import { initGetModelName } from "better-auth/adapters"
import { getAuthTables } from "better-auth/db"
import { getAdapter } from "better-auth/db/adapter"
import { getTableColumns, getTableName } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { auth } from "../auth"
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

// `better-auth generate` loads the env-less instance and names each table from
// its adapter's settings; those names must be the ones this schema declares.
describe("the instance `better-auth generate` loads", () => {
  it("hands it the drizzle adapter for sqlite", async () => {
    const adapter = await getAdapter(auth.options)

    expect([adapter.id, adapter.options?.provider]).toStrictEqual([
      "drizzle",
      "sqlite",
    ])
  })

  it("names each table as this schema does", async () => {
    const adapter = await getAdapter(auth.options)
    const modelName = initGetModelName({
      schema: getAuthTables(auth.options),
      usePlural: adapter.options?.adapterConfig.usePlural,
    })

    expect(
      Object.fromEntries(
        Object.keys(TABLES).map((model) => [model, modelName(model)])
      )
    ).toStrictEqual(
      Object.fromEntries(
        Object.entries(TABLES).map(([model, table]) => [
          model,
          getTableName(table),
        ])
      )
    )
  })
})
