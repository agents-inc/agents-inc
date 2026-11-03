/**
 * A project under a home holding a Codex installation inherits the home's global until it holds an
 * installation of its own, and from the moment one is being installed into it. Folder names are
 * literals so the assertions cannot move with the product's constants.
 */

import os from "os";
import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { resolveInstallPaths } from "../install-base-dir.js";
import { inheritedGlobalProvider, whileInstallingInto } from "../install-layout.js";

const CODEX_SOURCE_REL = ".agents-inc/codex";

describe("the global a project inherits under a home holding a Codex installation", () => {
  let home: string;
  let project: string;
  let otherProject: string;

  beforeEach(async () => {
    home = await createTempDir("cc-project-being-installed-");
    project = path.join(home, "project");
    otherProject = path.join(home, "other-project");
    await mkdir(project, { recursive: true });
    await mkdir(otherProject, { recursive: true });
    await writeTestTsConfig(home, buildProjectConfig(), CODEX_SOURCE_REL);
    vi.spyOn(os, "homedir").mockReturnValue(home);
  });

  afterEach(async () => {
    vi.mocked(os.homedir).mockRestore();
    await cleanupTempDir(home);
  });

  it("is the home's while the project holds no installation", () => {
    expect(inheritedGlobalProvider(project)).toBe("codex");
  });

  it("is the project's own provider's while an installation is being put into it", async () => {
    const read = await whileInstallingInto(project, async () => ({
      provider: inheritedGlobalProvider(project),
      globalSkillsDir: resolveInstallPaths(project, "global").skillsDir,
    }));

    expect(read).toStrictEqual({
      provider: "claude",
      globalSkillsDir: path.join(home, ".claude", "skills"),
    });
  });

  it("stays the home's for another project read during that install", async () => {
    const read = await whileInstallingInto(project, async () =>
      inheritedGlobalProvider(otherProject),
    );

    expect(read).toBe("codex");
  });

  it("is the home's again once the install has finished", async () => {
    await whileInstallingInto(project, async () => undefined);

    expect(inheritedGlobalProvider(project)).toBe("codex");
  });

  it("is the home's again once the install has thrown", async () => {
    const refused = new Error("refused");

    await expect(
      whileInstallingInto(project, async () => {
        throw refused;
      }),
    ).rejects.toBe(refused);
    expect(inheritedGlobalProvider(project)).toBe("codex");
  });
});
