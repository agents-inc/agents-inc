import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectProject } from "./detect-project.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { setupIsolatedHome, type IsolatedHome } from "../../__tests__/helpers/isolated-home.js";

const INSTALLED_CONFIG = buildProjectConfig({
  agents: buildAgentConfigs(["web-developer"]),
  skills: [],
});

describe("detectProject", () => {
  let home: IsolatedHome;

  beforeEach(async () => {
    home = await setupIsolatedHome("cc-detect-project-");
  });

  afterEach(async () => {
    await home.cleanup();
  });

  const detectedAt = (dir: string) => ({
    installation: {
      mode: "eject",
      configPath: getProjectConfigPath(dir, "claude"),
      agentsDir: resolveInstallPaths(dir, "project").agentsDir,
      projectDir: dir,
    },
    config: INSTALLED_CONFIG,
    configPath: getProjectConfigPath(dir, "claude"),
  });

  it("answers no project where neither the project nor home holds an installation", async () => {
    expect(await detectProject(home.projectDir)).toBeNull();
  });

  it("answers the project's installation with the configuration it holds", async () => {
    await writeTestTsConfig(home.projectDir, INSTALLED_CONFIG);

    expect(await detectProject(home.projectDir)).toStrictEqual(detectedAt(home.projectDir));
  });

  it("answers the installation in the directory it is given, not the current directory", async () => {
    const elsewhere = path.join(home.tempDir, "elsewhere");
    await mkdir(elsewhere);
    await writeTestTsConfig(elsewhere, INSTALLED_CONFIG);

    expect(process.cwd()).not.toBe(elsewhere);
    expect(await detectProject(elsewhere)).toStrictEqual(detectedAt(elsewhere));
  });

  it("answers the global installation for a project that holds none", async () => {
    await writeTestTsConfig(home.fakeHome, INSTALLED_CONFIG);

    expect(await detectProject(home.projectDir)).toStrictEqual({
      ...detectedAt(home.fakeHome),
      installation: {
        ...detectedAt(home.fakeHome).installation,
        agentsDir: resolveInstallPaths(home.fakeHome, "global").agentsDir,
      },
    });
  });

  it("looks in the current directory when no project directory is named", async () => {
    await writeTestTsConfig(home.projectDir, INSTALLED_CONFIG);

    expect(await detectProject()).toStrictEqual(detectedAt(process.cwd()));
    expect(process.cwd()).toBe(home.projectDir);
  });
});
