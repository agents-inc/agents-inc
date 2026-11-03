import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import {
  cleanupTempDir,
  createTempDir,
  readTreeSnapshot,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runEditFrom,
  runInitFrom,
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, PUBLIC_MARKETPLACE_NAME, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

import type { ProjectHandle } from "../fixtures/project-handle.js";

/**
 * The command printed under a minted id must run where it is handed out. `edit` mints from the
 * installation in play, which `init --from` refuses to install over, so it hands out `edit --from`;
 * `share` mints for someone else's fresh folder, so it hands out `init --from`. Both endings are in
 * one file so neither can move without the other being read.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const INSTALLED_ID = "MintedA1";

/** Stdout from the id on; compared whole (the runner strips the last newline), so a line under it fails. */
function handedOut(command: string, id: string): string {
  return [
    `${STEP_TEXT.SHARED_AS} ${id}`,
    `${command} ${id}`,
    `${STEP_TEXT.MINTED_OPEN_IT}${id}`,
  ].join("\n");
}

describe("the command a minted id is handed out with", () => {
  let store: SeedConfigStore;
  const environments: TestEnvironment[] = [];
  const tempDirs: string[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    await Promise.all([
      ...environments.splice(0).map((env) => cleanupTempDir(env.tempDir)),
      ...tempDirs.splice(0).map(cleanupTempDir),
    ]);
  });

  async function takeEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment({ permissions: false });
    environments.push(env);
    return env;
  }

  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  /** The project holds a skill and a sub-agent of its own, so its installation is its own. */
  async function anInstalledProject(): Promise<ProjectHandle> {
    const env = await takeEnvironment();
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: {
          [E2E_SKILL.react.id]: ejectedGlobalSkill(),
          [E2E_SKILL.vitest.id]: ejectedGlobalSkill({ scope: "project" }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const installed = await runInitFrom(store, INSTALLED_ID, project, E2E_SOURCE.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    store.reset();
    return project;
  }

  async function aGlobalInstallation(): Promise<TestEnvironment> {
    const env = await takeEnvironment();
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: {
          [E2E_SKILL.react.id]: ejectedGlobalSkill(),
          [E2E_SKILL.vitest.id]: ejectedGlobalSkill(),
        },
      }),
    );
    const home = { dir: env.fakeHome, globalHome: env.fakeHome };
    const installed = await runInitFrom(store, INSTALLED_ID, home, E2E_SOURCE.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    store.reset();
    return env;
  }

  describe.each([[["edit"]], [["edit", "--ui"]]])("%j", (argv) => {
    /** No TTY in the spawned process, so the link is printed and nothing is opened. */
    const openIn = (project: ProjectHandle) =>
      CLI.run(argv, project, { env: { AGENTS_INC_API_URL: store.url } });

    /** The handed-out command as run where it was handed out: nothing to change, so nothing to confirm. */
    async function expectItAppliesBackUnchanged(id: string, project: ProjectHandle): Promise<void> {
      const applied = await runEditFrom(store, id, project);
      expect(applied.exitCode, `edit --from ${id} failed: ${applied.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(applied.output).toContain(STEP_TEXT.EDIT_UNCHANGED);
    }

    it(
      "inside an installed project, hands out the edit --from that applies the id back there",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const project = await anInstalledProject();

        const opened = await openIn(project);

        expect(opened.exitCode, opened.output).toBe(EXIT_CODES.SUCCESS);
        const id = firstElement(store.minted);
        expect(opened.stdout).toBe(
          `Opening 2 skills across 1 sub-agent...\n${handedOut(STEP_TEXT.MINTED_APPLY_IT, id)}`,
        );
        await expectItAppliesBackUnchanged(id, project);
      },
    );

    it(
      "at HOME, over the global installation, hands out the edit --from that applies the id back there",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const env = await aGlobalInstallation();
        const home = { dir: env.fakeHome, globalHome: env.fakeHome };

        const opened = await openIn(home);

        expect(opened.exitCode, opened.output).toBe(EXIT_CODES.SUCCESS);
        const id = firstElement(store.minted);
        expect(opened.stdout).toBe(
          `Opening 2 skills across 1 sub-agent...\n${handedOut(STEP_TEXT.MINTED_APPLY_IT, id)}`,
        );
        await expectItAppliesBackUnchanged(id, home);
      },
    );

    it(
      "in a folder with nothing of its own under a global installation, hands out edit --from, which applies to the global one",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const env = await aGlobalInstallation();
        const folder = { dir: env.projectDir, globalHome: env.fakeHome };

        const opened = await openIn(folder);

        expect(opened.exitCode, opened.output).toBe(EXIT_CODES.SUCCESS);
        const id = firstElement(store.minted);
        expect(opened.stdout).toBe(
          `Opening 2 skills across 1 sub-agent...\n${handedOut(STEP_TEXT.MINTED_APPLY_IT, id)}`,
        );
        const before = await readTreeSnapshot(env.fakeHome);
        await expectItAppliesBackUnchanged(id, folder);
        expect(await readTreeSnapshot(env.fakeHome)).toStrictEqual(before);
      },
    );
  });

  describe("share", () => {
    it("over an installation, hands out init --from, since its recipient installs into a fresh folder", async () => {
      const origin = await takeTempDir();
      // As a plugin install records it: `share` carries plugins only, and only reads.
      await writeProjectConfig(
        origin,
        buildProjectConfig({
          name: "minted-id-share",
          skills: buildSkillConfigs([E2E_SKILL.react.id], {
            scope: "global",
            origin: PUBLIC_MARKETPLACE_NAME,
          }),
          agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        }),
      );

      const shared = await runShare(store, { dir: origin });

      expect(shared.exitCode, shared.output).toBe(EXIT_CODES.SUCCESS);
      expect(shared.stdout).toBe(
        `Sharing 1 skill across 1 sub-agent...\n${handedOut(STEP_TEXT.MINTED_INSTALL_IT, firstElement(store.minted))}`,
      );
    });

    it(
      "piped, with nothing installed, hands out the init --from that installs the id there",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const empty = await takeTempDir();
        const piped = buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          marketplace: E2E_SOURCE.sourceDir,
          skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        });

        const shared = await CLI.run(
          ["share", "--stdin"],
          { dir: empty },
          { env: { AGENTS_INC_API_URL: store.url }, input: JSON.stringify(piped) },
        );

        expect(shared.exitCode, shared.output).toBe(EXIT_CODES.SUCCESS);
        const id = firstElement(store.minted);
        expect(shared.stdout).toBe(handedOut(STEP_TEXT.MINTED_INSTALL_IT, id));

        // As handed out: the id names its own marketplace, so no --marketplace is added.
        const installed = await CLI.run(
          ["init", "--from", id],
          { dir: empty },
          { env: { AGENTS_INC_API_URL: store.url } },
        );
        expect(installed.exitCode, `init --from ${id} failed: ${installed.output}`).toBe(
          EXIT_CODES.SUCCESS,
        );
      },
    );
  });
});
