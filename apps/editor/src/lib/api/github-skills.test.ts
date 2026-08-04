import { describe, expect, it } from "vitest"

import { abbreviateLanguage, formatStars } from "./github-skills"

// Both of these exist because the design's result row is a single line: a
// repo with 28k stars written in full, or "TypeScript" rather than "ts", wraps
// it. They are pure string arithmetic with awkward boundaries, which is
// cheaper to pin down here than by reading pixels in a browser.

describe("formatStars", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [999, "999"],
    [1000, "1k"],
    [1100, "1.1k"],
    [9100, "9.1k"],
    [9999, "10k"],
    [23000, "23k"],
    [50000, "50k"],
  ])("renders %i as %s", (stars, expected) => {
    expect(formatStars(stars)).toBe(expected)
  })

  // A trailing `.0` is noise: 2000 is "2k", never "2.0k".
  it("drops a trailing zero from the fraction", () => {
    expect(formatStars(2000)).toBe("2k")
  })
})

describe("abbreviateLanguage", () => {
  it.each([
    ["TypeScript", "ts"],
    ["JavaScript", "js"],
    ["Python", "py"],
    ["Rust", "rs"],
    ["Svelte", "svelte"],
  ])("abbreviates %s to %s", (language, expected) => {
    expect(abbreviateLanguage(language)).toBe(expected)
  })

  it("is case-insensitive", () => {
    expect(abbreviateLanguage("TYPESCRIPT")).toBe("ts")
  })

  // Unknown languages are shortened rather than hidden.
  it("falls back to the first two letters", () => {
    expect(abbreviateLanguage("Zig")).toBe("zi")
  })
})
