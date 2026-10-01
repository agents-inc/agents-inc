/**
 * Where an installation puts things, answered per PROVIDER — every role pinned as a literal.
 *
 * The layout module already answered where a scope's SOURCE folder is; the roles this file imports
 * are what it gained. What has NOT moved is the call sites: `.claude/agents`, `.claude/skills`,
 * `.claude/plugins` and `.claude/settings.json` are still composed from
 * `CLAUDE_DIR` and `LOCAL_SKILLS_PATH` at each site that needs one, and this is the census that
 * finds them — run from `packages/cli`, read-only:
 *
 * ```
 * grep -rn "CLAUDE_DIR\|LOCAL_SKILLS_PATH" src --include='*.ts' --include='*.tsx' \
 *   | grep -v '\.test\.' | grep -v __tests__ | grep -E "path\.(join|resolve)|\$\{"
 * ```
 *
 * **No figure is written here, because the module this spec pins is itself one of the hits** — so
 * any number is wrong from the commit that routes the first call site through it, and a reader
 * cannot tell a stale one from a fresh one. The count that stood here until 2026-09-21 — "28 lines
 * in 17 files, of which 24 in 14 files compose a path and 4 are message text" — reproduced from
 * nothing: the command already applies the composition filter, so it cannot answer a wider figure
 * at all, and on the day it was re-run it answered 23 lines in 14 files. Dropping the filter
 * answers 50 lines in 18 files, most of them import statements.
 *
 * **Every literal below is written out rather than imported.** These are directories on people's
 * disks and names inside other programs' configuration; an assertion that imported the constant
 * the product joins would move with it and could never fail. `install-layout.test.ts` beside this
 * file states the same rule for the source folder's two names.
 *
 * **What is MEASURED and what is this spec's PROPOSAL**, because the difference decides who may
 * overturn a line here. Measured on the pinned `@openai/codex@0.155.1` and recorded in
 * `todo/plans/CLI-codex-provider-plan.md`:
 *
 * - a Codex sub-agent role registers from `$CODEX_HOME/agents/<name>.toml` AND from
 *   `<project-root>/.codex/agents/<anything>.toml` — the latter only while the GLOBAL
 *   `$CODEX_HOME/config.toml` holds `[projects."<exact absolute path>"] trust_level = "trusted"`.
 *   **This overturns the measurement this file pinned until 2026-09-21**, which read "never
 *   registers, trusted or not" and made `agentsDir` `null` at Codex project scope; it was settled
 *   by a tie-break over 23 captured runs after two lanes disagreed, and every earlier false
 *   negative was a TRUST failure rather than a registration one. The four silent kill switches and
 *   the reason a re-measurement contaminates itself are in `codexProjectRoles`' own docblock;
 * - what stays UNMEASURED is whether a spawned sub-agent's context receives the role's
 *   `developer_instructions`. Registration is proven and delivery is not, so nothing here asserts
 *   that a role in either directory reaches a model;
 * - a project skill is a committed file at `<repo>/.agents/skills/<name>/SKILL.md`, read in that
 *   repo and nowhere else;
 * - eject+global writes `$CODEX_HOME/skills` (D14), not `~/.agents/skills`;
 * - plugin+project is not offered on Codex (D3), so a Codex project has no plugins directory;
 * - Codex records installed plugins in `$CODEX_HOME/config.toml`, with no registry JSON file
 *   anywhere — which is why `pluginRegistry` is `null` for Codex and a real file for Claude.
 *
 * Proposals, each carrying its reason where it is declared and each listed in this lane's report
 * as a decision the implementer or the owner may overturn: the parameter order, `skillsPathPrefix`
 * for a relocated `$CODEX_HOME`, what `ownedRoots` means, whether `permissionFiles` carries
 * `settings.local.json`, and an empty `CODEX_HOME` meaning unset.
 *
 * **The provider is a required argument on every role.** `resolveInstallPaths(projectDir, scope)`
 * defaults its scope and has ~20 call sites; a host role that defaulted its provider would let a
 * missed call site write into `.claude/` and exit 0 — the plan's Risk 7, one level down from the
 * `DEFAULT_PROVIDER` deletion that C2 uses as its own proof.
 *
 * **The import list below IS the roster assertion.** A role this step does not add cannot be
 * imported, so the module graph reports it by name before a single assertion runs; a separate
 * `typeof x === "function"` roster would only restate what linking already refused.
 */

