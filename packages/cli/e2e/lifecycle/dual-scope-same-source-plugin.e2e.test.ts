import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  isClaudeCLIAvailable,
  loadConfigOrFail,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * Dual-scope, SAME source mode (both copies plugin/marketplace-sourced).
 *
 * A skill installed at BOTH scopes: the project owns an active project-scope
 * copy, and the shared global install is masked by a project-local tombstone
 * (`{scope:"global", excluded:true}`) — the D-223 dual-scope shape. Here both
 * halves are plugin-sourced, so the compiled agent reference uses the
 * `id:id` PluginSkillRef colon form (D-217).
 *
 * The seeded pair has its GLOBAL copy removed by a real `edit --from` at global
 * scope, and the project's own project-scope copy must survive — config,
 * compiled agent reference (colon form), and filesystem. It uses a
 * NON-framework skill (web-testing-vitest). Requires the Claude CLI because
 * per-skill plugin routing calls `claude plugin uninstall`.
 *
 * The MIXED plugin/eject matrix is covered separately by
 * dual-scope-edit-mixed-sources.e2e.test.ts — this file is strictly the
 * both-plugin cell.
 */

const VITEST_ID = E2E_SKILL.vitest.id;
const VITEST_PLUGIN_REF = `${VITEST_ID}:${VITEST_ID}`;

const claudeAvailable = await isClaudeCLIAvailable();

/** The global installation's configuration without vitest: its sub-agent on, holding nothing. */
const WITHOUT_VITEST_ID = "NoVitst2";

describe.skipIf(!claudeAvailable)("dual-scope same-source (both plugin)", () => {
  let pluginSource: E2EPluginSource;
  let store: SeedConfigStore;
  let currentTempDir: string | undefined;

  beforeAll(async () => {
    pluginSource = await createE2EPluginSource();
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_VITEST_ID,
      buildSeedPayload({
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "global" } },
      }),
    );
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(pluginSource);
  });

  afterEach(async () => {
    if (currentTempDir) {
      await cleanupTempDir(currentTempDir);
      currentTempDir = undefined;
    }
  });

  it(
    "removing the GLOBAL copy (edit --from at global scope) leaves the project's own plugin copy untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Fresh seeded dual-scope env (do NOT chain off the previous test):
      //   global: vitest (plugin marketplace source) referenced by web-developer
      //           (preloaded:false) so it can be cleanly deselected at global scope.
      //   project: its OWN project-scope vitest (same plugin source) referenced by
      //            api-developer (preloaded:true) + the inherited-global tombstone.
      const marketplace = pluginSource.marketplaceName;
      currentTempDir = await createTempDir();
      const globalHome = path.join(currentTempDir, "home");
      const projectDir = path.join(currentTempDir, "project");
      await mkdir(globalHome, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await createPermissionsFile(globalHome);
      await createPermissionsFile(projectDir);

      const vitestMetadata = renderMetadataYaml({
        author: "@agents-inc",
        displayName: E2E_SKILL.vitest.display,
        category: "web-testing",
        slug: "vitest",
        cliDescription: "E2E test skill",
        usageGuidance: "Use when testing E2E scenarios",
        contentHash: "b2c3d4e",
      });

      const globalStack = {
        [E2E_AGENT["web-developer"].name]: { "web-testing": [{ id: VITEST_ID, preloaded: false }] },
      } satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;
      const projectStack = {
        [E2E_AGENT["api-developer"].name]: { "web-testing": [{ id: VITEST_ID, preloaded: true }] },
      } satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

      const globalConfig = buildProjectConfig({
        name: "dual-scope-global-plugin",
        marketplace: pluginSource.sourceDir,
        skills: buildSkillConfigs([VITEST_ID], { scope: "global", origin: marketplace }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [realpathSync(projectDir)],
      });
      await writeProjectConfig(globalHome, globalConfig);
      await createLocalSkill(globalHome, VITEST_ID, {
        description: "Global vitest copy",
        metadata: vitestMetadata,
      });

      const projectConfig = buildProjectConfig({
        name: "dual-scope-project-plugin",
        marketplace: pluginSource.sourceDir,
        skills: [
          ...buildSkillConfigs([VITEST_ID], {
            scope: "global",
            origin: marketplace,
            excluded: true,
          }),
          ...buildSkillConfigs([VITEST_ID], { scope: "project", origin: marketplace }),
        ],
        agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
        selectedDomains: ["web"],
        stack: projectStack,
      });
      await writeProjectConfig(projectDir, projectConfig);
      await createLocalSkill(projectDir, VITEST_ID, {
        description: "Project's own vitest copy",
        metadata: vitestMetadata,
      });

      // A real `edit --from` at global scope (HOME === cwd === globalHome) of a
      // configuration that leaves vitest out.
      const globalEdit = await applyEditFrom(store, WITHOUT_VITEST_ID, { dir: globalHome });
      expect(globalEdit.exitCode, globalEdit.output).toBe(EXIT_CODES.SUCCESS);

      // Global config: vitest gone from the global skills[] and stack.
      const globalAfterEdit = await loadConfigOrFail(globalHome);
      expect(globalAfterEdit.skills.map((s) => s.id)).not.toContain(VITEST_ID);
      expect(
        globalAfterEdit.stack?.[E2E_AGENT["web-developer"].name]?.["web-testing"],
      ).toBeUndefined();

      // Project config: the project's OWN project-scope plugin vitest survives.
      const p = await loadConfigOrFail(projectDir);

      // Proof-of-execution: propagation rewrote the project, dropping the stale
      // inherited-global vitest (tombstone).
      expect(
        p.skills.filter((s) => s.scope === "global").length,
        "propagation must drop the inherited-global vitest from the project",
      ).toBe(0);

      const projectVitest = p.skills.find((s) => s.id === VITEST_ID && s.scope === "project");
      expect(projectVitest).toStrictEqual({
        id: VITEST_ID,
        scope: "project",
        origin: marketplace,
      });
      expect(p.stack?.[E2E_AGENT["api-developer"].name]?.["web-testing"]).toStrictEqual([
        { id: VITEST_ID, preloaded: true },
      ]);

      // Compiled project agent still references the project-scope vitest in
      // COLON form (source is the marketplace, not eject).
      const compile = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );
      expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["api-developer"].name,
        {
          contains: [VITEST_PLUGIN_REF],
        },
      );

      // Filesystem: the project's own vitest skill dir survives.
      expect(
        await directoryExists(path.join(skillsPath(projectDir), VITEST_ID)),
        "project's own vitest skill dir must remain after global removal",
      ).toBe(true);
    },
  );
});
