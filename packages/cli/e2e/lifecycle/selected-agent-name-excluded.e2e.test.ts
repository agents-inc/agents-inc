import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS } from "../pages/constants.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
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
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * `SelectedAgentName` is derived from the config's non-excluded `agents[]` rows, not left at its
 * `AgentName` fallback. Asserted on the emitted alias, since every name also appears in
 * `AgentName`. See the KNOWN GAP at the end.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("SelectedAgentName is derived from the config's agents", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    sourceDir = fixture.sourceDir;
    sourceTempDir = fixture.tempDir;
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
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

      await installFromSeed(
        store,
        "Plugins1",
        e2eStackPayload({ install: "plugin" }),
        { dir: fakeHome, home: fakeHome },
        sourceDir,
      );

      // React moved into the project (assigned to no sub-agent) and api-developer left out.
      await installFromSeed(
        store,
        "ReactProject1",
        e2eStackPayload({
          install: "plugin",
          projectSkills: [E2E_SKILL.react.id],
          unassigned: [E2E_SKILL.react.id],
          withoutAgents: [E2E_AGENT["api-developer"].name],
        }),
        { dir: projectDir, home: fakeHome },
        sourceDir,
      );

      const configTypesPath = configTypesTsPath(projectDir);
      expect(await fileExists(configTypesPath)).toBe(true);

      const content = await readTestFile(configTypesPath);

      const selectedAgentName = readGeneratedUnion(content, "SelectedAgentName");
      expect(
        selectedAgentName,
        "config-types.ts must declare a SelectedAgentName alias",
      ).toBeDefined();

      // Derived, not defaulted: the `AgentName` fallback is the regression.
      expect(
        selectedAgentName?.trim(),
        "SelectedAgentName must be narrowed to the config's agents, not left as AgentName",
      ).not.toBe("AgentName");

      // Read from config.ts: the default roster is the source's business.
      const { agents: agentRows } = await loadConfigOrFail(projectDir);
      const activeNames = agentRows.filter((agent) => !agent.excluded).map((agent) => agent.name);
      expect(activeNames, "the fixture must install at least one agent").not.toStrictEqual([]);
      expect(
        activeNames.filter((name) => !selectedAgentName?.includes(`'${name}'`)),
        "every active agent row must appear in SelectedAgentName",
      ).toStrictEqual([]);

      // KNOWN GAP: leaving api-developer out of a project install while it is installed globally
      // writes no excluded agent row, so this flow cannot reach the excluded case (covered in
      // config-types-writer.test.ts). Restore once a flow tombstones a global AGENT:
      //
      // expect(
      //   selectedAgentName,
      //   "the excluded api-developer must NOT be in SelectedAgentName",
      // ).not.toContain(E2E_AGENT["api-developer"].name);
    },
  );
});
