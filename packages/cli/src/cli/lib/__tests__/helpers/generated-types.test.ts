import { describe, it, expect } from "vitest";
import { readGeneratedUnion, readGeneratedUnionMembers } from "./generated-types.js";

const INLINE_UNION_SOURCE = `export type AgentName = 'api-developer' | 'web-developer'

export type SelectedAgentName = 'web-developer'
`;

/**
 * The same two aliases with their declarations REVERSED. `assembleConfigTypesSource`
 * (`lib/configuration/config-types-writer.ts`) emits `AgentName` above `SelectedAgentName` and
 * `ProjectAgentName`, so in a generated file the longer alias never precedes the one whose name
 * it ends with — which is the whole reason this fixture has to state the other order. Under the
 * emitted one, a reader that anchored on a bare `AgentName =` rather than on
 * `export type AgentName =` still answers correctly, because the first occurrence IS the
 * declaration asked for; reversed, that reader hands back `SelectedAgentName`'s body.
 */
const SUFFIX_SHARING_ALIAS_DECLARED_FIRST = `export type SelectedAgentName = 'web-developer'

export type AgentName = 'api-developer' | 'web-developer'
`;

const MULTI_LINE_UNION_SOURCE = `export type AgentName =
  | 'agent-summoner'
  | 'api-developer'
  | 'web-developer'

export type SelectedAgentName =
  | 'agent-summoner'
  | 'web-developer'
`;

const FALLBACK_UNION_SOURCE = `export type AgentName = 'api-developer' | 'web-developer'

export type SelectedAgentName = AgentName

export type ProjectAgentName = never
`;

/**
 * The shape `generateStackAgentConfig` (`@workspace/compile/config-types-source`) emits: an
 * object body carrying one `'<category>'?: ...` line per category, with no blank line inside it.
 * Every alias these readers are pointed at today is a flat string union; this one is emitted into
 * the same file and is what a reader reaching for the next alias would meet.
 */
const OBJECT_BODY_SOURCE = `export type StackAgentConfig = {
  'api-framework'?: SkillAssignment<'api-framework-hono'>[]
  'web-framework'?: SkillAssignment<'web-framework-react'>[]
}

export type SelectedAgentName = 'web-developer'
`;

/** What the blank-line boundary leaves of `OBJECT_BODY_SOURCE`'s object body: all of it. */
const THE_WHOLE_OBJECT_BODY = ` {
  'api-framework'?: SkillAssignment<'api-framework-hono'>[]
  'web-framework'?: SkillAssignment<'web-framework-react'>[]
}`;

describe("readGeneratedUnion", () => {
  it("reads an inline union without picking up the following alias", () => {
    expect(readGeneratedUnion(INLINE_UNION_SOURCE, "SelectedAgentName")).toBe(" 'web-developer'");
  });

  it("reads only the requested alias when another alias shares its suffix", () => {
    expect(readGeneratedUnion(INLINE_UNION_SOURCE, "AgentName")).toBe(
      " 'api-developer' | 'web-developer'",
    );
  });

  it("skips a longer alias declared first whose name ends with the requested one", () => {
    expect(
      readGeneratedUnion(SUFFIX_SHARING_ALIAS_DECLARED_FIRST, "AgentName"),
      "the anchor is `export type <alias> =` rather than a bare `<alias> =` — a request for AgentName must not be answered with SelectedAgentName's body",
    ).toBe(" 'api-developer' | 'web-developer'");
  });

  it("spans every member of a multi-line union", () => {
    const union = readGeneratedUnion(MULTI_LINE_UNION_SOURCE, "SelectedAgentName");

    expect(union).toContain("'agent-summoner'");
    expect(union).toContain("'web-developer'");
  });

  it("excludes members that belong to a different multi-line alias", () => {
    const union = readGeneratedUnion(MULTI_LINE_UNION_SOURCE, "SelectedAgentName");

    expect(
      union,
      "api-developer is in AgentName only — reading SelectedAgentName must not reach it",
    ).not.toContain("'api-developer'");
  });

  it("returns undefined for an alias the source does not declare", () => {
    expect(readGeneratedUnion(INLINE_UNION_SOURCE, "ProjectAgentName")).toBeUndefined();
  });

  it("hands back a whole object body rather than stopping inside it", () => {
    expect(
      readGeneratedUnion(OBJECT_BODY_SOURCE, "StackAgentConfig"),
      "the reader's boundary, stated rather than left to be rediscovered: it ends an alias at the blank line the writer puts between declarations, so an object body comes back whole. That is not a union — the literals in it are one category's candidate skills — so an alias of this shape is read by loading the file, not by this reader",
    ).toBe(THE_WHOLE_OBJECT_BODY);
  });
});

describe("readGeneratedUnionMembers", () => {
  it("names every member of an inline union, in emission order", () => {
    expect(readGeneratedUnionMembers(INLINE_UNION_SOURCE, "AgentName")).toStrictEqual([
      "api-developer",
      "web-developer",
    ]);
  });

  it("names every member of a multi-line union without reaching a neighbouring alias", () => {
    expect(readGeneratedUnionMembers(MULTI_LINE_UNION_SOURCE, "SelectedAgentName")).toStrictEqual([
      "agent-summoner",
      "web-developer",
    ]);
  });

  it("throws naming the alias the source does not declare", () => {
    expect(() => readGeneratedUnionMembers(INLINE_UNION_SOURCE, "ProjectAgentName")).toThrow(
      "ProjectAgentName",
    );
  });

  it("answers an empty list for an alias that falls back to a bare type reference", () => {
    expect(readGeneratedUnionMembers(FALLBACK_UNION_SOURCE, "SelectedAgentName")).toStrictEqual([]);
  });

  it("answers an empty list for an alias declared as never", () => {
    expect(readGeneratedUnionMembers(FALLBACK_UNION_SOURCE, "ProjectAgentName")).toStrictEqual([]);
  });
});
