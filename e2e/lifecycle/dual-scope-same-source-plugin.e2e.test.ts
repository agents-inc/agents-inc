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
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { createTestEnvironment, initGlobal, initProject } from "../fixtures/dual-scope-helpers.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName, StackAgentConfig } from "../../src/cli/types/index.js";

/**
 * Dual-scope, SAME source mode (both copies plugin/marketplace-sourced).
 *
 * A skill installed at BOTH scopes: the project owns an active project-scope
 * copy, and the shared global install is masked by a project-local tombstone
 * (`{scope:"global", excluded:true}`) — the D-223 dual-scope shape. Here both
 * halves are plugin-sourced, so the compiled agent reference uses the
 * `id:id` PluginSkillRef colon form (D-217).
 *
 * Test 1 drives real `cc init` against a plugin marketplace (global = all
 * plugin) then a real dashboard→edit that toggles api-framework-hono G→P
 * WITHOUT flipping sources to local (`{ setLocal: false }`), keeping the
 * project-scope copy plugin-sourced. Requires the Claude CLI because per-skill
 * plugin routing calls `claude plugin install`.
 *
 * Test 2 (fresh, seeded, minimal-stack) removes the GLOBAL copy via a real
 * `cc edit` at global scope and proves the project's own project-scope copy
 * survives — config, compiled agent reference (colon form), and filesystem. It
 * is seeded (like edit-global-remove-dual-scope-partial.e2e.test.ts) and uses a
 * NON-framework skill (web-testing-vitest) because framework skills are
 * required and cannot be deselected at global scope.
 *
 * The MIXED plugin/eject matrix is covered separately by
 * dual-scope-edit-mixed-sources.e2e.test.ts — this file is strictly the
 * both-plugin cell.
 */

const HONO_ID = "api-framework-hono";
const HONO_LABEL = "api-framework-hono";
const HONO_PLUGIN_REF = `${HONO_ID}:${HONO_ID}`;
const API_DEVELOPER: AgentName = "api-developer";
const WEB_DEVELOPER: AgentName = "web-developer";

const VITEST_ID = "web-testing-vitest";
const VITEST_LABEL = "web-testing-vitest";
const VITEST_PLUGIN_REF = `${VITEST_ID}:${VITEST_ID}`;

const claudeAvailable = await isClaudeCLIAvailable();

type PluginDualScopeEnv = {
  tempDir: string;
  fakeHome: string;
  projectDir: string;
};

