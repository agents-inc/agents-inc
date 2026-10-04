import path from "path";
import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  compactCliOutput,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  flattenCliOutput,
  FORKED_FROM_METADATA,
  loadConfigOrFail,
  readTreeSnapshot,
  sourceFolderIn,
  writeCorruptConfig,
  writeProjectConfig,
  type FixtureProjectConfig,
  type FixtureStackAgentConfig,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DIRS, E2E_MARKETPLACE_NAME, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * A run at the home directory that fans a global change out to every registered project, and one
 * of those projects whose `config.ts` cannot be loaded — journey 38's file, met by journey 7's
 * fan-out.
 *
 * The fan-out skips that project, which is right: it cannot be rewritten from a file nobody can
 * read. What it owes is one line naming the project it skipped and why. A global `edit` said
 * nothing and counted only the projects it reached; a global `compile` warned in `uninstall`'s
 * words, about uninstalled content, when nothing was uninstalled.
 *
 * The installation is written from files and the change is made by `edit --from` — the wizard is
 * not this file's subject. Each run has a healthy registered project beside the broken one, which
 * the fan-out still reaches and does not name, so a line printed for every project reads as wrong.
 */

const API_DEV = E2E_AGENT["api-developer"].name;
const WEB_DEV = E2E_AGENT["web-developer"].name;
const ADDS_A_GLOBAL_SKILL_ID = "SkipLine01";

