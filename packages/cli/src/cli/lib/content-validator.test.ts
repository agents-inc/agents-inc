import path from "path";
import { mkdir, realpath, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listInstalledArtifacts,
  validateInstalledAgents,
  validateInstalledPlugins,
  validateProjectConfigFile,
  validateRegisteredSources,
} from "./content-validator";
import { getInstalledPluginsRegistryPath, getUserPluginsDir } from "./plugins/index";
import { resolveInstallPaths } from "./installation/index";
import { buildProjectConfig, buildSourceConfig } from "./__tests__/factories/config-factories";
import { renderUnparseableConfigTs } from "./__tests__/factories/unloadable-config-factories";
import { renderAgentMd } from "./__tests__/content-generators";
import { writeRawTestConfig, writeTestTsConfig } from "./__tests__/helpers/config-io";
import { useFakeHome } from "./__tests__/helpers/isolated-home";
import { cleanupTempDir, createTempDir } from "./__tests__/test-fs-utils";
import {
  cleanupTestSource,
  createTestSource,
  type TestDirs,
} from "./__tests__/fixtures/create-test-source";
import { DEFAULT_SOURCE } from "./configuration";
import { CLAUDE_DIR, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE, STANDARD_DIRS } from "../consts";

/** The parser's own words for the unparseable fixture, which the finding must carry. */
const PARSER_REASON = "Failed to load config from";

