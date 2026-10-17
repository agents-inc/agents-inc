/**
 * With both provider folders under one root, a read asked for one provider by name lands in its
 * folder. Configs are told apart by `name`, since `configPath` agrees with itself either way.
 */

import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { getProjectConfigPath } from "../install-base-dir.js";

const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

const CLAUDE_INSTALLATION_NAME = "the-claude-installation";
const CODEX_INSTALLATION_NAME = "the-codex-installation";

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

  async function plantConfig(folder: string, name: string): Promise<void> {
    await writeTestTsConfig(root, buildProjectConfig({ name }), folder);
  }

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
    // Control for the two specs above.
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