/** The global installation's own sub-agent stack. */
const globalStack = {
  [API_DEV]: { "web-testing": [sa(E2E_SKILL.vitest.id, true)] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** The healthy project's own sub-agent stack. */
const healthyProjectStack = {
  [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id, true)] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** One global installation and the two projects registered against it, by registered path. */
type Fixture = { home: string; broken: string; healthy: string };

/** The one line a run owes for the project it could not rewrite. */
function skipLine(projectPath: string): string {
  return compactCliOutput(
    `${STEP_TEXT.SKIPPED_REGISTERED_PROJECT} ${projectPath}: ${STEP_TEXT.REGISTERED_PROJECT_CONFIG_UNREADABLE}`,
  );
}

describe("a run at the home directory over a registered project whose config.ts cannot be loaded", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(sourceTempDir);
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** A healthy registered project as a project write leaves it: its own row, plus the global one. */
  function healthyProjectConfig(): FixtureProjectConfig {
    return buildProjectConfig({
      name: "healthy-project",
      marketplace: sourceDir,
      marketplaceName: E2E_MARKETPLACE_NAME,
      skills: [
        buildSkillConfig(E2E_SKILL.react.id, { scope: "project" }),
        buildSkillConfig(E2E_SKILL.vitest.id, { scope: "global" }),
      ],
      agents: [
        ...buildAgentConfigs([WEB_DEV], { scope: "project" }),
        ...buildAgentConfigs([API_DEV], { scope: "global" }),
      ],
      selectedDomains: ["web"],
      stack: healthyProjectStack,
    });
  }

  /** One folder of the installation, by the real path a registration records. */
  async function installationFolder(tempDir: string, name: string): Promise<string> {
    const dir = path.join(tempDir, name);
    await mkdir(path.join(dir, DIRS.CLAUDE, DIRS.AGENTS), { recursive: true });
    await createPermissionsFile(dir);
    return realpathSync(dir);
  }

  async function takeInstallation(): Promise<Fixture> {
    const tempDir = await createTempDir();
    tempDirs.push(tempDir);

    const home = await installationFolder(tempDir, "home");
    const brokenDir = await installationFolder(tempDir, "broken-project");
    const healthyDir = await installationFolder(tempDir, "healthy-project");

    await writeProjectConfig(
      home,
      buildProjectConfig({
        name: "global-install",
        marketplace: sourceDir,
        marketplaceName: E2E_MARKETPLACE_NAME,
        skills: [buildSkillConfig(E2E_SKILL.vitest.id, { scope: "global" })],
        agents: buildAgentConfigs([API_DEV], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [brokenDir, healthyDir],
      }),
    );
    await createLocalSkill(home, E2E_SKILL.vitest.id, {
      description: "Globally installed skill",
      metadata: FORKED_FROM_METADATA,
    });

    await writeCorruptConfig(brokenDir, renderUnparseableConfigTs());

    await writeProjectConfig(healthyDir, healthyProjectConfig());
    await createLocalSkill(healthyDir, E2E_SKILL.react.id, {
      description: "Project-owned skill",
      metadata: FORKED_FROM_METADATA,
    });

    return { home, broken: brokenDir, healthy: healthyDir };
  }

  describe("compile", () => {
    let fixture: Fixture;
    let run: CLIResult;
    let brokenBefore: Record<string, TreeSnapshotEntry>;

    beforeAll(async () => {
      fixture = await takeInstallation();
      brokenBefore = await readTreeSnapshot(sourceFolderIn(fixture.broken));
      run = await CLI.run(["compile"], { dir: fixture.home }, { env: { HOME: fixture.home } });
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    it("does not warn in uninstall's words, since nothing was uninstalled", () => {
      expect(flattenCliOutput(run.output)).not.toContain(STEP_TEXT.UNINSTALL_PROJECT_SKIPPED);
    });

    it("names the project it skipped, and that its config.ts cannot be read", () => {
      expect(compactCliOutput(run.output)).toContain(skipLine(fixture.broken));
    });

    it("names no project it reached", () => {
      expect(compactCliOutput(run.output), "the fan-out still reached it").toContain(
        compactCliOutput(STEP_TEXT.PROPAGATED_RECOMPILE_ONE),
      );
      expect(compactCliOutput(run.output)).not.toContain(skipLine(fixture.healthy));
    });

    it("leaves the skipped project's config byte-identical", async () => {
      expect(await readTreeSnapshot(sourceFolderIn(fixture.broken))).toStrictEqual(brokenBefore);
    });
  });

  describe("edit --from", () => {
    let fixture: Fixture;
    let output: string;
    let brokenBefore: Record<string, TreeSnapshotEntry>;

    beforeAll(async () => {
      fixture = await takeInstallation();
      brokenBefore = await readTreeSnapshot(sourceFolderIn(fixture.broken));
      store.publish(
        ADDS_A_GLOBAL_SKILL_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.vitest.id]: buildSeedSkill({
              scope: "global",
              assignments: { [API_DEV]: "preloaded" },
            }),
            [E2E_SKILL.zustand.id]: buildSeedSkill({
              scope: "global",
              assignments: { [API_DEV]: "lazy" },
            }),
          },
          agents: { [API_DEV]: { scope: "global" } },
        }),
      );

      const prompt = new InteractivePrompt(
        ["edit", "--from", ADDS_A_GLOBAL_SKILL_ID],
        fixture.home,
        {
          env: { AGENTS_INC_API_URL: store.url, HOME: fixture.home },
        },
      );
      try {
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        await prompt.confirm();
        await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
        output = prompt.getOutput();
      } finally {
        await prompt.destroy();
      }
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    it("names the project it skipped, and that its config.ts cannot be read", () => {
      expect(compactCliOutput(output)).toContain(skipLine(fixture.broken));
    });

    it("carries the change to the project it reached, and does not name it", async () => {
      const healthy = await loadConfigOrFail(fixture.healthy);
      expect(
        healthy.skills
          .filter((skill) => skill.scope === "global")
          .map((skill) => skill.id)
          .sort(),
        "the fan-out ran: the added global skill reached the healthy project",
      ).toStrictEqual([E2E_SKILL.vitest.id, E2E_SKILL.zustand.id].sort());
      expect(compactCliOutput(output)).not.toContain(skipLine(fixture.healthy));
    });

    it("leaves the skipped project's config byte-identical", async () => {
      expect(await readTreeSnapshot(sourceFolderIn(fixture.broken))).toStrictEqual(brokenBefore);
    });
  });
});
