import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { readActiveAgentNames } from "../fixtures/dual-scope-helpers.js";
import {
  agentsPath,
  cleanupTempDir,
  completeWithLocalSources,
  ensureBinaryExists,
} from "../helpers/test-utils.js";
import { listCompiledAgentNames } from "../../src/cli/lib/agents/list-compiled-agents.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import "../matchers/setup.js";

/**
 * Selecting a stack installs exactly the sub-agents that stack declares.
 *
 * A stack's `agents` keys are its roster — the statement of WHICH sub-agents an
 * installation gets and what each of them carries. Domain derivation exists for
 * the from-scratch flow, where nothing has declared a roster; it is not a second
 * opinion about a stack's.
 *
 * Both halves of that claim are asserted against the stack's own keys, so
 * neither an omission nor an addition can pass: the roster is compared as a
 * whole rather than searched for names the spec happens to know about.
 */

describe("init wizard — a stack's declared sub-agent roster is the installed one", () => {
  let wizard: InitWizard | undefined;
  let source: E2ESource | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "installs the stack's agents and no others, in config and on disk",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject({
        ...(source !== undefined && { source }),
      });

      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode, `init failed:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      expect(
        await readActiveAgentNames(result.project.dir),
        "config.ts must name exactly the sub-agents the selected stack declares",
      ).toStrictEqual(E2E_STACK_AGENTS);

      const compiled = await listCompiledAgentNames(agentsPath(wizard.globalHome));
      expect(
        compiled.sort(),
        "the compiled agents on disk must be exactly the stack's declared roster",
      ).toStrictEqual(E2E_STACK_AGENTS);
    },
  );
});
