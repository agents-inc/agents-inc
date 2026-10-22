import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getEnabledPluginKeys,
  listPluginInstallsForProject,
  listRegisteredPluginInstalls,
} from "./plugin-settings";
import { CLAUDE_DIR } from "../../consts";
import {
  buildProjectPluginInstallation,
  buildUserPluginInstallation,
  renderEnabledPluginsSettings,
  renderInstalledPluginsRegistry,
} from "../__tests__/factories/plugin-registry-factories.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";

/** Real filesystem: which file each reader opens is the subject, so no path is asked of a mock. */

const REACT = "web-framework-react@my-marketplace";
const ZUSTAND = "web-state-zustand@my-marketplace";

describe("where plugin settings are read from", () => {
  let tempDir: string;
  let projectDir: string;
  let pluginsDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("plugin-settings-on-disk-");
    projectDir = path.join(tempDir, "project");
    pluginsDir = path.join(tempDir, "plugins");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  async function writeAt(filePath: string, content: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  it("reads the enabled plugins from <project>/.claude/settings.json", async () => {
    await writeAt(
      path.join(projectDir, CLAUDE_DIR, "settings.json"),
      renderEnabledPluginsSettings({ [REACT]: true, [ZUSTAND]: false }),
    );

    expect(await getEnabledPluginKeys(projectDir)).toStrictEqual([REACT]);
  });

  it("lists a project's installations from <pluginsDir>/installed_plugins.json", async () => {
    await writeAt(
      path.join(pluginsDir, "installed_plugins.json"),
      renderInstalledPluginsRegistry({
        [REACT]: [buildProjectPluginInstallation("/cache/react/1.0.0", projectDir)],
      }),
    );

    expect(await listPluginInstallsForProject(pluginsDir, projectDir)).toStrictEqual([
      { pluginKey: REACT, installPath: "/cache/react/1.0.0" },
    ]);
  });

  it("lists every registered installation from <pluginsDir>/installed_plugins.json", async () => {
    await writeAt(
      path.join(pluginsDir, "installed_plugins.json"),
      renderInstalledPluginsRegistry({
        [ZUSTAND]: [buildUserPluginInstallation("/cache/zustand/1.0.0")],
      }),
    );

    expect(await listRegisteredPluginInstalls(pluginsDir)).toStrictEqual([
      { pluginKey: ZUSTAND, installPath: "/cache/zustand/1.0.0" },
    ]);
  });
});
