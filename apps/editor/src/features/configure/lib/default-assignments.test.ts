import { CATALOG, SUB_AGENT_GROUPS } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { defaultAssignmentsFor } from "./default-assignments"

// The auto-assignment rule is what turns "select a skill" into "these agents
// light up", so each clause gets pinned against the real catalog: a wrong
// answer here silently mis-installs every configuration built on it.

const categoryIn = (domainId: string, predicate: (id: string) => boolean) =>
  CATALOG.domains
    .find((domain) => domain.id === domainId)
    ?.categories.find((category) => predicate(category.id))

describe("defaultAssignmentsFor", () => {
  it("assigns nothing for an unknown or absent category", () => {
    expect(defaultAssignmentsFor(undefined)).toEqual({})
    expect(defaultAssignmentsFor("no-such-category")).toEqual({})
  })

  it("reaches its own domain's core role agents, all enabled", () => {
    const category = categoryIn("web", (id) => id === "web-client-state")!
    const assignments = defaultAssignmentsFor(category.id)

    expect(Object.keys(assignments).sort()).toEqual([
      "web-developer",
      "web-pm",
      "web-reviewer",
      "web-tester",
    ])
    expect(Object.values(assignments).every((a) => a.enabled)).toBe(true)
  })

  it("skips core roles the domain does not have", () => {
    // AI has a developer and a reviewer, but no pm and no tester.
    const category = categoryIn("ai", () => true)!
    const assignments = defaultAssignmentsFor(category.id)

    expect(Object.keys(assignments).sort()).toEqual([
      "ai-developer",
      "ai-reviewer",
    ])
  })

  it("loads most skills lazily", () => {
    const category = categoryIn("web", (id) => id === "web-client-state")!

    expect(
      Object.values(defaultAssignmentsFor(category.id)).every(
        (a) => a.load === "lazy"
      )
    ).toBe(true)
  })

  it("preloads fundamentals everywhere they reach", () => {
    const category = categoryIn("web", (id) => id === "web-framework")!

    expect(
      Object.values(defaultAssignmentsFor(category.id)).every(
        (a) => a.load === "preloaded"
      )
    ).toBe(true)
  })

  it("preloads a testing skill only on its own domain's tester", () => {
    const category = categoryIn("web", (id) => id === "web-testing")!
    const assignments = defaultAssignmentsFor(category.id)

    expect(assignments["web-tester"]?.load).toBe("preloaded")
    expect(
      Object.entries(assignments)
        .filter(([agentId]) => agentId !== "web-tester")
        .every(([, a]) => a.load === "lazy")
    ).toBe(true)
  })

  it("spreads a shared skill across every implementation domain", () => {
    const category = categoryIn("shared", () => true)!
    const domains = new Set(
      Object.keys(defaultAssignmentsFor(category.id)).map(
        (agentId) => agentId.split("-")[0]
      )
    )

    expect(domains.has("web")).toBe(true)
    expect(domains.has("api")).toBe(true)
    expect(domains.has("meta")).toBe(false)
  })

  it("never assigns a meta skill implicitly", () => {
    const category = categoryIn("meta", () => true)!
    expect(defaultAssignmentsFor(category.id)).toEqual({})
  })

  it("targets only agents that actually exist", () => {
    const agentIds = new Set(
      SUB_AGENT_GROUPS.flatMap((group) =>
        group.agents.map((agent) => agent.id as string)
      )
    )

    for (const domain of CATALOG.domains) {
      for (const category of domain.categories) {
        for (const agentId of Object.keys(defaultAssignmentsFor(category.id))) {
          expect(agentIds.has(agentId)).toBe(true)
        }
      }
    }
  })
})
