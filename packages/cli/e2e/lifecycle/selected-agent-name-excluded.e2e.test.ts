import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  fileExists,
  isClaudeCLIAvailable,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { readGeneratedUnion } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Where SelectedAgentName comes from, through a real CLI run.
 *
 * The alias is derived from the project config's own `agents[]` filtered to the
 * non-excluded rows. This spec pins that derivation end to end: the union must
 * be narrowed to those rows rather than left at its `AgentName` fallback.
 *
 * The assertions target the emitted `export type SelectedAgentName = ...`
 * declaration rather than the file, because every agent name also appears in
 * `AgentName` — a whole-file `toContain` could not fail either way. See the
 * KNOWN GAP at the end for the excluded-agent case this flow cannot produce.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("SelectedAgentName is derived from the config's agents", () => {
  let fixture: E2EPluginSource;
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    sourceDir = fixture.sourceDir;
    sourceTempDir = fixture.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string | undefined;

  afterEach(async () => {
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
  });

  it(
    "narrows SelectedAgentName to the agent rows the project config carries",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;

      // Phase 1: Global init -- install with default agents
      const globalWizard = await InitWizard.launch({
        source: { sourceDir, tempDir: sourceTempDir },
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase 2: Project init -- global install exists, so `cc init` lands on the
      // dashboard. Drive dashboard -> Edit -> build/sources/agents -> deselect
      // api-developer -> confirm. The deselect is what the KNOWN GAP below is
      // about; the run is still what produces the project pair this asserts on.
      const dashboard = await InitWizard.launchForDashboard({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
      });

      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

      // "Edit" is the first (default) dashboard option — press Enter to launch it.
      const build = await dashboard.selectEdit();

      // Establish project scope by toggling scope on web-framework-react in the
      // first domain, focused explicitly rather than relying on where the grid
      // opens. Without a project-scoped skill, no project-level
      // .claude-src/config-types.ts is generated.
      await build.focusSkill(E2E_SKILL.react.display);
      await build.toggleScopeOnFocusedSkill();

      // Pass through remaining domains, then sources.
      const sources = await build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();

      // The press the KNOWN GAP at the end is about, and it is a REFUSAL rather than a
      // deselect: api-developer is installed globally and this is a project edit, so the
      // product blocks the toggle and says so in a toast. It used to go through
      // `toggleAgent`, which was open-loop — the keystroke was spent, nothing moved, and
      // the run carried on as though the sub-agent had been deselected. `toggleAgent` is
      // closed-loop now and reports a refusal instead of passing it on, so the press takes
      // the same cursor-anchored raw wait `lifecycle/global-agent-toggle-guard` uses for
      // this exact state: the toast is the only surface the refusal reaches, and the wait
      // IS the assertion on it.
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
      await agents.toggleFocusedAgentAwaiting(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);

      const confirm = await agents.advance("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      await dashboard.destroy();

      // Read the project's config-types.ts
      const configTypesPath = configTypesTsPath(projectDir);
      expect(await fileExists(configTypesPath)).toBe(true);

      const content = await readTestFile(configTypesPath);

      const selectedAgentName = readGeneratedUnion(content, "SelectedAgentName");
      expect(
        selectedAgentName,
        "config-types.ts must declare a SelectedAgentName alias",
      ).toBeDefined();

      // Derived, not defaulted: falling back to `AgentName` is what the alias
      // emits when nothing narrows it, and that is the regression this guards.
      expect(
        selectedAgentName?.trim(),
        "SelectedAgentName must be narrowed to the config's agents, not left as AgentName",
      ).not.toBe("AgentName");

      // ...and narrowed to exactly the rows the config carries. Read structurally
      // from config.ts rather than hardcoded: the default install's roster is the
      // source's business, and this spec's claim is about the derivation.
      const { agents: agentRows } = await loadConfigOrFail(projectDir);
      const activeNames = agentRows.filter((agent) => !agent.excluded).map((agent) => agent.name);
      expect(activeNames, "the fixture must install at least one agent").not.toStrictEqual([]);
      expect(
        activeNames.filter((name) => !selectedAgentName?.includes(`"${name}"`)),
        "every active agent row must appear in SelectedAgentName",
      ).toStrictEqual([]);

      // KNOWN GAP: the excluded-agent half of this spec's original claim is not
      // reachable through this flow, and the reason is now asserted rather than
      // assumed: the product REFUSES the toggle above, which the press's toast wait
      // pins. Toggling api-developer off at PROJECT scope while it is installed
      // GLOBALLY does not write an excluded agent row — the
      // emitted config.ts carries all ten agents as active `scope: "global"`
      // entries, and its only `excluded` row is the web-framework-react SKILL
      // tombstone that `toggleScopeOnFocusedSkill` above mints. The original
      // assertion `expect(configContent).toContain("excluded")` was matching that
      // skill tombstone, which is why nobody noticed. The exclusion-filtering
      // itself is covered directly by the "narrows SelectedAgentName to the
      // config's non-excluded agents" unit test in config-types-writer.test.ts.
      // Restore this once a flow that tombstones a global AGENT exists:
      //
      // expect(
      //   selectedAgentName,
      //   "the excluded api-developer must NOT be in SelectedAgentName",
      // ).not.toContain(E2E_AGENT["api-developer"].name);
    },
  );
});
