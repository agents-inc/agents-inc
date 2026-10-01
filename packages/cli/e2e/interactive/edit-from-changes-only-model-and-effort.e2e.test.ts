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
 * A shared configuration that differs from the installed one in a sub-agent's tuning ALONE: the
 * model it runs on and the effort it reasons at.
 *
 * Nothing else about the two is different: same skill at the same scope from the same source, same
 * sub-agent roster. `edit --from` decided whether it had anything to do by diffing the roster, the
 * sources and the scopes, so a configuration whose whole content was a retune read to it as no
 * change at all. It printed "No changes made." and the sub-agent went on running as it was.
 *
 * That is a silent loss of exactly the thing the link was shared for: the receiver applied the
 * sharer's configuration, the command said there was nothing to apply, and both ends believe the
 * retune travelled.
 *
 * Both halves are asserted, because neither alone is the claim: the run has to SAY there was a
 * change — a command that wrote the file while reporting nothing is the same failure seen from the
 * other side — and the config entry and the compiled frontmatter have to carry it.
 *
 * The retune names `haiku` because every sub-agent in the E2E source declares `opus` in its own
 * metadata, so a compiled `model: opus` could not tell the shared model from the default.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const SKILL_ID = E2E_SKILL.react.id;

const INSTALLED_ID = "TuneEdit1";
const RETUNED_ID = "TuneEdit2";

/**
 * The configuration the project is installed from, and — with `tuning` — the one it is then asked
 * to match.
 *
 * Project scope throughout, so the apply has a project to be destructive about: at the home root
 * the two scopes are one directory and the command refuses a project-scoped configuration rather
 * than applying it somewhere else.
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

      // The subject guard: unless the installation really runs on its metadata's model with no
      // effort, the apply below has nothing to change and every assertion after it passes for free.
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

      // What the run SAID. A retune is a change to this project, and a run that reports none has
      // told the person who applied the configuration that it carried nothing.
      expect(
        output,
        "the applied configuration retunes a sub-agent, so the run must not report that nothing changed",
      ).not.toContain(STEP_TEXT.EDIT_UNCHANGED);
      expect(output).toContain(STEP_TEXT.EDIT_CHANGES_HEADING);

      // And what it WROTE, on both surfaces. Either alone can look right while the other lies: a
      // config entry naming a model the compiled sub-agent does not run on, or the reverse.
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
