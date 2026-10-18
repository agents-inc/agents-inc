import { describe, it, expect } from "vitest";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  STATUS_MESSAGES,
  INFO_MESSAGES,
  addMarketplaceInTheEditor,
  addedToGlobalSubAgents,
  agentsNotCompiled,
  applySharedConfigHere,
  authoredHereKept,
  carriedSkillsWritten,
  completedWithFailures,
  configUnreadableError,
  editorSkillMetadataUnusableError,
  globalScopedAgentsHint,
  hostCliNotFound,
  initSucceeded,
  installationConfigsUnreadable,
  keptAsInstalledGlobally,
  keptUnassigned,
  layoutIsCurrent,
  localSkillsCopied,
  localSkillsRemoval,
  marketplaceHasNoVersion,
  marketplaceManifestMissing,
  marketplaceManifestUnreadable,
  marketplaceNameNotPublishable,
  marketplaceOwnerHasNoName,
  marketplaceRefreshFailed,
  marketplacesRefreshFailed,
  marketplacesRefreshed,
  notInstalledHere,
  pluginsInstalled,
  projectCopyRemoved,
  propagatedRecompileSummary,
  recompileSummary,
  registeredProjectConfigUnreadable,
  registeredProjectGone,
  registeredProjectOnAnotherProvider,
  registeredProjectUpdateFailed,
  registeredProjectUpdateSkipped,
  registeredProjectsUpdateFailed,
  registeredProjectsUpdated,
  retiredSourceFolderUnsupported,
  savedSkillMetadataUnusableError,
  scopeBlockedStackAssignment,
  scopeLabel,
  scopeNoun,
  shareRefusesEjectedSkills,
  sharedConfigExistingInstall,
  sharedConfigNeedsTerminal,
  sharedConfigProjectScopeAtHome,
  sharedIdNamesAFolder,
  sharedSkillsLeftBehind,
  skillMetadataUnusableDetail,
  skillMetadataUnusableError,
  skippedUnknownAgents,
  skippedUnknownSkills,
  sourceUnreachableUsingCache,
  uninstallConfigUnreadable,
  uninstallNeedsTerminal,
  unmarkedAgentsKept,
  unplaceableKept,
} from "./messages";
import { DEFAULT_BRANDING, PROVIDERS } from "../consts";
import { SKILLS } from "../lib/__tests__/test-fixtures";
import type { AgentName } from "../types";

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

const WEB_DEVELOPER: AgentName = "web-developer";
const API_DEVELOPER: AgentName = "api-developer";
const REACT = SKILLS.react.id;
const HONO = SKILLS.hono.id;

const PROJECT_DIR = "/home/me/project";
const OTHER_PROJECT_DIR = "/home/me/other";
const PACKAGE_JSON = "/home/me/mk/package.json";

const UNUSABLE_REACT = {
  skillDirName: "web-framework-react",
  metadataPath: "/home/me/project/.claude/skills/web-framework-react/metadata.yaml",
  reason: "YAMLParseError: Unexpected scalar at line 3",
};
const UNUSABLE_HONO = {
  skillDirName: "api-framework-hono",
  metadataPath: "/home/me/project/.claude/skills/api-framework-hono/metadata.yaml",
  reason: "missing fields: category",
};

describe("the line a missing host binary produces, word for word", () => {
  it("names Claude Code's binary and where to get it", () => {
    expect(hostCliNotFound("claude")).toBe(
      "Claude CLI not found — 'npx agents-inc update' refreshes marketplaces through it. Install Claude Code first: https://claude.ai/code",
    );
  });

  it("names Codex's binary and the package that puts it on PATH", () => {
    expect(hostCliNotFound("codex")).toBe(
      "Codex CLI not found — 'npx agents-inc update' refreshes marketplaces through it. Install the '@openai/codex' package first, so that 'codex' is on PATH",
    );
  });
});

