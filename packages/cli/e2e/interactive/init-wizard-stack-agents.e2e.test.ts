import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import { E2E_AGENT_DISPLAY, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import "../matchers/setup.js";

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * The stack's whole sub-agent roster as compiled filenames, derived from the stack
 * definition rather than retyped. The subject of this spec IS the roster the stack
 * preselects, so the install it drives is held to that roster and no less: the
 * parameterless `toHaveCompiledAgents()` that stood here proved only that the directory
 * held at least one `.md`, which an install that compiled one of the two passed.
 */
const COMPILED_AGENT_FILES = E2E_STACK_AGENTS.map((agent) => `${agent}.md`);

describe.skipIf(!claudeAvailable)("init wizard — stack agent preselection", () => {
  let wizard: InitWizard | undefined;
  let source: E2EPluginSource | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2EPluginSource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should preselect agents from the selected stack",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launchInProject({ ...(source !== undefined && { source }) });

      // Select the first stack (E2E Test Stack)
      const domain = await wizard.stack.selectFirstStack();

      // Accept domain defaults
      const build = await domain.acceptDefaults();

      // Pass through all domains (Web, API, Methodology)
      const sources = await build.passThroughAllDomains();

      // Accept source defaults
      const agents = await sources.acceptDefaults();

      // Verify we reached the agents step
      const output = agents.getOutput();
      expect(output).toContain(STEP_TEXT.AGENTS);

      // Verify that agents from the E2E stack are pre-selected with checkmarks.
      // The E2E stack defines "web-developer" and "api-developer" agents.
      // The UI renders selected agents as: [✓] Web Developer
      expect(output).toContain(E2E_AGENT_DISPLAY["web-developer"]);
      expect(output).toMatch(/\[✓\].*Web Developer/);

      expect(output).toContain(E2E_AGENT_DISPLAY["api-developer"]);
      expect(output).toMatch(/\[✓\].*API Developer/);

      // Complete the wizard
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      await expect(result.project).toHaveConfig({ agents: ["web-developer"] });
      expect(Object.keys(await readCompiledAgents(wizard.globalHome)).sort()).toStrictEqual(
        COMPILED_AGENT_FILES,
      );
    },
  );
});