import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Provider } from "../../../consts.js";
import type { SkillScope } from "../../../types/config.js";
import { renderAgentMd } from "../../__tests__/content-generators.js";
import {
  agentCodec,
  agentsDir,
  ownedRoots,
  permissionFiles,
  pluginRegistry,
  pluginsDir,
  skillsDir,
  skillsPathPrefix,
  userConfigRoot,
} from "../install-layout.js";

/** The environment variable that relocates everything Codex keeps for a user. */
const CODEX_HOME = "CODEX_HOME";

/** The two roots every cell below is composed from. Absolute, and never touched on disk. */
const HOME = path.resolve(path.sep, "fake-home");
const PROJECT = path.resolve(path.sep, "fake-home", "a-project");

/** A `$CODEX_HOME` pointing OUTSIDE the home directory, which is the whole point of the variable. */
const RELOCATED_CODEX_HOME = path.resolve(path.sep, "elsewhere", "codex-state");

/** Where Codex keeps a user's state when `CODEX_HOME` says nothing, and a project's own beside it. */
const CODEX_DIR = ".codex";

/** Where Claude Code keeps an installation's agents, skills, plugins and settings. */
const CLAUDE_DIR = ".claude";

/** The directory name a Codex project's skills are committed under, read in that repo only. */
const CODEX_PROJECT_SKILLS = ".agents/skills";

/** The source folder, per provider, as the rename writes it. */
const CLAUDE_SOURCE = ".agents-inc/claude";
const CODEX_SOURCE = ".agents-inc/codex";

/** The file Claude Code records every plugin install in, inside its plugins directory. */
const CLAUDE_PLUGIN_REGISTRY = "installed_plugins.json";

/** Codex's single configuration file: marketplaces, plugin switches, trust and hooks alike. */
const CODEX_CONFIG = "config.toml";

/**
 * A compiled Claude agent, and one a user wrote — the two inputs the codec's marker test has to
 * tell apart. The marker line is written out rather than imported from `provenanceMarker()`: an
 * assertion importing the string the product stamps moves with it and could never fail, and this
 * one is a claim that a file on someone's disk from an earlier release is still recognised.
 *
 * The compiled file is spelled line by line rather than through `renderAgentMd`, because its
 * subject is a POSITION: the marker counts only as the first body line, directly under the
 * closing fence, and the renderer puts a blank line there.
 */
const COMPILED_CLAUDE_AGENT = [
  "---",
  "name: web-developer",
  "---",
  "<!-- Generated by agents-inc — do not edit; compile rewrites this file -->",
  "",
  "# web-developer",
  "",
].join("\n");

const HAND_WRITTEN_CLAUDE_AGENT = renderAgentMd("mine");

/**
 * Every answer one (provider, scope) cell gives, as one value so a cell is compared whole.
 *
 * `null` is a role a provider does not have at this scope, and it is never an absence in the
 * arity of this type: the field is present and says `null`, so a reader sees which role went
 * missing and a swap between two roles cannot pass.
 */
type HostRoles = {
  userConfigRoot: string;
  agentsDir: string;
  skillsDir: string;
  skillsPathPrefix: string;
  pluginsDir: string | null;
  pluginRegistry: string | null;
  permissionFiles: string[];
  ownedRoots: string[];
};

/** Asks every role for one cell. No logic of its own — the calls are the subject. */
function rolesFor(provider: Provider, scope: SkillScope, projectDir: string): HostRoles {
  return {
    userConfigRoot: userConfigRoot(provider, scope, projectDir),
    agentsDir: agentsDir(provider, scope, projectDir),
    skillsDir: skillsDir(provider, scope, projectDir),
    skillsPathPrefix: skillsPathPrefix(provider, scope, projectDir),
    pluginsDir: pluginsDir(provider, scope, projectDir),
    pluginRegistry: pluginRegistry(provider, scope, projectDir),
    permissionFiles: permissionFiles(provider, scope, projectDir),
    ownedRoots: ownedRoots(provider, scope, projectDir),
  };
}

/**
 * Claude at global scope. Every value is what the tree composes today, which is the whole point:
 * C1 changes no Claude byte, and a cell here that moves is a Claude user's installation moving.
 *
 * `permissionFiles` carries both spellings because `lib/permission-checker.tsx` reads both —
 * `settings.json` and the developer's own `settings.local.json` overlay beside it. Only the first
 * is ever written by this CLI, which is why the golden trees record one of the two.
 *
 * `ownedRoots` is the pair of roots that SAY which provider an installation belongs to — the
 * host's state root and the source folder — not a list of directories uninstall may remove.
 * `.claude/` holds a user's own agents and skills as well as ours, and uninstall already decides
 * per directory whether it is empty enough to go.
 */
