import { describe, it, expect } from "vitest";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  STATUS_MESSAGES,
  INFO_MESSAGES,
  configUnreadableError,
  globalScopedAgentsHint,
  hostCliNotFound,
  initSucceeded,
  installationConfigsUnreadable,
  localSkillsRemoval,
  notInstalledHere,
  pluginsInstalled,
  propagatedRecompileSummary,
  recompileSummary,
  sourceUnreachableUsingCache,
} from "./messages";
import { DEFAULT_BRANDING, PROVIDERS } from "../consts";

/** Whole word, so `resource` is not matched. */
const WITHDRAWN_NOUN = /\bsources?\b/i;

const SKILLS_DIR = "/project/.claude/skills";
/** Echoed verbatim, so it must not itself be a marketplace word. */
const UNREACHABLE_REF = "github:org/repo";

/** Shares no substring with the default name, so a builder echoing the wrong one cannot pass. */
const WHITE_LABEL_NAME = "Northwind";

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

describe("the line a missing host binary produces", () => {
  it("names the provider whose binary is missing, and no other", () => {
    for (const provider of PROVIDERS) {
      const said = hostCliNotFound(provider).toLowerCase();
      const others = PROVIDERS.filter((other) => other !== provider);

      expect(said, `${provider} is not named in its own message`).toContain(provider);
      for (const other of others) {
        expect(said, `${provider}'s message names ${other} instead`).not.toContain(other);
      }
    }
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

/** Asserted by value, not key: a key still spelling `SOURCE` is fine. */
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

describe("the count lines an install and a recompile end on", () => {
  it("counts installed skill plugins in the singular at one", () => {
    expect(pluginsInstalled(1)).toBe("Installed 1 skill plugin");
    expect(pluginsInstalled(3)).toBe("Installed 3 skill plugins");
  });

  it("counts rewritten sub-agents in the singular at one, in whichever noun the caller counts", () => {
    expect(recompileSummary(1, 6, "agent")).toBe("1 agent rewritten, 6 unchanged");
    expect(recompileSummary(2, 0, "global agent")).toBe("2 global agents rewritten, 0 unchanged");
  });

  it("counts the registered projects a fan-out rewrote in the singular at one", () => {
    expect(propagatedRecompileSummary(1, 0, 0)).toBe(
      "Recompiled agents in 1 registered project, 0 unchanged",
    );
    expect(propagatedRecompileSummary(2, 1, 1)).toBe(
      "Recompiled agents in 2 registered projects, 1 unchanged (1 failed)",
    );
  });

  it("refers to one global-scoped agent as it, and to more than one as them", () => {
    expect(globalScopedAgentsHint(1)).toBe(
      "1 agent is global-scoped — run 'npx agents-inc compile' from your home directory to recompile it.",
    );
    expect(globalScopedAgentsHint(2)).toBe(
      "2 agents are global-scoped — run 'npx agents-inc compile' from your home directory to recompile them.",
    );
  });
});

describe("the way out of a config that will not load", () => {
  it("sends an installation's config to a fix, or to uninstall then an install by id", () => {
    expect(
      installationConfigsUnreadable([
        {
          configPath: "/home/me/project/.agents-inc/claude/config.ts",
          reason: "ParseError: Missing semicolon",
          scope: "project",
          scopeRoot: "/home/me/project",
        },
      ]),
    ).toBe(
      [
        "This project's config at '/home/me/project/.agents-inc/claude/config.ts' could not be loaded: ParseError: Missing semicolon",
        "There is no automatic repair for this — fix the file, or recreate the configuration by running 'npx agents-inc uninstall' from '/home/me/project', which still works on a config it cannot read, then 'npx agents-inc init --from <id>' with an id from https://agentsinc.sh/editor.",
        "'npx agents-inc doctor' reports the same file, alongside whatever else is wrong here.",
      ].join("\n"),
    );
  });

  it("names neither uninstall nor init for a marketplace repository's own config", () => {
    const failure =
      "Failed to load config from '/home/me/mk/.agents-inc/config.ts': ParseError: Missing semicolon";

    expect(configUnreadableError(failure)).toBe(
      [
        failure,
        "This is the marketplace's own config rather than an installation's, so it is fixed in the marketplace repository it comes from.",
      ].join("\n"),
    );
  });
});
