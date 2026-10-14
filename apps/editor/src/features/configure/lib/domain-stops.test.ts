import { describe, expect, it } from "vitest"

import {
  currentIndex,
  domainStops,
  indicatorBox,
  progressAt,
} from "./domain-stops"

const MAX = 1000
const STOPS = [0, 500, 750, 1000]
const TABS = [
  { left: 0, width: 100 },
  { left: 100, width: 80 },
  { left: 180, width: 120 },
  { left: 300, width: 60 },
]

describe("domainStops", () => {
  it("spreads trailing stops past max between the last reachable stop and max", () => {
    expect(domainStops([0, 500, 1200, 1300], MAX)).toStrictEqual(STOPS)
  })

  it("treats a stop sitting on max as collapsed", () => {
    expect(domainStops([0, 1000, 1000], MAX)).toStrictEqual([0, 500, 1000])
  })

  it("spreads from zero when no stop is reachable", () => {
    expect(domainStops([1200, 1300], MAX)).toStrictEqual([500, 1000])
  })

  it("clamps a stop above the top of the page to zero", () => {
    expect(domainStops([-40, 500], MAX)).toStrictEqual([0, 500])
  })

  it("leaves reachable stops alone", () => {
    expect(domainStops([0, 300, 600], MAX)).toStrictEqual([0, 300, 600])
  })

  it("answers nothing for no domains", () => {
    expect(domainStops([], MAX)).toStrictEqual([])
  })
})

describe("progressAt", () => {
  it("is halfway between two stops at their midpoint", () => {
    expect(progressAt(STOPS, 250)).toStrictEqual({ index: 0, t: 0.5 })
  })

  it("is at the first domain above its stop", () => {
    expect(progressAt([100, 500], 40)).toStrictEqual({ index: 0, t: 0 })
  })

  it("is at a domain exactly on its stop", () => {
    expect(progressAt(STOPS, 500)).toStrictEqual({ index: 1, t: 0 })
  })

  it("moves through spread stops like any other", () => {
    expect(progressAt(STOPS, 875)).toStrictEqual({ index: 2, t: 0.5 })
  })

  it("is at the last domain at max", () => {
    expect(progressAt(STOPS, MAX)).toStrictEqual({ index: 3, t: 0 })
  })
})

describe("currentIndex", () => {
  it("stays on a domain at exactly halfway", () => {
    expect(currentIndex(progressAt(STOPS, 250))).toBe(0)
  })

  it("moves on past halfway", () => {
    expect(currentIndex(progressAt(STOPS, 300))).toBe(1)
  })

  it("is the last domain at max", () => {
    expect(currentIndex(progressAt(STOPS, MAX))).toBe(3)
  })
})

describe("indicatorBox", () => {
  it("interpolates left and width between two tabs", () => {
    expect(indicatorBox(TABS, { index: 0, t: 0.5 })).toStrictEqual({
      left: 50,
      width: 90,
    })
  })

  it("sits exactly under a tab on its stop", () => {
    expect(indicatorBox(TABS, { index: 2, t: 0 })).toStrictEqual(TABS[2])
  })

  it("puts it under the last tab at max", () => {
    expect(indicatorBox(TABS, progressAt(STOPS, MAX))).toStrictEqual(TABS[3])
  })
})
