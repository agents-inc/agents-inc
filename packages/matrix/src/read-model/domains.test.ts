import { describe, expect, it } from "vitest"

import {
  DOMAIN_DESCRIPTIONS,
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  compareDomains,
} from "./domains"

describe("DOMAIN_ORDER", () => {
  it("lists the domains in the order the filter chips show them", () => {
    expect(DOMAIN_ORDER).toStrictEqual([
      "web",
      "api",
      "ai",
      "mobile",
      "desktop",
      "cli",
      "infra",
      "meta",
      "shared",
    ])
  })
})

describe("compareDomains", () => {
  it("sorts an earlier domain before a later one", () => {
    expect(compareDomains("web", "api")).toBeLessThan(0)
    expect(compareDomains("shared", "meta")).toBeGreaterThan(0)
  })

  it("ties a domain with itself", () => {
    expect(compareDomains("ai", "ai")).toBe(0)
  })
})

// Literals: these are the texts the editor renders.
describe("DOMAIN_LABELS", () => {
  it("labels each domain with its filter chip's text", () => {
    expect(DOMAIN_LABELS).toStrictEqual({
      web: "Web",
      api: "API",
      ai: "AI",
      mobile: "Mobile",
      desktop: "Desktop",
      cli: "CLI",
      infra: "Infra",
      meta: "Meta",
      shared: "Shared",
    })
  })
})

describe("DOMAIN_DESCRIPTIONS", () => {
  it("describes each domain in a line", () => {
    expect(DOMAIN_DESCRIPTIONS).toStrictEqual({
      web: "Frontend web applications",
      api: "Backend APIs and services",
      ai: "AI and LLM integrations",
      mobile: "Mobile applications",
      desktop: "Desktop applications",
      cli: "Command-line tools",
      infra: "CI/CD, deployment, and infrastructure",
      meta: "Design patterns, code review, and research methodology",
      shared: "Shared utilities and methodology",
    })
  })
})