describe("the lines a compile and an install report their counts in", () => {
  it("counts the local skills a run copied", () => {
    expect(localSkillsCopied(3)).toBe("Copied 3 local skill(s)");
  });

  it("names every sub-agent that did not compile, comma-separated", () => {
    expect(agentsNotCompiled([WEB_DEVELOPER, API_DEVELOPER])).toBe(
      "2 sub-agent(s) did not compile: web-developer, api-developer",
    );
  });

  it("lists each failure of a finished run under one heading, with its way out indented beneath it", () => {
    expect(
      completedWithFailures([
        { what: "the global agents were not recompiled", recovery: "Recompile them." },
        { what: "a stale agent file was kept", recovery: "Delete it." },
      ]),
    ).toBe(
      [
        "Completed with 2 failure(s) — the changes above landed, these did not:",
        "  the global agents were not recompiled",
        "    Recompile them.",
        "  a stale agent file was kept",
        "    Delete it.",
      ].join("\n"),
    );
  });

  it("counts the registered projects an install updated in the singular at one", () => {
    expect(registeredProjectsUpdated(1)).toBe("Updated 1 registered project");
    expect(registeredProjectsUpdated(2)).toBe("Updated 2 registered projects");
  });
});

describe("the refusal of a project-scoped skill on a global-scoped sub-agent", () => {
  it("names one sub-agent in the singular", () => {
    expect(scopeBlockedStackAssignment([WEB_DEVELOPER], REACT)).toBe(
      `Sub-agent 'web-developer' cannot carry project-scoped skill '${REACT}' — global-scoped sub-agents only carry global-scoped skills.`,
    );
  });

  it("names several sub-agents in the plural, each quoted", () => {
    expect(scopeBlockedStackAssignment([WEB_DEVELOPER, API_DEVELOPER], HONO)).toBe(
      `Sub-agents 'web-developer', 'api-developer' cannot carry project-scoped skill '${HONO}' — global-scoped sub-agents only carry global-scoped skills.`,
    );
  });
});

describe("the lines a marketplace refresh ends on", () => {
  it("counts the listings it refreshed and says plugins were left alone", () => {
    expect(marketplacesRefreshed(2)).toBe(
      "Refreshed 2 marketplace listings. Installed plugins were not changed.",
    );
  });

  it("names the marketplace that could not be updated and why", () => {
    expect(marketplaceRefreshFailed("acme", "network unreachable")).toBe(
      "Could not update marketplace acme: network unreachable",
    );
  });

  it("names one marketplace that failed in the singular, and several in the plural", () => {
    expect(marketplacesRefreshFailed(["acme"])).toBe("1 marketplace could not be updated: acme");
    expect(marketplacesRefreshFailed(["acme", "northwind"])).toBe(
      "2 marketplaces could not be updated: acme, northwind",
    );
  });
});

describe("the refusals of a marketplace build whose package.json cannot name it", () => {
  it("explains an owner with no name, what was not written, and how to set one", () => {
    expect(marketplaceOwnerHasNoName(PACKAGE_JSON)).toBe(
      [
        `A marketplace's owner must have a name, and no name could be read from 'author' in ${PACKAGE_JSON}.`,
        "Nothing was written: a marketplace.json whose 'owner.name' is empty is refused by this CLI's own reader, so the build would have reported success for a marketplace nobody can install from.",
        `Set 'author' in that file — either "Jane Doe <jane@example.com>" or { "name": "Jane Doe" } — and build again.`,
      ].join("\n\n"),
    );
  });

  it("explains an empty version, what was not written, and what to set it to", () => {
    expect(marketplaceHasNoVersion(PACKAGE_JSON)).toBe(
      [
        `A marketplace must have a version, and 'version' in ${PACKAGE_JSON} is empty.`,
        "Nothing was written: a marketplace.json whose 'version' is empty is refused by this CLI's own reader, so the build would have reported success for a marketplace nobody can install from.",
        `Set 'version' in that file — "0.1.0" if this is its first release — and build again.`,
      ].join("\n\n"),
    );
  });

  it("names each character a marketplace name may not carry, once", () => {
    expect(marketplaceNameNotPublishable("My_Market_", PACKAGE_JSON)).toBe(
      [
        `Marketplace name 'My_Market_', read from 'name' in ${PACKAGE_JSON}, is not a name a marketplace may publish under.`,
        "It carries 'M' and '_', which a marketplace name may not.",
        "A marketplace name is kebab-case: lowercase letters, numbers and hyphens, starting with a letter.",
        "Publish under a name of your own instead: 'npx agents-inc build marketplace --name <your-marketplace>'.",
      ].join("\n\n"),
    );
  });

  it("states only the rule when every character is allowed and the name breaks it another way", () => {
    expect(marketplaceNameNotPublishable("-market", PACKAGE_JSON)).toBe(
      [
        `Marketplace name '-market', read from 'name' in ${PACKAGE_JSON}, is not a name a marketplace may publish under.`,
        "A marketplace name is kebab-case: lowercase letters, numbers and hyphens, starting with a letter.",
        "Publish under a name of your own instead: 'npx agents-inc build marketplace --name <your-marketplace>'.",
      ].join("\n\n"),
    );
  });
});

