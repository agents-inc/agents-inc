// A stack definition read into the shape a config's `stack` holds, against the shared load table.

import { describe, expect, it } from "vitest"

import { buildStackProperty } from "./seed-to-config"
import { buildStack } from "./__tests__/factories/seed-factories"

const REACT = "web-framework-react"
const VITEST = "web-testing-vitest"

describe("buildStackProperty", () => {
  it("keeps an author's flag either way and gives an unflagged entry the shared mapping's load", () => {
    expect(
      buildStackProperty(
        buildStack({
          "web-developer": {
            "web-framework": [{ id: REACT }],
            "web-testing": [{ id: VITEST }],
          },
          "web-tester": {
            "web-framework": [{ id: REACT, preloaded: false }],
            "web-testing": [{ id: VITEST, preloaded: true }],
          },
        })
      )
    ).toStrictEqual({
      "web-developer": {
        "web-framework": [{ id: REACT, preloaded: true }],
        "web-testing": [{ id: VITEST }],
      },
      "web-tester": {
        "web-framework": [{ id: REACT, preloaded: false }],
        "web-testing": [{ id: VITEST, preloaded: true }],
      },
    })
  })

  it("drops empty categories, and sub-agents left with none", () => {
    expect(
      buildStackProperty(
        buildStack({
          "web-developer": {
            "web-framework": [{ id: REACT }],
            "web-testing": [],
          },
          "web-tester": { "web-testing": [] },
          "api-developer": {},
        })
      )
    ).toStrictEqual({
      "web-developer": { "web-framework": [{ id: REACT, preloaded: true }] },
    })
  })
})
