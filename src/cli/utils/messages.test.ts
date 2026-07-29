import { describe, it, expect } from "vitest";
import { ERROR_MESSAGES, SUCCESS_MESSAGES, STATUS_MESSAGES, INFO_MESSAGES } from "./messages";

describe("ERROR_MESSAGES", () => {
  it("should have all expected keys", () => {
    expect(Object.keys(ERROR_MESSAGES)).toStrictEqual([
      "UNKNOWN_ERROR",
      "UNKNOWN_ERROR_SHORT",
      "NO_INSTALLATION",
      "NO_LOCAL_SKILLS",
      "NO_SKILLS_FOUND",
      "VALIDATION_FAILED",
      "FAILED_RESOLVE_SOURCE",
      "FAILED_LOAD_AGENT_PARTIALS",
      "FAILED_COMPILE_AGENTS",
      "SKILL_NOT_FOUND",
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
      "INIT_SUCCESS",
      "PLUGIN_COMPILE_COMPLETE",
      "ALL_SKILLS_UP_TO_DATE",
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
      "UPDATING_PLUGIN_SKILLS",
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

describe("INFO_MESSAGES", () => {
  it("should have all expected keys", () => {
    expect(Object.keys(INFO_MESSAGES)).toStrictEqual([
      "NO_CHANGES_MADE",
      "RUN_COMPILE",
      "NO_AGENTS_TO_RECOMPILE",
      "NO_PLUGIN_INSTALLATION",
      "NO_LOCAL_INSTALLATION",
      "NOT_INSTALLED",
      "CONFIG_TYPES_REFRESHED",
    ]);
  });

  it("should have non-empty string values for every key", () => {
    for (const [key, value] of Object.entries(INFO_MESSAGES)) {
      expect(value, `${key} should be a non-empty string`).toBeTypeOf("string");
      expect(value, `${key} should not be empty`).not.toBe("");
    }
  });
});