describe("the refusals of a marketplace with no readable manifest", () => {
  const MANIFEST_REQUIRED =
    "Every marketplace other than the default one must publish a valid .claude-plugin/marketplace.json. Run 'npx agents-inc build plugins' and then 'npx agents-inc build marketplace' in that marketplace's repository, which write it.";

  it("says a source with no manifest is not a marketplace yet, and how to build one", () => {
    expect(marketplaceManifestMissing("github:acme/skills")).toBe(
      [
        "'github:acme/skills' has no .claude-plugin/marketplace.json, so it is not a marketplace yet.",
        MANIFEST_REQUIRED,
      ].join("\n\n"),
    );
  });

  it("carries the reader's own reason for a manifest it cannot read", () => {
    expect(marketplaceManifestUnreadable("github:acme/skills", "plugins: Required")).toBe(
      [
        "'github:acme/skills' has a .claude-plugin/marketplace.json this CLI cannot read:\nplugins: Required",
        MANIFEST_REQUIRED,
      ].join("\n\n"),
    );
  });
});

describe("the lines a registered project an uninstall skips is reported under", () => {
  it("says which project could not be updated and what it may still reference", () => {
    expect(registeredProjectUpdateSkipped(PROJECT_DIR)).toBe(
      `Could not update registered project at ${PROJECT_DIR} — its config may still reference the uninstalled global content`,
    );
  });

  it("gives each reason a project is skipped its own sentence", () => {
    expect(registeredProjectConfigUnreadable(PROJECT_DIR)).toBe(
      `Skipped ${PROJECT_DIR}: its config.ts can't be read.`,
    );
    expect(registeredProjectGone(PROJECT_DIR)).toBe(
      `Skipped ${PROJECT_DIR}: nothing is installed there any more.`,
    );
    expect(registeredProjectOnAnotherProvider(PROJECT_DIR)).toBe(
      `Skipped ${PROJECT_DIR}: it is another provider's installation.`,
    );
    expect(registeredProjectUpdateFailed(PROJECT_DIR)).toBe(
      `Skipped ${PROJECT_DIR}: updating it failed.`,
    );
  });

  it("carries the reason registered projects could not be updated at all", () => {
    expect(registeredProjectsUpdateFailed("EACCES: permission denied")).toBe(
      "Could not update registered projects — their configs may still reference the uninstalled global content: EACCES: permission denied",
    );
  });
});