describe.skipIf(!claudeAvailable)("dual-scope same-source (both plugin)", () => {
  let pluginSource: E2EPluginSource;
  let wizard: EditWizard | undefined;
  let currentTempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    pluginSource = await createE2EPluginSource();
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (pluginSource) await cleanupTempDir(pluginSource.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (currentTempDir) {
      await cleanupTempDir(currentTempDir);
      currentTempDir = undefined;
    }
  });

  /**
   * Bootstrap both-plugin dual-scope via real wizard flows:
   *   Phase A: init global with the plugin marketplace (all skills plugin).
   *   Phase B: dashboard→edit toggling hono G→P and api-developer to project,
   *            keeping sources plugin (setLocal: false).
   */
  async function establishPluginDualScope(): Promise<PluginDualScopeEnv> {
    const env = await createTestEnvironment();
    const { fakeHome, projectDir } = env;

    const phaseA = await initGlobal(pluginSource.sourceDir, pluginSource.tempDir, fakeHome);
    expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

    const phaseB = await initProject(
      pluginSource.sourceDir,
      pluginSource.tempDir,
      fakeHome,
      projectDir,
      { setLocal: false },
    );
    expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

    return { tempDir: env.tempDir, fakeHome, projectDir };
  }

  it(
    "config dual-scope shape (plugin source), colon agent ref, [P][G] badges, and s-toggle is a guarded no-op",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await establishPluginDualScope();
      currentTempDir = tempDir;

      // --- Check 1: project config carries the both-plugin dual-scope pair.
      // Both halves share the same (non-eject) marketplace source. ---
      const loaded = await loadProjectConfigFromDir(projectDir);
      expect(loaded, "project config.ts must exist").not.toBeNull();
      if (!loaded) return;
      const honoEntries = loaded.config.skills.filter((s) => s.id === HONO_ID);
      const active = honoEntries.find((s) => s.excluded !== true);
      const tombstone = honoEntries.find((s) => s.excluded === true);

      expect(honoEntries).toHaveLength(2);
      expect(active, "active project-scope hono entry must exist").toBeDefined();
      if (!active) return;
      const pluginSourceName = active.source;
      expect(pluginSourceName, "plugin source must not be eject").not.toBe("eject");
      expect(active).toStrictEqual({
        id: HONO_ID,
        scope: "project",
        source: pluginSourceName,
      });
      expect(tombstone).toStrictEqual({
        id: HONO_ID,
        scope: "global",
        source: pluginSourceName,
        excluded: true,
      });

      // --- Check 2: compiled project agent references hono in COLON form. ---
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [HONO_PLUGIN_REF],
      });

      // --- Check 3: re-open edit → dual-scope [P][G] badges render for hono. ---
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir: pluginSource.sourceDir, tempDir: pluginSource.tempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      await wizard.build.advanceDomain(); // Web → API
      await wizard.build.focusSkill(HONO_LABEL);
      const badgesBefore = await wizard.build.getScopeBadgesForSkill(HONO_LABEL);
      expect([...badgesBefore].sort()).toStrictEqual(["G", "P"]);

      // --- Check 4: pressing `s` on a PERSISTED dual-scope pair is an
      // intentional guarded no-op (toggleSkillScope guard in wizard-store.ts) —
      // it does NOT collapse to a single global entry; space is the sanctioned
      // collapse mechanism. ---
      await wizard.build.toggleScopeOnFocusedSkill();
      const badgesAfter = await wizard.build.getScopeBadgesForSkill(HONO_LABEL);
      expect([...badgesAfter].sort()).toStrictEqual(["G", "P"]);

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "removing the GLOBAL copy (edit at global scope) leaves the project's own plugin copy untouched",
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

      const vitestMetadata =
        `author: "@agents-inc"\ndisplayName: ${VITEST_ID}\ncategory: web-testing\nslug: vitest\n` +
        `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
        `contentHash: "b2c3d4e"\n`;

      const globalStack = {
        [WEB_DEVELOPER]: { "web-testing": [{ id: VITEST_ID, preloaded: false }] },
      } satisfies Partial<Record<AgentName, StackAgentConfig>>;
      const projectStack = {
        [API_DEVELOPER]: { "web-testing": [{ id: VITEST_ID, preloaded: true }] },
      } satisfies Partial<Record<AgentName, StackAgentConfig>>;

      const globalConfig = buildProjectConfig({
        name: "dual-scope-global-plugin",
        skills: buildSkillConfigs([VITEST_ID], { scope: "global", source: marketplace }),
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        domains: ["web"],
        selectedAgents: [WEB_DEVELOPER],
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
        skills: [
          ...buildSkillConfigs([VITEST_ID], {
            scope: "global",
            source: marketplace,
            excluded: true,
          }),
          ...buildSkillConfigs([VITEST_ID], { scope: "project", source: marketplace }),
        ],
        agents: buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
        domains: ["web"],
        selectedAgents: [API_DEVELOPER],
        stack: projectStack,
      });
      await writeProjectConfig(projectDir, projectConfig);
      await createLocalSkill(projectDir, VITEST_ID, {
        description: "Project's own vitest copy",
        metadata: vitestMetadata,
      });

      // Real `cc edit` at global scope (HOME === projectDir === globalHome):
      // deselect vitest (preloaded:false on web-developer ⇒ freely deselectable).
      const globalEdit = await EditWizard.launch({
        projectDir: globalHome,
        source: { sourceDir: pluginSource.sourceDir, tempDir: pluginSource.tempDir },
        env: { HOME: globalHome },
        rows: 60,
        cols: 120,
      });
      try {
        await globalEdit.build.selectSkill(VITEST_LABEL); // deselect global vitest
        const sources = await globalEdit.build.passThroughAllDomainsGeneric();
        await sources.waitForReady();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();
      } finally {
        await globalEdit.destroy();
      }

      // Global config: vitest gone from the global skills[] and stack.
      const globalLoaded = await loadProjectConfigFromDir(globalHome);
      expect(globalLoaded, "global config.ts must exist").not.toBeNull();
      if (!globalLoaded) return;
      expect(globalLoaded.config.skills.map((s) => s.id)).not.toContain(VITEST_ID);
      expect(globalLoaded.config.stack?.[WEB_DEVELOPER]?.["web-testing"]).toBeUndefined();

      // Project config: the project's OWN project-scope plugin vitest survives.
      const projectLoaded = await loadProjectConfigFromDir(projectDir);
      expect(projectLoaded, "project config.ts must exist").not.toBeNull();
      if (!projectLoaded) return;
      const p = projectLoaded.config;

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
        source: marketplace,
      });
      expect(p.stack?.[API_DEVELOPER]?.["web-testing"]).toStrictEqual([
        { id: VITEST_ID, preloaded: true },
      ]);

      // Compiled project agent still references the project-scope vitest in
      // COLON form (source is the marketplace, not eject).
      const compile = await CLI.run(
        ["compile", "--source", pluginSource.sourceDir],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );
      expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [VITEST_PLUGIN_REF],
      });

      // Filesystem: the project's own vitest skill dir survives.
      expect(
        await directoryExists(path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, VITEST_ID)),
        "project's own vitest skill dir must remain after global removal",
      ).toBe(true);
    },
  );
});
