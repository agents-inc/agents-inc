import os from "os";
import path from "path";
import { mkdir, realpath } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mutateGlobal } from "../index.js";
import { consequenceTier } from "../classify.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import type { GateDeps } from "../index.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { sourceFolderInUse } from "../../installation/install-layout.js";
import { PROVIDERS } from "../../../consts.js";

/** A directory, named by the same normalization the registrar applies. */
async function makeDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return realpath(dir);
}

/** Both no-op paths must classify as T4: `changes` is the caller's only account of what moved. */
describe("mutateGlobal — a mutation that moves nothing", () => {
  let tempHome: string;
  let registeredProject: string;
  let unregisteredProject: string;
  let deps: GateDeps;

  beforeEach(async () => {
    tempHome = await createTempDir("cc-mutate-global-noop-");
    registeredProject = await makeDir(path.join(tempHome, "registered"));
    unregisteredProject = await makeDir(path.join(tempHome, "unregistered"));
    // `mutateGlobal` resolves the global config through `os.homedir()`.
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    deps = { loadMatrix: vi.fn(), loadAgents: vi.fn() };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(tempHome);
  });

  async function writeGlobalConfig(config: Record<string, unknown>): Promise<void> {
    await writeTestTsConfig(tempHome, config);
  }

  it("reports T4 and no write when there is no global config to mutate", async () => {
    const report = await mutateGlobal(
      { kind: "deregister-project", projectDir: unregisteredProject, provider: "claude" },
      deps,
    );

    expect(report.changes.scalarsChanged).toStrictEqual([]);
    expect(consequenceTier(report.changes)).toBe("T4");
    expect(report.globalWritten).toBe(false);
  });

  it("reports T4 and no write when deregistering a path that was never registered", async () => {
    await writeGlobalConfig({
      name: "global",
      skills: [],
      agents: [],
      projects: [registeredProject],
    });

    const report = await mutateGlobal(
      { kind: "deregister-project", projectDir: unregisteredProject, provider: "claude" },
      deps,
    );

    expect(report.changes.scalarsChanged).toStrictEqual([]);
    expect(consequenceTier(report.changes)).toBe("T4");
    expect(report.globalWritten).toBe(false);
  });
});

/**
 * A project is registered with its own provider's global only. Claude is the control, being also
 * the provider a home holding both would otherwise be read as.
 */
describe("mutateGlobal — deregistering under a home holding a Claude and a Codex global", () => {
  let tempHome: string;
  let deps: GateDeps;

  beforeEach(async () => {
    tempHome = await createTempDir("cc-mutate-global-both-");
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    deps = { loadMatrix: vi.fn(), loadAgents: vi.fn() };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(tempHome);
  });

  it.each(PROVIDERS)(
    "takes a %s project off its own provider's global and leaves the other global alone",
    async (provider) => {
      const project = await makeDir(path.join(tempHome, `${provider}-project`));
      const neighbour = await makeDir(path.join(tempHome, "neighbour"));
      for (const atHome of PROVIDERS) {
        await writeTestTsConfig(
          tempHome,
          buildProjectConfig({
            name: `${atHome}-global`,
            skills: [],
            agents: [],
            projects: atHome === provider ? [project, neighbour] : [neighbour],
          }),
          sourceFolderInUse(tempHome, atHome).relName,
        );
      }

      const report = await mutateGlobal(
        { kind: "deregister-project", projectDir: project, provider },
        deps,
      );

      expect(report.globalWritten).toBe(true);
      for (const atHome of PROVIDERS) {
        const loaded = await loadProjectConfigFromDir(tempHome, atHome);
        expect(loaded?.config.projects, `the ${atHome} global's registered projects`).toStrictEqual(
          [neighbour],
        );
      }
    },
  );
});