describe("the errors a skill whose metadata.yaml cannot describe it produces", () => {
  const WAY_OUT =
    "Fix the file, or delete the skill directory — 'npx agents-inc doctor' reports every skill in this state.";

  it("details the skill, its file and the reason on two indented lines", () => {
    expect(skillMetadataUnusableDetail(UNUSABLE_REACT)).toBe(
      `  web-framework-react — ${UNUSABLE_REACT.metadataPath}\n    YAMLParseError: Unexpected scalar at line 3`,
    );
  });

  it("refuses a compile over one such skill, naming it in the singular", () => {
    expect(skillMetadataUnusableError([UNUSABLE_REACT])).toBe(
      [
        "The metadata.yaml of 'web-framework-react' does not describe that skill — the file and the reason are named above.",
        "A skill this file cannot describe is skipped when config-types.ts is regenerated, so compiling it would write agents around a skill the generated types never carry.",
        WAY_OUT,
      ].join("\n"),
    );
  });

  it("refuses a load of a saved config over several, naming them in the plural", () => {
    expect(savedSkillMetadataUnusableError([UNUSABLE_REACT, UNUSABLE_HONO])).toBe(
      [
        "The metadata.yaml of 'web-framework-react', 'api-framework-hono' does not describe those skills — the file and the reason are named above.",
        "A config entry naming a skill this file cannot describe is dropped as one this marketplace does not carry — and a file that can be repaired must not cost an install its record.",
        WAY_OUT,
      ].join("\n"),
    );
  });

  it("refuses an editor link until each file describes its skill", () => {
    expect(editorSkillMetadataUnusableError([UNUSABLE_HONO])).toBe(
      [
        "The metadata.yaml of 'api-framework-hono' does not describe that skill — the file and the reason are named above.",
        "The editor opens on what these files describe, so no link is made until each one describes its skill.",
        WAY_OUT,
      ].join("\n"),
    );
  });
});

describe("the lines that point a shared configuration at where it can be applied", () => {
  it("tells an installation without an id to apply one with edit --from", () => {
    expect(applySharedConfigHere(undefined, true)).toBe(
      "Then apply what it gives you with 'npx agents-inc edit --from <id>'.",
    );
  });

  it("tells a directory without an installation to install one with init --from", () => {
    expect(applySharedConfigHere(undefined, false)).toBe(
      "Then install what it gives you with 'npx agents-inc init --from <id>'.",
    );
  });

  it("hands an installation the edit --from command for the id it has", () => {
    expect(applySharedConfigHere("abc123", true)).toBe(
      "To apply it here instead, run 'npx agents-inc edit --from abc123'.",
    );
  });

  it("hands a directory without an installation the init --from command for the id it has", () => {
    expect(applySharedConfigHere("abc123", false)).toBe(
      "To install it here instead, run 'npx agents-inc init --from abc123'.",
    );
  });

  it("refuses init --from over an existing installation and points at edit --from", () => {
    expect(
      sharedConfigExistingInstall(`${PROJECT_DIR}/.agents-inc/claude/config.ts`, "abc123"),
    ).toBe(
      `An installation already exists at ${PROJECT_DIR}/.agents-inc/claude/config.ts. Run 'npx agents-inc uninstall' first — installing a shared configuration is a fresh setup, not a merge. To apply it here instead, run 'npx agents-inc edit --from abc123'.`,
    );
  });

  it("refuses to apply over an installation without a terminal to confirm at", () => {
    expect(sharedConfigNeedsTerminal("abc123")).toBe(
      [
        "Applying configuration 'abc123' removes whatever it leaves out, so it has to be confirmed — and there is no terminal here to confirm it at.",
        "Run 'npx agents-inc edit --from abc123' from a terminal, or 'npx agents-inc init --from abc123' in a clean directory, which installs without removing anything.",
      ].join("\n"),
    );
  });
});

