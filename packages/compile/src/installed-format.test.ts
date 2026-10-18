// The layout rules an install's `config.ts` is printed with, one rule per spec. The emission
// scenarios hold whole files against prettier; these pin each rule at its own boundary.

import { describe, expect, it } from "vitest"

import {
  brokenUnionLayout,
  commentEntry,
  isKeyedRecord,
  quoteText,
  renderArrayLine,
  renderKey,
  renderTypeImportLine,
  renderUnionBody,
  renderValueLine,
  sourceEntry,
  unionLayout,
  valueEntries,
} from "./installed-format"

/** A run of columns, for lines measured against prettier's `printWidth: 100`. */
const columns = (count: number): string => "x".repeat(count)

describe("quoteText", () => {
  it("prefers single quotes", () => {
    expect(quoteText("react")).toBe("'react'")
  })

  it("switches to double quotes when that saves escaping an apostrophe", () => {
    expect(quoteText("it's")).toBe(`"it's"`)
  })

  it("leaves double quotes unescaped inside single quotes", () => {
    expect(quoteText('say "hi"')).toBe(`'say "hi"'`)
  })

  it("keeps single quotes on a tie and escapes the apostrophe instead", () => {
    expect(quoteText(`a'b"c`)).toBe(`'a\\'b"c'`)
  })

  it("escapes a newline as JSON does", () => {
    expect(quoteText("a\nb")).toBe("'a\\nb'")
  })
})

describe("renderKey", () => {
  it("leaves an identifier bare", () => {
    expect(renderKey("selectedDomains")).toBe("selectedDomains")
    expect(renderKey("$scope_1")).toBe("$scope_1")
  })

  it("quotes a key no identifier can spell", () => {
    expect(renderKey("web-developer")).toBe("'web-developer'")
    expect(renderKey("1st")).toBe("'1st'")
  })
})

describe("isKeyedRecord", () => {
  it("holds for a plain object", () => {
    expect(isKeyedRecord({})).toBe(true)
  })

  it("does not hold for null, an array or a string", () => {
    expect([null, [], "x"].map(isKeyedRecord)).toStrictEqual([
      false,
      false,
      false,
    ])
  })
})

describe("a value on its own line", () => {
  const SHORT = { indent: 2, prefix: "key: ", suffix: "," }

  it("prints a short array, and two items comma-separated", () => {
    expect(renderValueLine(["a", "b"], SHORT)).toBe("  key: ['a', 'b'],")
  })

  it("prints an empty array and an empty record as such", () => {
    expect(renderValueLine([], SHORT)).toBe("  key: [],")
    expect(renderValueLine({}, SHORT)).toBe("  key: {},")
  })

  it("prints an empty record nested in a flat one as {}", () => {
    expect(renderValueLine({ web: {} }, SHORT)).toBe("  key: { web: {} },")
  })

  it("moves a string that does not fit below its key", () => {
    const prefix = `${columns(90)}: `

    expect(
      renderValueLine("a-long-value", { indent: 2, prefix, suffix: "," })
    ).toBe(`  ${columns(90)}:\n    'a-long-value',`)
  })

  it("moves null below its key when it does not fit", () => {
    const prefix = `${columns(94)}: `

    expect(renderValueLine(null, { indent: 2, prefix, suffix: "," })).toBe(
      `  ${columns(94)}:\n    null,`
    )
  })

  it("moves an empty array or record below its key when it does not fit", () => {
    const position = { indent: 2, prefix: `${columns(96)}: `, suffix: "," }

    expect(renderValueLine([], position)).toBe(`  ${columns(96)}:\n    [],`)
    expect(renderValueLine({}, position)).toBe(`  ${columns(96)}:\n    {},`)
  })

  it("keeps a number on its key's line however wide", () => {
    const prefix = `${columns(98)}: `

    expect(renderValueLine(12345, { indent: 2, prefix, suffix: "," })).toBe(
      `  ${prefix}12345,`
    )
  })

  it("keeps an array element where it is, having no key to move under", () => {
    const element = columns(100)

    expect(
      renderArrayLine(valueEntries([element]), {
        indent: 0,
        prefix: "skills: ",
        suffix: "",
      })
    ).toBe(`skills: [\n  '${element}',\n]`)
  })
})

describe("an array on its own line", () => {
  it("moves an empty array below its key when it does not fit", () => {
    expect(
      renderArrayLine([], {
        indent: 2,
        prefix: `${columns(96)}: `,
        suffix: ",",
      })
    ).toBe(`  ${columns(96)}:\n    [],`)
  })

  it("breaks around a comment and prints source entries verbatim", () => {
    expect(
      renderArrayLine([commentEntry("Custom"), sourceEntry("SKILLS.react")], {
        indent: 0,
        prefix: "skills: ",
        suffix: "",
      })
    ).toBe("skills: [\n  // Custom\n  SKILLS.react,\n]")
  })
})

describe("unionLayout", () => {
  const MEMBERS = ["'aa'", "'bb'"]
  const FLAT_WIDTH = "'aa' | 'bb'".length

  it("stays inline when the whole line is exactly the print width", () => {
    expect(
      unionLayout(MEMBERS, {
        headWidth: 100 - FLAT_WIDTH - 3,
        tailWidth: 3,
        bodyIndent: 2,
      })
    ).toBe("inline")
  })

  it("leaves the line once the columns after it push past the print width", () => {
    expect(
      unionLayout(MEMBERS, {
        headWidth: 100 - FLAT_WIDTH - 2,
        tailWidth: 3,
        bodyIndent: 2,
      })
    ).toBe("indented")
  })
})

describe("brokenUnionLayout", () => {
  const MEMBERS = ["'aa'", "'bb'"]
  const FLAT_WIDTH = "'aa' | 'bb'".length

  it("indents the union on its own line when that line is exactly the print width", () => {
    expect(brokenUnionLayout(MEMBERS, 100 - FLAT_WIDTH)).toBe("indented")
  })

  it("stacks one member per line once that line would not fit", () => {
    expect(brokenUnionLayout(MEMBERS, 101 - FLAT_WIDTH)).toBe("stacked")
  })
})

describe("renderUnionBody", () => {
  it("prints an indented union on one line", () => {
    expect(renderUnionBody(["'aa'", "'bb'"], "indented", 4)).toBe(
      "    'aa' | 'bb'"
    )
  })

  it("prints a stacked union one member per line, each led by a bar", () => {
    expect(renderUnionBody(["'aa'", "'bb'"], "stacked", 4)).toBe(
      "    | 'aa'\n    | 'bb'"
    )
  })
})

describe("renderTypeImportLine", () => {
  const fixedWidth = "import type {  } from './config-types'".length

  it("stays on one line at exactly the print width", () => {
    const specifier = columns(100 - fixedWidth)

    expect(renderTypeImportLine([specifier], "./config-types")).toBe(
      `import type { ${specifier} } from './config-types'`
    )
  })

  it("puts one specifier per line once it would not fit", () => {
    const specifier = columns(101 - fixedWidth)

    expect(renderTypeImportLine([specifier], "./config-types")).toBe(
      `import type {\n  ${specifier},\n} from './config-types'`
    )
  })
})