const CLAUDE_GLOBAL: HostRoles = {
  userConfigRoot: path.join(HOME, CLAUDE_DIR),
  agentsDir: path.join(HOME, CLAUDE_DIR, "agents"),
  skillsDir: path.join(HOME, CLAUDE_DIR, "skills"),
  skillsPathPrefix: ".claude/skills",
  pluginsDir: path.join(HOME, CLAUDE_DIR, "plugins"),
  pluginRegistry: path.join(HOME, CLAUDE_DIR, "plugins", CLAUDE_PLUGIN_REGISTRY),
  permissionFiles: [
    path.join(HOME, CLAUDE_DIR, "settings.json"),
    path.join(HOME, CLAUDE_DIR, "settings.local.json"),
  ],
  ownedRoots: [path.join(HOME, CLAUDE_DIR), path.join(HOME, CLAUDE_SOURCE)],
};

/** Claude at project scope: the same shape under the project directory, and nothing else differs. */
const CLAUDE_PROJECT: HostRoles = {
  userConfigRoot: path.join(PROJECT, CLAUDE_DIR),
  agentsDir: path.join(PROJECT, CLAUDE_DIR, "agents"),
  skillsDir: path.join(PROJECT, CLAUDE_DIR, "skills"),
  skillsPathPrefix: ".claude/skills",
  pluginsDir: path.join(PROJECT, CLAUDE_DIR, "plugins"),
  pluginRegistry: path.join(PROJECT, CLAUDE_DIR, "plugins", CLAUDE_PLUGIN_REGISTRY),
  permissionFiles: [
    path.join(PROJECT, CLAUDE_DIR, "settings.json"),
    path.join(PROJECT, CLAUDE_DIR, "settings.local.json"),
  ],
  ownedRoots: [path.join(PROJECT, CLAUDE_DIR), path.join(PROJECT, CLAUDE_SOURCE)],
};

/**
 * Codex at global scope, built from whichever root `$CODEX_HOME` names.
 *
 * The SOURCE folder is not built from it. `~/.agents-inc/codex/` is this product's own pair and
 * lives under HOME like Claude's; `$CODEX_HOME` relocates the HOST's state and nothing else. That
 * split is the shape the layout has never had to model, and it is why these roles take a scope and
 * a project directory rather than one pre-joined base the way `resolveInstallPaths` does.
 *
 * `skillsPathPrefix` is the skills directory as a user writes it FROM THE SCOPE ROOT, which is
 * `.codex/skills` while `$CODEX_HOME` sits in its default place. A relocated one has no
 * scope-root-relative spelling, and the absolute path is what it falls back to — see the spec
 * below. That fallback is this file's proposal, not a measurement.
 */
function codexGlobal(codexHome: string): HostRoles {
  return {
    userConfigRoot: codexHome,
    agentsDir: path.join(codexHome, "agents"),
    skillsDir: path.join(codexHome, "skills"),
    skillsPathPrefix:
      codexHome === path.join(HOME, CODEX_DIR) ? ".codex/skills" : path.join(codexHome, "skills"),
    pluginsDir: path.join(codexHome, "plugins"),
    pluginRegistry: null,
    permissionFiles: [path.join(codexHome, CODEX_CONFIG)],
    ownedRoots: [codexHome, path.join(HOME, CODEX_SOURCE)],
  };
}

/**
 * Codex at project scope, where `agentsDir` is a real directory under a CONDITION and two roles
 * are `null`.
 *
 * `agentsDir` is `<repo>/.codex/agents` and was pinned as `null` here until 2026-09-21. A role
 * file there registers on the pinned 0.155.1 — no `.git` needed, cwd may be a subdirectory — but
 * only while the GLOBAL `$CODEX_HOME/config.toml` holds
 * `[projects."<exact absolute path>"] trust_level = "trusted"`. **Nothing in this file asserts
 * that condition, and no assertion here should be read as saying the host will pick the file up:**
 * these roles answer where a path IS, and the trust entry lives in a file at another scope that
 * this module deliberately does not compose. The condition, its four silent kill switches and the
 * contamination trap are in `codexProjectRoles`' docblock in the module under test.
 *
 * `pluginsDir` is `null` because Codex installs plugins for a machine and not for a project: there
 * is no `--scope` flag on any subcommand, and `codex plugin add` run inside a project writes the
 * switch to the global config and silently un-scopes it. Plugin+project is refused by name (D3).
 *
 * `$CODEX_HOME` does not reach this cell at all: a project's own Codex state is `<repo>/.codex/`,
 * which is why the specs below drive it with the variable set and unset and expect no difference.
 */
