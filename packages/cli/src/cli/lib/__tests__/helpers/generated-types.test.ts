import { describe, it, expect } from "vitest";
import { readGeneratedUnion } from "./generated-types.js";

const INLINE_UNION_SOURCE = `export type AgentName = "api-developer" | "web-developer";

export type SelectedAgentName = "web-developer";
`;

const MULTI_LINE_UNION_SOURCE = `export type AgentName =
  | "agent-summoner"
  | "api-developer"
  | "web-developer";

export type SelectedAgentName =
  | "agent-summoner"
  | "web-developer";
`;

describe("readGeneratedUnion", () => {
  it("reads an inline union without picking up the following alias", () => {
    expect(readGeneratedUnion(INLINE_UNION_SOURCE, "SelectedAgentName")).toBe(' "web-developer"');
  });

  it("reads only the requested alias when another alias shares its suffix", () => {
    expect(readGeneratedUnion(INLINE_UNION_SOURCE, "AgentName")).toBe(
      ' "api-developer" | "web-developer"',
    );
  });

  it("spans every member of a multi-line union", () => {
    const union = readGeneratedUnion(MULTI_LINE_UNION_SOURCE, "SelectedAgentName");

    expect(union).toContain('"agent-summoner"');
    expect(union).toContain('"web-developer"');
  });

  it("excludes members that belong to a different multi-line alias", () => {
    const union = readGeneratedUnion(MULTI_LINE_UNION_SOURCE, "SelectedAgentName");

    expect(
      union,
      "api-developer is in AgentName only — reading SelectedAgentName must not reach it",
    ).not.toContain('"api-developer"');
  });

  it("returns undefined for an alias the source does not declare", () => {
    expect(readGeneratedUnion(INLINE_UNION_SOURCE, "ProjectAgentName")).toBeUndefined();
  });
});