describe("the lines share prints about what a shared id can carry", () => {
  it("lists each ejected skill that stops a share, indented, under the refusal", () => {
    expect(shareRefusesEjectedSkills([REACT, HONO])).toBe(
      [
        "This installation holds ejected skills, and ejected skills cannot be shared:",
        `  ${REACT}`,
        `  ${HONO}`,
        "Only plugins can be shared.",
      ].join("\n"),
    );
  });

  it("says an id naming a marketplace folder installs only where that folder exists", () => {
    expect(sharedIdNamesAFolder("/home/me/mk")).toBe(
      "This id names the marketplace folder /home/me/mk, so it installs only where that folder exists.",
    );
  });

  it("names every skill from another marketplace that a shared id leaves behind", () => {
    expect(sharedSkillsLeftBehind([REACT, HONO])).toBe(
      `A shared id names one marketplace, and these skill(s) come from another, so they will not install elsewhere: ${REACT}, ${HONO}`,
    );
  });

  it("points a folder marketplace at GitHub first, and any other at the editor's button", () => {
    expect(addMarketplaceInTheEditor("/home/me/mk", true)).toBe(
      "/home/me/mk is a folder on this machine, which the editor cannot read — push it to GitHub, then add it from the editor's Marketplace button.",
    );
    expect(addMarketplaceInTheEditor("github:acme/skills", false)).toBe(
      "Add github:acme/skills from the editor's Marketplace button.",
    );
  });
});

describe("the lines init --from prints about what a configuration brings", () => {
  it("lists each project-scoped skill and sub-agent a home-directory install cannot write", () => {
    expect(sharedConfigProjectScopeAtHome([REACT], [WEB_DEVELOPER])).toBe(
      [
        "This configuration cannot be installed here: the home directory is the global scope, and a global installation holds only global-scoped content — so these project-scoped entries have nowhere to be written:",
        `  skill ${REACT} (scope: project)`,
        "  sub-agent web-developer (scope: project)",
        "Run this from inside a project directory, or re-share it with each entry above at global scope.",
      ].join("\n"),
    );
  });

  it("counts and names the skills, sub-agents and carried skills it skipped or wrote", () => {
    expect(skippedUnknownSkills([REACT, HONO])).toBe(
      `Skipped 2 skill(s) this catalog does not know: ${REACT}, ${HONO}`,
    );
    expect(skippedUnknownAgents(["web-ghost", "api-ghost"])).toBe(
      "Skipped 2 unknown sub-agent(s): web-ghost, api-ghost",
    );
    expect(carriedSkillsWritten([REACT, HONO])).toBe(
      `Wrote 2 skill(s) this configuration carries: ${REACT}, ${HONO}`,
    );
  });

  it("says a project's copy gives way to the global one", () => {
    expect(projectCopyRemoved(REACT)).toBe(
      `${REACT}: this project's copy is removed; the global one takes over`,
    );
  });

  it("lists what the global install keeps as installed, and where to change it", () => {
    expect(keptAsInstalledGlobally([REACT], [WEB_DEVELOPER])).toBe(
      [
        "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
        `  skill ${REACT}`,
        "  sub-agent web-developer",
        "Change them with 'npx agents-inc edit' from your home directory.",
      ].join("\n"),
    );
  });

  it("lists each global sub-agent a project run adds to, with every skill it gains", () => {
    expect(addedToGlobalSubAgents([{ agentName: WEB_DEVELOPER, skillIds: [REACT, HONO] }])).toBe(
      [
        "Added to sub-agents in the global install — each keeps everything it already has, since a project run only adds to the global install:",
        `  sub-agent web-developer: + ${REACT}, ${HONO}`,
      ].join("\n"),
    );
  });

  it("lists the skills authored here that a configuration never carried", () => {
    expect(authoredHereKept([REACT, HONO])).toBe(
      [
        "Kept — written here rather than installed, so a shared configuration never carried them:",
        `  skill ${REACT}`,
        `  skill ${HONO}`,
      ].join("\n"),
    );
  });

  it("lists the skills this catalogue cannot place, and how to refresh it", () => {
    expect(unplaceableKept([REACT])).toBe(
      [
        "Kept — named by this configuration, and this catalogue cannot place them:",
        `  skill ${REACT}`,
        "Run 'npx agents-inc update' to refresh this installation's marketplace, then apply the configuration again.",
      ].join("\n"),
    );
  });

  it("names the sub-agent and category a kept skill is no longer assigned to", () => {
    expect(keptUnassigned(REACT, WEB_DEVELOPER, "web-framework")).toBe(
      `${REACT}: kept, no longer assigned to web-developer's web-framework`,
    );
  });
});

