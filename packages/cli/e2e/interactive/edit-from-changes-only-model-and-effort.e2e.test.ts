import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, readAgentEntriesFor } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";

import type { SeedAgent } from "@workspace/matrix/seed";

/**
 * A shared configuration differing only in a sub-agent's model and effort must be applied and
 * reported, not "No changes made." `haiku` because every E2E sub-agent declares `opus`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const SKILL_ID = E2E_SKILL.react.id;

const INSTALLED_ID = "TuneEdit1";
const RETUNED_ID = "TuneEdit2";

/**
 * Project scope, so the apply has a project to be destructive about; at the home root a
 * project-scoped configuration is refused.
 */
function payload(tuning: Pick<SeedAgent, "model" | "effort"> = {}) {
  return buildSeedPayload({
    skills: {
      [SKILL_ID]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { on: true, scope: "project", ...tuning } },
  });
}

describe("edit --from a configuration that retunes only a sub-agent's model and effort", () => {
  let store: SeedConfigStore;
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  it(
    "reports the change and writes it, rather than reporting nothing",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);
      const project = { dir: env.projectDir, globalHome: env.fakeHome };

      store.publish(INSTALLED_ID, payload());
      const installed = await runInitFrom(store, INSTALLED_ID, project, sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

      // Subject guard: the install runs on its metadata's model with no effort, so the apply has
      // something to change.
      expect(await readAgentEntriesFor(project.dir, WEB_DEV)).toStrictEqual(
        buildAgentConfigs([WEB_DEV], { scope: "project" }),
      );
      await expect({ dir: project.dir }).toHaveAgentFrontmatter(WEB_DEV, {
        model: "opus",
        noEffort: true,
      });

      store.publish(RETUNED_ID, payload({ model: "haiku", effort: "high" }));

      prompt = new InteractivePrompt(["edit", "--from", RETUNED_ID], project.dir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: project.globalHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      const output = prompt.getOutput();
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

      // What it said: a run reporting no change tells the applier the configuration carried
      // nothing.
      expect(
        output,
        "the applied configuration retunes a sub-agent, so the run must not report that nothing changed",
      ).not.toContain(STEP_TEXT.EDIT_UNCHANGED);
      expect(output).toContain(STEP_TEXT.EDIT_CHANGES_HEADING);

      // What it wrote, on both surfaces; either alone can look right.
      expect(await readAgentEntriesFor(project.dir, WEB_DEV)).toStrictEqual(
        buildAgentConfigs([WEB_DEV], { scope: "project", model: "haiku", effort: "high" }),
      );
      await expect({ dir: project.dir }).toHaveAgentFrontmatter(WEB_DEV, {
        model: "haiku",
        effort: "high",
      });
    },
  );
});
