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

/**
 * What `toHavePluginInRegistry` is allowed to accept.
 *
 * A registry entry is a claim, not evidence: `claude plugin install` writes the
 * `installed_plugins.json` record and the plugin content as two separate acts, so
 * a matcher that stops at the record passes on an install that registered a path
 * and put nothing there. That is precisely the shape D-305 was reported as —
 * "init --from never installs plugins" — and the reason the init-from spec could
 * not have caught it.
 *
 * These specs pin the matcher's verdict on the three states that differ only in
 * what is on disk behind an otherwise identical registry entry: real skill
 * content, a directory that exists but holds none, and a path that resolves to
 * nothing at all.
 */

/**
 * The marketplace the fixture's plugin refs name. The shared fixture name, so the
 * `<id>@<marketplace>` refs this spec builds carry a marketplace that actually owns
 * the ids in them.
 */
const MARKETPLACE = E2E_MARKETPLACE_NAME;
const REACT_REF = buildMarketplacePluginRef(E2E_SKILL.react.id, MARKETPLACE);

/** Fixture arguments every spec here shares — only `pluginsDir` is under test. */
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

/**
 * Writes the directory `claude plugin install` leaves behind for one skill —
 * `<pluginsDir>/<id>/skills/<id>/SKILL.md`, the layout `build plugins` emits and
 * the plugin cache preserves. Returns `pluginsDir` for the fixture to point its
 * `installPath` at.
 */
async function writeInstalledPluginContent(pluginsDir: string, skillId: string): Promise<string> {
  const skillDir = path.join(pluginsDir, skillId, DIRS.SKILLS, skillId);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, FILES.SKILL_MD), `# ${skillId}\n`);
  return pluginsDir;
}

/** The temp dir `createPluginInstalledProject` allocated, derived from its fake HOME. */
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
    // Never created: the registry names a path the install never wrote.
    const danglingPluginsDir = path.join(tempDir, "never-installed");

    const installed = await createPluginInstalledProject({
      ...REACT_PLUGIN_PROJECT,
      pluginsDir: danglingPluginsDir,
    });
    fixtureTempDir = ownerTempDir(installed.home);

    // Precondition: the record itself is present and well-formed, so the only
    // thing the matcher can be reacting to is the missing content behind it.
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
    // The plugin root exists — an interrupted install, or one that registered
    // before copying — but the skill directory inside it was never written.
    await mkdir(path.join(pluginsDir, E2E_SKILL.react.id, DIRS.SKILLS), { recursive: true });

    const installed = await createPluginInstalledProject({ ...REACT_PLUGIN_PROJECT, pluginsDir });
    fixtureTempDir = ownerTempDir(installed.home);

    await expect({ dir: installed.home }).not.toHavePluginInRegistry(REACT_REF);
  });
});