const CODEX_PROJECT: HostRoles = {
  userConfigRoot: path.join(PROJECT, CODEX_DIR),
  agentsDir: path.join(PROJECT, CODEX_DIR, "agents"),
  skillsDir: path.join(PROJECT, CODEX_PROJECT_SKILLS),
  skillsPathPrefix: CODEX_PROJECT_SKILLS,
  pluginsDir: null,
  pluginRegistry: null,
  permissionFiles: [path.join(PROJECT, CODEX_DIR, CODEX_CONFIG)],
  ownedRoots: [
    path.join(PROJECT, CODEX_DIR),
    path.join(PROJECT, CODEX_PROJECT_SKILLS),
    path.join(PROJECT, CODEX_SOURCE),
  ],
};

/** Restores `CODEX_HOME` to the state the suite was started in, absent included. */
function captureCodexHome(): () => void {
  const original = process.env[CODEX_HOME];

  return () => {
    if (original === undefined) delete process.env[CODEX_HOME];
    else process.env[CODEX_HOME] = original;
  };
}

describe("the install layout answers the host roles per provider", () => {
  let restoreCodexHome: () => void;

  beforeEach(() => {
    restoreCodexHome = captureCodexHome();
    delete process.env[CODEX_HOME];
    vi.spyOn(os, "homedir").mockReturnValue(HOME);
  });

  afterEach(() => {
    restoreCodexHome();
    vi.mocked(os.homedir).mockRestore();
  });

  describe("Claude, which must not move", () => {
    it("answers the global roles where a Claude installation already writes them", () => {
      expect(
        rolesFor("claude", "global", PROJECT),
        "a Claude global role that moved is every existing installation's own directory moving",
      ).toStrictEqual(CLAUDE_GLOBAL);
    });

    it("answers the project roles under the project directory", () => {
      expect(
        rolesFor("claude", "project", PROJECT),
        "a Claude project role that moved is every existing installation's own directory moving",
      ).toStrictEqual(CLAUDE_PROJECT);
    });

    it("ignores CODEX_HOME entirely, at either scope", () => {
      process.env[CODEX_HOME] = RELOCATED_CODEX_HOME;

      expect(
        {
          global: rolesFor("claude", "global", PROJECT),
          project: rolesFor("claude", "project", PROJECT),
        },
        "a variable belonging to another host reached a Claude path, so a developer's shell decides where this CLI writes",
      ).toStrictEqual({ global: CLAUDE_GLOBAL, project: CLAUDE_PROJECT });
    });
  });

  describe("Codex at global scope, with CODEX_HOME unset", () => {
    it("answers under the home directory's own .codex, and keeps the source pair under HOME", () => {
      expect(
        rolesFor("codex", "global", PROJECT),
        "Codex's default state directory is <home>/.codex, and the agents-inc source pair is not under it",
      ).toStrictEqual(codexGlobal(path.join(HOME, CODEX_DIR)));
    });

    it("reads an empty CODEX_HOME as no answer rather than as the root of the filesystem", () => {
      process.env[CODEX_HOME] = "";

      expect(
        rolesFor("codex", "global", PROJECT),
        "an exported-but-empty variable would otherwise root every Codex path at the process's working directory",
      ).toStrictEqual(codexGlobal(path.join(HOME, CODEX_DIR)));
    });
  });

  describe("Codex at global scope, with CODEX_HOME set", () => {
    it("answers under the relocated root, while the source pair stays under HOME", () => {
      process.env[CODEX_HOME] = RELOCATED_CODEX_HOME;

      expect(
        rolesFor("codex", "global", PROJECT),
        "CODEX_HOME relocates the HOST's state; ~/.agents-inc/codex is this product's own pair and does not move with it",
      ).toStrictEqual(codexGlobal(RELOCATED_CODEX_HOME));
    });

    it("is read at call time, so a value set after the module loaded is the one that answers", () => {
      const before = skillsDir("codex", "global", PROJECT);
      process.env[CODEX_HOME] = RELOCATED_CODEX_HOME;

      expect(
        { before, after: skillsDir("codex", "global", PROJECT) },
        "a CODEX_HOME frozen at module load answers from whichever value the first import saw — the defect `globalInstallRoot` carries its own note about",
      ).toStrictEqual({
        before: path.join(HOME, CODEX_DIR, "skills"),
        after: path.join(RELOCATED_CODEX_HOME, "skills"),
      });
    });
  });

  describe("Codex at project scope", () => {
    it("has its own agents directory and no plugins directory, and says so by name", () => {
      expect(
        rolesFor("codex", "project", PROJECT),
        "a project role file registers from <repo>/.codex/agents under a trusted project entry, while a project plugins directory names a placement Codex cannot install at all",
      ).toStrictEqual(CODEX_PROJECT);
    });

    /**
     * The overturned measurement, named in the assertion that would have carried it. Pinning the
     * agents directory only inside the whole-cell comparison above leaves the correction invisible
     * to anyone searching for the claim it replaces — the cell is one `toStrictEqual` and a reader
     * re-deriving "does a project role register" finds nothing addressed to them.
     */
    it("no longer answers null for the agents directory it was pinned absent at", () => {
      expect(
        agentsDir("codex", "project", PROJECT),
        "pinned null until 2026-09-21 on a measurement a 23-run tie-break overturned: a project role DOES register, while the user's global config trusts this exact path",
      ).toBe(path.join(PROJECT, CODEX_DIR, "agents"));
    });

    it("does not move when CODEX_HOME does, because a project's Codex state is its own", () => {
      process.env[CODEX_HOME] = RELOCATED_CODEX_HOME;

      expect(
        rolesFor("codex", "project", PROJECT),
        "a project role built from CODEX_HOME would follow a developer's shell out of the repository",
      ).toStrictEqual(CODEX_PROJECT);
    });
  });

  /**
   * The paired allowed case for the `null`s above, in this file rather than in another.
   *
   * A refusal pinned on its own cannot tell a correctly-scoped absence from one that has swallowed
   * its whole domain: `pluginsDir` returning `null` for every cell satisfies the spec above and
   * leaves every installation with nowhere to install a plugin, with every assertion green.
   *
   * **`agentsDir` is no longer one of the pair**, and that is the correction rather than a gap: it
   * answers a directory at every cell now, so there is no refusal of it left to control for. Its
   * own pin is "no longer answers null for the agents directory it was pinned absent at" above,
   * and the whole-cell comparisons are what would catch it going absent again.
   */
  describe("the role that is null on Codex project scope is not null everywhere", () => {
    it("gives Codex a plugins directory at global scope", () => {
      expect(
        rolesFor("codex", "global", PROJECT).pluginsDir,
        "the role answered null at every scope, so the refusal has swallowed the whole provider",
      ).toBe(path.join(HOME, CODEX_DIR, "plugins"));
    });

    it("gives Claude one at project scope", () => {
      expect(
        rolesFor("claude", "project", PROJECT).pluginsDir,
        "a provider-blind null would take Claude's project plugins with it",
      ).toBe(path.join(PROJECT, CLAUDE_DIR, "plugins"));
    });
  });

  /**
   * The codec, which is how a compiled agent is recognised on disk.
   *
   * Only the two literal members are pinned here. `hasMarker` is the existing provenance test for
   * Claude and gets one positive and one negative case; its Codex half and `validate` for either
   * provider belong to C5, which is where the TOML renderer and the Codex agent schema land —
   * pinning a validator against a schema that does not exist would assert about nothing.
   */
  describe("the agent codec", () => {
    it("names each provider's compiled-agent extension and the glob that lists them", () => {
      expect(
        {
          claude: {
            extension: agentCodec("claude").extension,
            listGlob: agentCodec("claude").listGlob,
          },
          codex: {
            extension: agentCodec("codex").extension,
            listGlob: agentCodec("codex").listGlob,
          },
        },
        "the extension a compiled agent carries decides which files uninstall removes and which files doctor reads",
      ).toStrictEqual({
        claude: { extension: ".md", listGlob: "*.md" },
        codex: { extension: ".toml", listGlob: "*.toml" },
      });
    });

    it("carries the same members for both providers", () => {
      expect(
        Object.keys(agentCodec("codex")).sort(),
        "a codec member present for one provider and absent for the other is a call site that works on one host only",
      ).toStrictEqual(Object.keys(agentCodec("claude")).sort());
    });

    it("recognises a Claude agent this CLI compiled, and leaves a hand-written one alone", () => {
      const codec = agentCodec("claude");

      expect(
        {
          compiled: codec.hasMarker(COMPILED_CLAUDE_AGENT),
          handWritten: codec.hasMarker(HAND_WRITTEN_CLAUDE_AGENT),
        },
        "the marker is the only thing that identifies this CLI's own output once the config naming it is gone",
      ).toStrictEqual({ compiled: true, handWritten: false });
    });
  });
});