describe("content-validator", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-content-validator-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    projectDir = await realpath(projectDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  describe("validateProjectConfigFile", () => {
    it("counts only the configs in play that are there", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "project" }));

      expect(await validateProjectConfigFile(projectDir)).toStrictEqual({
        count: 1,
        issues: [],
        notes: [],
      });
    });

    it("names an unreadable project config by its scope and full path", async () => {
      const configPath = await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

      const { issues } = await validateProjectConfigFile(projectDir);

      expect(issues).toStrictEqual([
        {
          severity: "error",
          file: `This project's ${configPath}`,
          message: expect.stringContaining(`exists but could not be loaded: ${PARSER_REASON}`),
        },
      ]);
    });

    it("names an unreadable global config under the home directory as ~", async () => {
      await writeRawTestConfig(home.dir, renderUnparseableConfigTs());

      const { issues } = await validateProjectConfigFile(projectDir);

      expect(issues.map(({ file }) => file)).toStrictEqual([
        `The global installation's ~${path.sep}${path.join(".agents-inc", "claude", "config.ts")}`,
      ]);
    });
  });

  describe("validateRegisteredSources", () => {
    let marketplace: TestDirs | undefined;

    afterEach(async () => {
      await cleanupTestSource(marketplace);
      marketplace = undefined;
    });

    it("skips the remote default marketplace by name, validating nothing", async () => {
      expect(await validateRegisteredSources(projectDir)).toStrictEqual({
        count: 0,
        issues: [],
        notes: [`marketplace (${DEFAULT_SOURCE}) — skipped (remote)`],
      });
    });

    it("validates a local marketplace once, counting its skills", async () => {
      marketplace = await createTestSource();
      await writeTestTsConfig(
        projectDir,
        buildSourceConfig({ marketplace: marketplace.sourceDir }),
      );

      const validation = await validateRegisteredSources(projectDir);

      expect(validation.count).toBe(1);
      expect(validation.notes).toStrictEqual([
        expect.stringMatching(
          new RegExp(`^marketplace \\(${marketplace.sourceDir}\\) — \\d+ skills?$`),
        ),
      ]);
    });

    it("validates the directory the command runs in once when it is the marketplace itself", async () => {
      await mkdir(path.join(projectDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });
      await writeTestTsConfig(projectDir, buildSourceConfig({ marketplace: projectDir }));

      const validation = await validateRegisteredSources(projectDir);

      expect(validation.count).toBe(1);
      expect(validation.notes).toStrictEqual([`marketplace (${projectDir}) — 0 skills`]);
    });

    it("validates the directory the command runs in as the current directory when it is a marketplace", async () => {
      await mkdir(path.join(projectDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

      const validation = await validateRegisteredSources(projectDir);

      expect(validation.notes).toStrictEqual([
        `current directory (${projectDir}) — 0 skills`,
        `marketplace (${DEFAULT_SOURCE}) — skipped (remote)`,
      ]);
    });

    it("reports a local marketplace it could not validate as failed, naming why", async () => {
      marketplace = await createTestSource();
      await writeRawTestConfig(marketplace.sourceDir, renderUnparseableConfigTs(), ".agents-inc");
      await writeTestTsConfig(
        projectDir,
        buildSourceConfig({ marketplace: marketplace.sourceDir }),
      );

      const validation = await validateRegisteredSources(projectDir);

      expect(validation.notes).toStrictEqual([`marketplace (${marketplace.sourceDir}) — failed`]);
      expect(validation.issues).toStrictEqual([
        {
          severity: "error",
          file: marketplace.sourceDir,
          message: expect.stringContaining(PARSER_REASON),
        },
      ]);
    });
  });

  describe("validateInstalledPlugins", () => {
    async function plantPlugin(pluginsDir: string, name: string): Promise<string> {
      const pluginDir = path.join(pluginsDir, name);
      await mkdir(path.join(pluginDir, PLUGIN_MANIFEST_DIR), { recursive: true });
      await writeFile(
        path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
        JSON.stringify({ name, description: `${name} plugin` }),
      );
      await writeFile(path.join(pluginDir, "README.md"), `# ${name}`);
      return pluginDir;
    }

    it("validates nothing in a plugins folder holding no plugin", async () => {
      await mkdir(path.join(getUserPluginsDir(), "not-a-plugin"), { recursive: true });

      expect(await validateInstalledPlugins(projectDir)).toStrictEqual({
        count: 0,
        issues: [],
        notes: [],
      });
    });

    it("validates each plugin the folder holds, noting nothing", async () => {
      await plantPlugin(getUserPluginsDir(), "valid-plugin");

      expect(await validateInstalledPlugins(projectDir)).toStrictEqual({
        count: 1,
        issues: [],
        notes: [],
      });
    });

    it("reports a registry it cannot read at its home-relative path", async () => {
      const registryPath = getInstalledPluginsRegistryPath(getUserPluginsDir());
      await mkdir(path.dirname(registryPath), { recursive: true });
      await writeFile(registryPath, "{ not json");

      const validation = await validateInstalledPlugins(projectDir);

      expect(validation).toStrictEqual({
        count: 0,
        issues: [
          {
            severity: "error",
            file: `~${path.sep}${path.join(CLAUDE_DIR, "plugins", "installed_plugins.json")}`,
            message: expect.any(String),
          },
        ],
        notes: [],
      });
    });

    it("validates each plugin the registry records, noting nothing", async () => {
      const pluginsDir = getUserPluginsDir();
      const installPath = await plantPlugin(path.join(pluginsDir, "cache"), "registered-plugin");
      await writeFile(
        getInstalledPluginsRegistryPath(pluginsDir),
        JSON.stringify({
          version: 2,
          plugins: {
            "registered-plugin@acme": [
              {
                scope: "user",
                installPath,
                version: "1.0.0",
                installedAt: "2026-01-01T00:00:00.000Z",
                lastUpdated: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        }),
      );

      expect(await validateInstalledPlugins(projectDir)).toStrictEqual({
        count: 1,
        issues: [],
        notes: [],
      });
    });
  });

  describe("validateInstalledAgents", () => {
    it("validates each compiled agent, noting nothing", async () => {
      const agentsDir = resolveInstallPaths(projectDir, "project").agentsDir;
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), renderAgentMd("web-developer"));

      expect(await validateInstalledAgents(projectDir)).toStrictEqual({
        count: 1,
        issues: [],
        notes: [],
      });
    });
  });

  it("lists nothing installed where no skills or agents folder exists", async () => {
    expect(await listInstalledArtifacts(projectDir)).toStrictEqual({ skills: [], agents: [] });
  });
});
