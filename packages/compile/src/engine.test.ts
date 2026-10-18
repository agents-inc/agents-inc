// The browser engine reads a template record the way the CLI's engine reads a templates folder on
// disk, so the same `{% render %}` paths reach the same partials.

import { describe, expect, it } from "vitest"

import { createEngineFromTemplates } from "./engine"

const NESTED_TEMPLATES = {
  "agent.liquid": "agent[{% render 'partials/sub/first' %}]",
  "partials/sub/first.liquid":
    "first({% render './sibling' %})({% render '../parent' %})",
  "partials/sub/sibling.liquid": "sibling",
  "partials/parent.liquid": "parent",
}

const NESTED_RENDER = "agent[first(sibling)(parent)]"

describe("a template record", () => {
  it("renders a partial named from the templates root, a sibling by ./ and a parent's by ../", async () => {
    const engine = createEngineFromTemplates(NESTED_TEMPLATES)

    expect(await engine.renderFile("agent")).toBe(NESTED_RENDER)
  })

  it("renders the same synchronously", () => {
    const engine = createEngineFromTemplates(NESTED_TEMPLATES)

    expect(engine.renderFileSync("agent")).toBe(NESTED_RENDER)
  })

  it("climbs one folder per ../, however deep the partial sits", async () => {
    const engine = createEngineFromTemplates({
      "agent.liquid": "{% render 'a/b/c/deep' %}",
      "a/b/c/deep.liquid": "{% render '../up-one' %}",
      "a/b/up-one.liquid": "up-one",
      "a/up-one.liquid": "two folders up",
    })

    expect(await engine.renderFile("agent")).toBe("up-one")
  })

  it("finds a partial named with its extension", async () => {
    const engine = createEngineFromTemplates({
      "agent.liquid": "{% render 'partials/parent.liquid' %}",
      "partials/parent.liquid": "parent",
    })

    expect(await engine.renderFile("agent")).toBe("parent")
  })

  it("reads a doubled or leading separator the way a folder on disk does", async () => {
    const engine = createEngineFromTemplates({
      "agent.liquid":
        "{% render 'partials//parent' %}|{% render '/partials/parent' %}",
      "partials/parent.liquid": "parent",
    })

    expect(await engine.renderFile("agent")).toBe("parent|parent")
  })
})

describe("a template the record does not hold", () => {
  const engine = createEngineFromTemplates({ "agent.liquid": "agent" })

  it("fails the lookup by name", async () => {
    await expect(engine.renderFile("missing")).rejects.toThrow(
      'ENOENT: Failed to lookup "missing" in ""'
    )
  })

  it("fails the synchronous lookup by name", () => {
    expect(() => {
      engine.renderFileSync("missing")
    }).toThrow('ENOENT: Failed to lookup "missing" in ""')
  })
})

describe("the engine's options, which match the CLI's so renders agree", () => {
  it("refuses a filter it does not know", async () => {
    const engine = createEngineFromTemplates({
      "agent.liquid": "{{ title | no_such_filter }}",
    })

    await expect(engine.renderFile("agent", { title: "x" })).rejects.toThrow(
      "undefined filter: no_such_filter, file:agent.liquid, line:1, col:1"
    )
  })

  it("renders a variable nothing set as empty", async () => {
    const engine = createEngineFromTemplates({
      "agent.liquid": "[{{ unset }}]",
    })

    expect(await engine.renderFile("agent")).toBe("[]")
  })

  it("hands every template the install values it was given", async () => {
    const engine = createEngineFromTemplates(
      { "agent.liquid": "{{ sourceFolder }}" },
      { sourceFolder: ".agents-inc/claude" }
    )

    expect(await engine.renderFile("agent")).toBe(".agents-inc/claude")
  })
})
