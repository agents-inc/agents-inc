/**
 * Which config a run reads when a scope holds an installation of each provider, and what the
 * read tells the caller about the one it landed on.
 *
 * Step C2 of `todo/plans/CLI-codex-provider-plan.md` — "the provider reaches every path". The
 * provider is not a field in `config.ts`: the FOLDER is the answer, so `.agents-inc/claude/` and
 * `.agents-inc/codex/` under one root are TWO installations, each of exactly one provider, and
 * every question about where something goes has to say which of them it is about.
 *
 * **The state these specs are written for is the one the plan names as its Risk 8:** with both
 * folders on disk, `getProjectConfigPath(dir)` takes no provider at all, so the preference order
 * inside `sourceFolderInUse` picks Claude and every command silently acts on the Claude half of a
 * root that holds two installations. Nothing reports it, and nothing can: the answer is a path,
 * it exists, and it parses.
 *
 * So each spec below plants BOTH folders and asks for one of them BY NAME. A single-provider root
 * would be green under the defaulting code and the threaded code alike, which is why the
 * one-installation cases sit here as the control rather than as the subject.
 *
 * **The two config files are told apart by what they call themselves**, not by where they were
 * found: a read that came back with the other provider's `name` went to the wrong folder, and an
 * assertion comparing only paths cannot see that — `configPath` is built by the same call whose
 * routing is in question, so it agrees with itself whichever folder it chose.
 *
 * The folder names are written out as literals throughout. They are text on people's disks, and
 * an assertion importing the constant the product joins would move with it and could never fail —
 * the rule `install-layout.test.ts` states for the same two names.
 */

import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { getProjectConfigPath } from "../install-base-dir.js";

/** The new layout, per provider, as it is written on disk and shown to a user. */
const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

/** The name every installation made before the source-folder rename still carries. */
const LEGACY_SOURCE_REL = ".claude-src";

/**
 * What each installation calls itself.
 *
 * Distinct strings rather than one shared fixture, because they are the only evidence a read
 * landed in the folder it was asked for: two identical configs make a wrong turn invisible.
 */
const CLAUDE_INSTALLATION_NAME = "the-claude-installation";
const CODEX_INSTALLATION_NAME = "the-codex-installation";

/** What a read answered, in the three parts that say whether it went to the right folder. */
type ConfigRead = {
  name: string | undefined;
  provider: string | undefined;
  configPath: string | undefined;
};

describe("the config path and the config read, per provider", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("cc-provider-config-path-");
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  /** Writes a real config.ts, calling itself `name`, into `folder` under the temp root. */
  async function plantConfig(folder: string, name: string): Promise<void> {
    await writeTestTsConfig(root, buildProjectConfig({ name }), folder);
  }

  /** The three parts of a read, in a shape one assertion can compare whole. */
  async function readAs(provider: "claude" | "codex"): Promise<ConfigRead> {
    const loaded = await loadProjectConfigFromDir(root, provider);
    return {
      name: loaded?.config.name,
      provider: loaded?.provider,
      configPath: loaded?.configPath,
    };
  }

  describe("a root holding an installation of each provider", () => {
    beforeEach(async () => {
      await plantConfig(CLAUDE_SOURCE_REL, CLAUDE_INSTALLATION_NAME);
      await plantConfig(CODEX_SOURCE_REL, CODEX_INSTALLATION_NAME);
    });

    it("names each provider's own config file", () => {
      expect({
        claude: getProjectConfigPath(root, "claude"),
        codex: getProjectConfigPath(root, "codex"),
      }).toStrictEqual({
        claude: path.join(root, ".agents-inc", "claude", "config.ts"),
        codex: path.join(root, ".agents-inc", "codex", "config.ts"),
      });
    });

    it("reads the Claude installation when Claude is what was asked for", async () => {
      expect(await readAs("claude")).toStrictEqual({
        name: CLAUDE_INSTALLATION_NAME,
        provider: "claude",
        configPath: path.join(root, ".agents-inc", "claude", "config.ts"),
      });
    });

    it("reads the Codex installation when Codex is what was asked for", async () => {
      expect(
        await readAs("codex"),
        "a root holding two installations answered with the other one — the read took the preference order's winner rather than the provider it was given",
      ).toStrictEqual({
        name: CODEX_INSTALLATION_NAME,
        provider: "codex",
        configPath: path.join(root, ".agents-inc", "codex", "config.ts"),
      });
    });
  });

  describe("a root holding one installation", () => {
    /**
     * The control the two specs above need, and it discriminates in the direction they cannot:
     * a read that answered the asked-for provider by ALWAYS answering its folder would satisfy
     * them both, and would report a Codex installation on a root that holds only a Claude one.
     */
    it("reads the one that is there, and finds nothing under the provider that is not", async () => {
      await plantConfig(CLAUDE_SOURCE_REL, CLAUDE_INSTALLATION_NAME);

      expect({ claude: await readAs("claude"), codex: await readAs("codex") }).toStrictEqual({
        claude: {
          name: CLAUDE_INSTALLATION_NAME,
          provider: "claude",
          configPath: path.join(root, ".agents-inc", "claude", "config.ts"),
        },
        codex: { name: undefined, provider: undefined, configPath: undefined },
      });
    });

    /**
     * A pre-rename installation is Claude's and is read where it sits. The provider a caller is
     * handed back says which installation it holds, never which folder name it was found under —
     * so `.claude-src/` answers `claude` exactly as `.agents-inc/claude/` does.
     */
    it("reads a legacy folder as the Claude installation it is", async () => {
      await plantConfig(LEGACY_SOURCE_REL, CLAUDE_INSTALLATION_NAME);

      expect(await readAs("claude")).toStrictEqual({
        name: CLAUDE_INSTALLATION_NAME,
        provider: "claude",
        configPath: path.join(root, ".claude-src", "config.ts"),
      });
    });
  });

  describe("a root holding neither", () => {
    it("still names where each provider's config would go, and reads neither", async () => {
      expect({
        paths: {
          claude: getProjectConfigPath(root, "claude"),
          codex: getProjectConfigPath(root, "codex"),
        },
        reads: { claude: await readAs("claude"), codex: await readAs("codex") },
      }).toStrictEqual({
        paths: {
          claude: path.join(root, ".agents-inc", "claude", "config.ts"),
          codex: path.join(root, ".agents-inc", "codex", "config.ts"),
        },
        reads: {
          claude: { name: undefined, provider: undefined, configPath: undefined },
          codex: { name: undefined, provider: undefined, configPath: undefined },
        },
      });
    });
  });
});
