import { describe, expect, it } from "vitest"

import { CONFIGURE_SEARCH_DEFAULTS, configureSearchSchema } from "./search"

// The longest query or id the address keeps.
const CAP = 64

describe("configureSearchSchema", () => {
  it("reads an address with no search as the defaults", () => {
    expect(configureSearchSchema.parse({})).toStrictEqual(
      CONFIGURE_SEARCH_DEFAULTS
    )
  })

  it("keeps a query and a shared id, trimmed", () => {
    expect(
      configureSearchSchema.parse({ q: "  react  ", fromId: "  abc123  " })
    ).toMatchObject({ q: "react", fromId: "abc123" })
  })

  it("keeps a query and an id exactly at the cap", () => {
    const atCap = "x".repeat(CAP)

    expect(
      configureSearchSchema.parse({ q: atCap, fromId: atCap })
    ).toMatchObject({ q: atCap, fromId: atCap })
  })

  // Every field catches to its default rather than failing the route.
  it("drops a query and an id past the cap, and a selection flag that is not one", () => {
    const pastCap = "x".repeat(CAP + 1)

    expect(
      configureSearchSchema.parse({ q: pastCap, fromId: pastCap, sel: "yes" })
    ).toStrictEqual(CONFIGURE_SEARCH_DEFAULTS)
  })
})

describe("CONFIGURE_SEARCH_DEFAULTS", () => {
  it("is no domain, no query, no selection and no shared id", () => {
    expect(CONFIGURE_SEARCH_DEFAULTS).toStrictEqual({
      domain: null,
      q: "",
      sel: false,
      fromId: "",
    })
  })
})
