import { MATRIX } from "@workspace/matrix"
import { afterEach, describe, expect, it } from "vitest"

import { seatCatalog, seatedCatalog } from "./catalog-seat"
import { buildCatalog } from "./__tests__/factories/catalog-factories"

describe("the seated catalogue", () => {
  afterEach(() => {
    seatCatalog(MATRIX)
  })

  it("is the built-in catalogue until the CLI seats its own", () => {
    expect(seatedCatalog()).toBe(MATRIX)
  })

  it("is the one seated last", () => {
    const merged = buildCatalog({}, [])

    seatCatalog(merged)

    expect(seatedCatalog()).toBe(merged)
  })
})