describe("the lines uninstall prints about what it cannot read or leaves behind", () => {
  it("names every unreadable config, then the doctor line in the plural", () => {
    expect(
      installationConfigsUnreadable([
        {
          configPath: `${PROJECT_DIR}/.agents-inc/claude/config.ts`,
          reason: "ParseError: Missing semicolon",
          scope: "project",
          scopeRoot: PROJECT_DIR,
        },
        {
          configPath: "/home/me/.agents-inc/claude/config.ts",
          reason: "ParseError: Unexpected token",
          scope: "global",
          scopeRoot: "/home/me",
        },
      ]),
    ).toBe(
      [
        `This project's config at '${PROJECT_DIR}/.agents-inc/claude/config.ts' could not be loaded: ParseError: Missing semicolon`,
        `There is no automatic repair for this — fix the file, or recreate the configuration by running 'npx agents-inc uninstall' from '${PROJECT_DIR}', which still works on a config it cannot read, then 'npx agents-inc init --from <id>' with an id from https://agentsinc.sh/editor.`,
        "The global installation's config at '/home/me/.agents-inc/claude/config.ts' could not be loaded: ParseError: Unexpected token",
        "There is no automatic repair for this — fix the file, or recreate the configuration by running 'npx agents-inc uninstall' from '/home/me', which still works on a config it cannot read, then 'npx agents-inc init --from <id>' with an id from https://agentsinc.sh/editor.",
        "'npx agents-inc doctor' reports the same files, alongside whatever else is wrong here.",
      ].join("\n"),
    );
  });

  it("says what an unreadable config may leave behind, with the loader's message", () => {
    expect(
      uninstallConfigUnreadable({
        scope: "global",
        message: "Config at 'x' could not be loaded: y",
      }),
    ).toBe(
      "Could not read the global config — plugins and compiled agents it lists may be left behind: Config at 'x' could not be loaded: y",
    );
  });

  it("refuses to uninstall without a terminal to confirm at, and names --yes", () => {
    expect(uninstallNeedsTerminal()).toBe(
      [
        "Uninstalling removes files, so it has to be confirmed — and there is no terminal here to confirm it at.",
        "Run 'npx agents-inc uninstall' from a terminal, or 'npx agents-inc uninstall --yes' to remove it without being asked.",
      ].join("\n"),
    );
  });

  it("refers to one kept agent as it, and to several as them", () => {
    expect(unmarkedAgentsKept(`${PROJECT_DIR}/.claude/agents`, 1)).toBe(
      `Kept 1 agent in ${PROJECT_DIR}/.claude/agents/ — no agents-inc marker, so this CLI did not compile it.`,
    );
    expect(unmarkedAgentsKept(`${OTHER_PROJECT_DIR}/.claude/agents`, 2)).toBe(
      `Kept 2 agents in ${OTHER_PROJECT_DIR}/.claude/agents/ — no agents-inc marker, so this CLI did not compile them.`,
    );
  });
});

describe("the words a scope and a layout are named in", () => {
  it("names the project scope and the global scope, sentence-cased as a label", () => {
    expect(scopeNoun("project")).toBe("this project");
    expect(scopeNoun("global")).toBe("the global installation");
    expect(scopeLabel("global")).toBe("The global installation");
  });

  it("says which folder a current layout is on", () => {
    expect(layoutIsCurrent("Skills", ".claude/skills")).toBe("Skills is on .claude/skills/");
  });

  it("refuses the retired source folder and names where it moves to", () => {
    expect(retiredSourceFolderUnsupported(".agents-inc/claude")).toBe(
      ".claude-src/ is no longer supported (agents-inc now serves Claude and Codex). Move it to .agents-inc/claude/.",
    );
  });
});
