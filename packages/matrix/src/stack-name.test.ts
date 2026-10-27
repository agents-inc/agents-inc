import { describe, expect, it } from "vitest"

// Through the barrel, as the editor, the worker and the mocks import it.
import { sameStackName } from "./index"

describe("sameStackName", () => {
  it.each([
    ["only in case", "Weekday", "WEEKDAY"],
    ["only in the spaces around them", "Weekday", "  Weekday "],
    ["in case and in padding", " WEEKDAY ", "weekday"],
    // SQLite's `lower()` folds ASCII only, so these are the ones a query would miss.
    ["in the case of an accented letter", "Équipe", "équipe"],
    ["in the case of several accented letters", "ÅNGSTRÖM", " ångström "],
    ["in the case of a non-Latin script", "Команда", "КОМАНДА"],
  ])("treats two names differing %s as one name", (_label, a, b) => {
    expect(sameStackName(a, b)).toBe(true)
    expect(sameStackName(b, a)).toBe(true)
  })

  it.each([
    ["an accented letter and its plain one", "Équipe", "Equipe"],
    ["the spaces inside them", "my stack", "my  stack"],
    ["a suffix", "Weekday", "Weekday 2"],
    ["their letters", "Weekday", "Weekend"],
  ])("keeps apart two names differing in %s", (_label, a, b) => {
    expect(sameStackName(a, b)).toBe(false)
    expect(sameStackName(b, a)).toBe(false)
  })
})
