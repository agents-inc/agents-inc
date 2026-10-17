import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import "./setup.js";
import {
  createPluginInstalledProject,
  type PluginInstalledProjectOptions,
} from "../fixtures/plugin-install-state.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, E2E_MARKETPLACE_NAME, FILES } from "../pages/constants.js";
import { cleanupTempDir, createTempDir, readTestFile } from "../helpers/test-utils.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

// A registry entry alone is not an install: these pin the matcher over real content, an empty
// plugin root, and a dangling installPath.

const MARKETPLACE = E2E_MARKETPLACE_NAME;
const REACT_REF = buildMarketplacePluginRef(E2E_SKILL.react.id, MARKETPLACE);

const REACT_PLUGIN_PROJECT: Omit<PluginInstalledProjectOptions, "pluginsDir"> = {
  marketplace: MARKETPLACE,
  skillIds: [E2E_SKILL.react.id],
  agents: [E2E_AGENT["web-developer"].name],
  stack: {
    [E2E_AGENT["web-developer"].name]: {
      "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
    },
  },
};

// The layout `claude plugin install` leaves: `<pluginsDir>/<id>/skills/<id>/SKILL.md`.
async function writeInstalledPluginContent(pluginsDir: string, skillId: string): Promise<string> {
  const skillDir = path.join(pluginsDir, skillId, DIRS.SKILLS, skillId);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, FILES.SKILL_MD), `# ${skillId}\n`);
  return pluginsDir;
}

function ownerTempDir(home: string): string {
  return path.dirname(home);
}

describe("toHavePluginInRegistry", () => {
  let tempDir: string | undefined;
  let fixtureTempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (fixtureTempDir) await cleanupTempDir(fixtureTempDir);
    tempDir = undefined;
    fixtureTempDir = undefined;
  });

  it("accepts a registry entry whose installPath holds the skill content", async () => {
    tempDir = await createTempDir();
    const pluginsDir = await writeInstalledPluginContent(
      path.join(tempDir, "plugins"),
      E2E_SKILL.react.id,
    );

    const installed = await createPluginInstalledProject({ ...REACT_PLUGIN_PROJECT, pluginsDir });
    fixtureTempDir = ownerTempDir(installed.home);

    await expect({ dir: installed.home }).toHavePluginInRegistry(REACT_REF);
    await expect({ dir: installed.home }).toHavePluginInRegistry(REACT_REF, "user");
  });

  it("rejects a registry entry whose installPath points nowhere", async () => {
    tempDir = await createTempDir();
    const danglingPluginsDir = path.join(tempDir, "never-installed");

    const installed = await createPluginInstalledProject({
      ...REACT_PLUGIN_PROJECT,
      pluginsDir: danglingPluginsDir,
    });
    fixtureTempDir = ownerTempDir(installed.home);

    // Precondition: the record is present, so only the missing content can fail the matcher.
    const registry = await readTestFile(
      path.join(installed.home, DIRS.CLAUDE, DIRS.PLUGINS, FILES.INSTALLED_PLUGINS_JSON),
    );
    expect(registry).toContain(REACT_REF);
    expect(registry).toContain(path.join(danglingPluginsDir, E2E_SKILL.react.id));

    await expect({ dir: installed.home }).not.toHavePluginInRegistry(REACT_REF);
    await expect({ dir: installed.home }).not.toHavePluginInRegistry(REACT_REF, "user");
  });

  it("rejects a registry entry whose installPath exists but carries no SKILL.md", async () => {
    tempDir = await createTempDir();
    const pluginsDir = path.join(tempDir, "plugins");
    // Plugin root exists, skill directory inside it does not.
    await mkdir(path.join(pluginsDir, E2E_SKILL.react.id, DIRS.SKILLS), { recursive: true });

    const installed = await createPluginInstalledProject({ ...REACT_PLUGIN_PROJECT, pluginsDir });
    fixtureTempDir = ownerTempDir(installed.home);

    await expect({ dir: installed.home }).not.toHavePluginInRegistry(REACT_REF);
  });
});
