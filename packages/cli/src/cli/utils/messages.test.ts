import { describe, it, expect } from "vitest";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  STATUS_MESSAGES,
  INFO_MESSAGES,
  initSucceeded,
  localSkillsRemoval,
  notInstalledHere,
  sourceUnreachableUsingCache,
} from "./messages";
import { DEFAULT_BRANDING } from "../consts";

/**
 * The word withdrawn from the user-facing surface, as a whole word so
 * `resource` and a path that happens to spell it are not matched.
 */
const WITHDRAWN_NOUN = /\bsources?\b/i;

/** Stand-in path for the removal line — the line's subject is its parenthetical, not the path. */
const SKILLS_DIR = "/project/.claude/skills";
/** Stand-in ref for the cache warning — the ref is echoed verbatim, so it must not be a marketplace word. */
const UNREACHABLE_REF = "github:org/repo";

/**
 * A `branding.name` a project config supplies, sharing no substring with
 * {@link DEFAULT_BRANDING.NAME} so a builder echoing the wrong one cannot pass.
 */
const WHITE_LABEL_NAME = "Northwind";

/**
 * The two lines that carry the name a run prints itself under.
 *
 * They are builders rather than entries in the tables above because the name is per-installation,
 * and each is asserted against BOTH names: the configured one to say it is echoed, and the shipped
 * one to say a caller that resolved nothing still reads as the CLI does today.
 */
describe("the lines that carry the name a run prints itself under", () => {
  it("echoes the name init was given, and reads as it ships when handed the default", () => {
    expect(initSucceeded(WHITE_LABEL_NAME)).toBe(`${WHITE_LABEL_NAME} initialized successfully!`);
    expect(initSucceeded(DEFAULT_BRANDING.NAME)).toBe(
      `${DEFAULT_BRANDING.NAME} initialized successfully!`,
    );
  });

  it("echoes the name uninstall was given, and reads as it ships when handed the default", () => {
    expect(notInstalledHere(WHITE_LABEL_NAME)).toBe(
      `${WHITE_LABEL_NAME} is not installed in this project.`,
    );
    expect(notInstalledHere(DEFAULT_BRANDING.NAME)).toBe(
      `${DEFAULT_BRANDING.NAME} is not installed in this project.`,
    );
  });
});

describe("ERROR_MESSAGES", () => {
  it("should have all expected keys", () => {
    expect(Object.keys(ERROR_MESSAGES)).toStrictEqual([
      "UNKNOWN_ERROR",
      "UNKNOWN_ERROR_SHORT",
      "NO_INSTALLATION",
      "FAILED_RESOLVE_SOURCE",
      "FAILED_LOAD_AGENT_PARTIALS",
      "FAILED_COMPILE_AGENTS",
      "CLAUDE_CLI_NOT_FOUND",
      "NO_SKILLS_TO_COMPILE",
    ]);
  });

  it("should have non-empty string values for every key", () => {
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
      expect(value, `${key} should be a non-empty string`).toBeTypeOf("string");
      expect(value, `${key} should not be empty`).not.toBe("");
    }
  });
});

describe("SUCCESS_MESSAGES", () => {
  it("should have all expected keys", () => {
    expect(Object.keys(SUCCESS_MESSAGES)).toStrictEqual([
      "UNINSTALL_COMPLETE",
      "PLUGIN_COMPILE_COMPLETE",
    ]);
  });

  it("should have non-empty string values for every key", () => {
    for (const [key, value] of Object.entries(SUCCESS_MESSAGES)) {
      expect(value, `${key} should be a non-empty string`).toBeTypeOf("string");
      expect(value, `${key} should not be empty`).not.toBe("");
    }
  });
});

describe("STATUS_MESSAGES", () => {
  it("should have all expected keys", () => {
    expect(Object.keys(STATUS_MESSAGES)).toStrictEqual([
      "INSTALLING_PLUGINS",
      "LOADING_SKILLS",
      "LOADING_MARKETPLACE_SOURCE",
      "RECOMPILING_AGENTS",
      "COMPILING_AGENTS",
      "DISCOVERING_SKILLS",
      "RESOLVING_SOURCE",
      "RESOLVING_MARKETPLACE_SOURCE",
      "LOADING_AGENT_PARTIALS",
      "FETCHING_REPOSITORY",
      "COPYING_SKILLS",
      "MARKETPLACE_HAS_NEWER_CONTENT",
    ]);
  });

  it("should have non-empty string values for every key", () => {
    for (const [key, value] of Object.entries(STATUS_MESSAGES)) {
      expect(value, `${key} should be a non-empty string`).toBeTypeOf("string");
      expect(value, `${key} should not be empty`).not.toBe("");
    }
  });

  it("should end with ellipsis for all loading/progress messages", () => {
    for (const [key, value] of Object.entries(STATUS_MESSAGES)) {
      expect(value, `${key} should end with '...'`).toMatch(/\.\.\.$/);
    }
  });
});

/**
 * The tables are asserted by VALUE rather than by key: the keys are internal identifiers,
 * the values are what a user reads. A key still spelling `SOURCE` while
 * its value says "marketplace" is correct here and deliberately not flagged.
 */
describe("the vocabulary the message tables print in", () => {
  const TABLES: [name: string, table: Record<string, string>][] = [
    ["ERROR_MESSAGES", ERROR_MESSAGES],
    ["SUCCESS_MESSAGES", SUCCESS_MESSAGES],
    ["STATUS_MESSAGES", STATUS_MESSAGES],
    ["INFO_MESSAGES", INFO_MESSAGES],
  ];

  it.each(TABLES)("should not call a marketplace a source in %s", (name, table) => {
    for (const [key, value] of Object.entries(table)) {
      expect(value, `${name}.${key} must not name a source`).not.toMatch(WITHDRAWN_NOUN);
    }
  });

  it("should not call the matching skills 'sources' in the removal plan", () => {
    expect(localSkillsRemoval(SKILLS_DIR)).toContain(SKILLS_DIR);
    expect(localSkillsRemoval(SKILLS_DIR)).not.toMatch(WITHDRAWN_NOUN);
  });

  it("should keep the unreachable-cache warning, which already names no source", () => {
    expect(sourceUnreachableUsingCache(UNREACHABLE_REF)).toBe(
      `Could not reach ${UNREACHABLE_REF} — using the cached copy, which may be out of date.`,
    );
  });
});

describe("INFO_MESSAGES", () => {
  it("should have all expected keys", () => {
    expect(Object.keys(INFO_MESSAGES)).toStrictEqual([
      "NO_CHANGES_MADE",
      "RUN_COMPILE",
      "NO_AGENTS_TO_RECOMPILE",
      "NO_PLUGIN_INSTALLATION",
      "NO_LOCAL_INSTALLATION",
      "CONFIG_TYPES_REFRESHED",
      "EJECTED_SKILLS_USER_OWNED",
      "NO_PLUGIN_MARKETPLACES",
      "AGENT_PARTIALS_CUSTOMIZABLE",
    ]);
  });

  it("should have non-empty string values for every key", () => {
    for (const [key, value] of Object.entries(INFO_MESSAGES)) {
      expect(value, `${key} should be a non-empty string`).toBeTypeOf("string");
      expect(value, `${key} should not be empty`).not.toBe("");
    }
  });
});
