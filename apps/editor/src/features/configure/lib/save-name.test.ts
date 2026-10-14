import { describe, expect, it } from "vitest"

import { validateSaveName } from "./save-name"

// The server's `nameSchema` cap (apps/server/src/stacks.ts), which also trims first.
const MAX = 80

const TAKEN = ["Start from scratch", "Next.js Full-Stack", "Weekday"]

describe("validateSaveName", () => {
  it.each([
    ["nothing", ""],
    ["only spaces", "   "],
  ])("refuses %s as empty", (_label, name) => {
    expect(validateSaveName(name, TAKEN)).toStrictEqual({
      ok: false,
      problem: "empty",
    })
  })

  it("refuses a name one past the cap", () => {
    expect(validateSaveName("a".repeat(MAX + 1), TAKEN)).toStrictEqual({
      ok: false,
      problem: "too-long",
    })
  })

  it("accepts a name at the cap", () => {
    expect(validateSaveName("a".repeat(MAX), TAKEN)).toStrictEqual({
      ok: true,
      name: "a".repeat(MAX),
    })
  })

  it("measures the name after trimming it", () => {
    expect(validateSaveName(` ${"a".repeat(MAX)} `, TAKEN)).toStrictEqual({
      ok: true,
      name: "a".repeat(MAX),
    })
  })

  it.each([
    ["a padded lower-case copy", " weekday "],
    ["an upper-case copy", "WEEKDAY"],
    ["a catalogue stack's name", "next.js full-stack"],
    ["the reset cell's name", "start from scratch"],
  ])("refuses %s as taken", (_label, name) => {
    expect(validateSaveName(name, TAKEN)).toStrictEqual({
      ok: false,
      problem: "taken",
    })
  })

  it("accepts a name that only starts like a taken one", () => {
    expect(validateSaveName("Weekday 2", TAKEN)).toStrictEqual({
      ok: true,
      name: "Weekday 2",
    })
  })

  it("hands back the trimmed name", () => {
    expect(validateSaveName("  client work ", TAKEN)).toStrictEqual({
      ok: true,
      name: "client work",
    })
  })
})
