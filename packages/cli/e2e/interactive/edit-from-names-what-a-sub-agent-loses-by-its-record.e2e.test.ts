import { rename } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  isClaudeCLIAvailable,
  readTreeSnapshot,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { EXIT_CODES, REMOVED_MARKER, STEP_TEXT, TIMEOUTS, panelRow } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `edit --from` over a plugin installation `init --from` made, after its marketplace withdrew a
 * plugin that installation records: the sub-agent's line under the panel names the plugin it loses
 * as the panel row does, by the name the install recorded. A plugin leaves no copy on disk to name
 * it and the fixture's id is in no catalogue the CLI ships, so only the record can. Declined at a
 * terminal, so the run changes nothing.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const API_DEV = E2E_AGENT["api-developer"].name;
const WITHDRAWN = E2E_SKILL.hono;
const KEPT = E2E_SKILL.zustand;
const INSTALLED_ID = "LosesRec01";
const DROPS_WITHDRAWN_ID = "LosesRec02";

function pluginsOnApiDeveloper(skillIds: readonly string[]) {
  return buildSeedPayload({
    skills: Object.fromEntries(
      skillIds.map((id) => [
        id,
        buildSeedSkill({ install: "plugin", scope: "project", assignments: { [API_DEV]: "lazy" } }),
      ]),
    ),
    agents: { [API_DEV]: { scope: "project" } },
  });
}

describe.skipIf(!claudeAvailable)(
  "edit --from names a plugin a sub-agent loses by the name its install recorded",
  () => {
    let fixture: E2EPluginSource;
    let withdrawn: E2ESource;
    let store: SeedConfigStore;
    let tempDir: string;
    let projectDir: string;
    let installedTree: Record<string, TreeSnapshotEntry>;
    let planned: string;
    let exitCode: number;

    beforeAll(async () => {
      fixture = await createE2EPluginSource({ owned: true });
      withdrawn = await createE2ESource({
        withoutSkills: [WITHDRAWN.id],
        marketplaceName: fixture.marketplaceName,
      });
      store = await startSeedConfigStore();
      store.publish(INSTALLED_ID, pluginsOnApiDeveloper([WITHDRAWN.id, KEPT.id]));
      store.publish(DROPS_WITHDRAWN_ID, pluginsOnApiDeveloper([KEPT.id]));

      const env = await createTestEnvironment({ permissions: false });
      tempDir = env.tempDir;
      projectDir = env.projectDir;
      const installed = await runInitFrom(
        store,
        INSTALLED_ID,
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: env.projectDir }).toHavePlugin(
        pluginKeyFor(WITHDRAWN.id, fixture.marketplaceName),
      );

      await rename(fixture.sourceDir, `${fixture.sourceDir}-as-installed`);
      await rename(withdrawn.sourceDir, fixture.sourceDir);
      installedTree = await readTreeSnapshot(env.projectDir);

      const prompt = new InteractivePrompt(["edit", "--from", DROPS_WITHDRAWN_ID], env.projectDir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      try {
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        planned = prompt.getOutput();
        await prompt.deny();
        exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      } finally {
        await prompt.destroy();
      }
    }, TIMEOUTS.INTERACTIVE);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
      await Promise.all([withdrawn.tempDir, tempDir].map(cleanupTempDir));
    });

    it("draws the withdrawn plugin in the panel by the name its install recorded", () => {
      expect(planned).toContain(panelRow(REMOVED_MARKER, WITHDRAWN.display));
    });

    it("names the withdrawn plugin on the sub-agent's line by that same record", () => {
      expect(
        planned,
        "the line under the panel names what the sub-agent loses as the panel row does",
      ).toContain(`\n~ ${API_DEV}: loses ${WITHDRAWN.display}\n`);
    });

    it("changes nothing once declined", async () => {
      expect(exitCode).toBe(EXIT_CODES.CANCELLED);
      expect(await readTreeSnapshot(projectDir)).toStrictEqual(installedTree);
    });
  },
);
