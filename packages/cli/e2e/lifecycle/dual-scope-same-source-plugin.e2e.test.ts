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
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  createTestEnvironment,
  initGlobal,
  initProject,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
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
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

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
 * NON-framework skill (web-testing-vitest).
 *
 * The MIXED plugin/eject matrix is covered separately by
 * dual-scope-edit-mixed-sources.e2e.test.ts — this file is strictly the
 * both-plugin cell.
 */

const HONO_ID = E2E_SKILL.hono.id;
const HONO_PLUGIN_REF = `${HONO_ID}:${HONO_ID}`;

const VITEST_ID = E2E_SKILL.vitest.id;
const VITEST_PLUGIN_REF = `${VITEST_ID}:${VITEST_ID}`;

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("dual-scope same-source (both plugin)", () => {
  let pluginSource: E2EPluginSource;
  let wizard: EditWizard | undefined;
  let currentTempDir: string | undefined;

  beforeAll(async () => {
    pluginSource = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupFixture(pluginSource);
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
  async function establishPluginDualScope(): Promise<TestEnvironment> {
    const env = await createTestEnvironment();
    const { fakeHome, projectDir } = env;

    const phaseA = await initGlobal(pluginSource, fakeHome);
    expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

    const phaseB = await initProject(pluginSource, fakeHome, projectDir, { setLocal: false });
    expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

    return { tempDir: env.tempDir, fakeHome, projectDir };
  }

  it(
    "config dual-scope shape (plugin source), colon agent ref, [P][G] badges, and s-toggle collapses the pair",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await establishPluginDualScope();
      currentTempDir = tempDir;

      // --- Check 1: project config carries the both-plugin dual-scope pair.
      // Both halves share the same (non-eject) marketplace source. ---
      const projectConfigAfterInit = await loadConfigOrFail(projectDir);
      const honoEntries = projectConfigAfterInit.skills.filter((s) => s.id === HONO_ID);
      const active = honoEntries.find((s) => s.excluded !== true);
      const tombstone = honoEntries.find((s) => s.excluded === true);

      expect(honoEntries).toHaveLength(2);
      expect(active, "active project-scope hono entry must exist").toBeDefined();
      if (!active) return;
      const pluginSourceName = active.origin;
      expect(pluginSourceName, "plugin source must not be eject").not.toBe("eject");
      expect(active).toStrictEqual({
        id: HONO_ID,
        scope: "project",
        origin: pluginSourceName,
      });
      expect(tombstone).toStrictEqual({
        id: HONO_ID,
        scope: "global",
        origin: pluginSourceName,
        excluded: true,
      });

      // --- Check 2: compiled project agent references hono in COLON form. ---
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["api-developer"].name,
        {
          contains: [HONO_PLUGIN_REF],
        },
      );

      // --- Check 3: re-open edit → dual-scope [P][G] badges render for hono. ---
      wizard = await EditWizard.launch({
        projectDir,
        source: pluginSource,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      await wizard.build.advanceDomain(); // Web → API
      await wizard.build.focusSkill(E2E_SKILL.hono.display);
      const badgesBefore = await wizard.build.getScopeBadgesForSkill(E2E_SKILL.hono.display);
      expect([...badgesBefore].sort()).toStrictEqual(["G", "P"]);

      // --- Check 4: pressing `s` on a PERSISTED dual-scope pair collapses it to
      // the single inherited-global entry — `s` is the sole dual-scope toggle. ---
      await wizard.build.toggleScopeOnFocusedSkill();
      const badgesAfter = await wizard.build.getScopeBadgesForSkill(E2E_SKILL.hono.display);
      expect(badgesAfter, "`s` must collapse the persisted [P][G] pair to [G]").toStrictEqual([
        "G",
      ]);

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
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

      // Real `cc edit` at global scope (HOME === projectDir === globalHome):
      // deselect vitest (preloaded:false on web-developer ⇒ freely deselectable).
      const globalEdit = await EditWizard.launch({
        projectDir: globalHome,
        source: pluginSource,
        env: { HOME: globalHome },
        ...TERMINAL_SIZE.TALL,
      });
      try {
        await globalEdit.build.selectSkill(E2E_SKILL.vitest.display); // deselect global vitest
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

  it(
    "switching only the project entry to local ejects the project copy without touching the global plugin or tombstone",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await establishPluginDualScope();
      currentTempDir = tempDir;

      const honoPluginRef = buildMarketplacePluginRef(HONO_ID, pluginSource.marketplaceName);

      // --- Pre-state: the untouched dual-scope both-plugin shape. ---
      // Global config owns an active global-scope hono, plugin-sourced.
      const globalHonoBefore = (await loadConfigOrFail(fakeHome)).skills.find(
        (s) => s.id === HONO_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(
        globalHonoBefore,
        "global config must carry an active global hono entry",
      ).toBeDefined();
      if (!globalHonoBefore) return;
      const marketplaceSource = globalHonoBefore.origin;
      expect(marketplaceSource, "global hono must start plugin-sourced").not.toBe(EJECT_SOURCE);

      // Project config owns the active project hono plus the masked global
      // tombstone, both carrying the same non-eject marketplace source.
      const projectSkillsBefore = (await loadConfigOrFail(projectDir)).skills;
      const projectHonoBefore = projectSkillsBefore.find(
        (s) => s.id === HONO_ID && s.scope === "project" && s.excluded !== true,
      );
      const tombstoneBefore = projectSkillsBefore.find(
        (s) => s.id === HONO_ID && s.scope === "global" && s.excluded === true,
      );
      expect(
        projectHonoBefore,
        "project config must carry an active project hono entry",
      ).toBeDefined();
      expect(tombstoneBefore, "project config must carry the global hono tombstone").toBeDefined();
      if (!projectHonoBefore || !tombstoneBefore) return;
      expect(projectHonoBefore.origin, "project hono must start plugin-sourced").not.toBe(
        EJECT_SOURCE,
      );
      expect(tombstoneBefore.origin, "global tombstone must start plugin-sourced").not.toBe(
        EJECT_SOURCE,
      );

      // Global plugin is registered at Claude user scope, and neither scope has
      // an ejected copy on disk yet.
      await expect({ dir: fakeHome }).toHavePluginInRegistry(honoPluginRef, "user");
      expect(
        await directoryExists(path.join(skillsPath(projectDir), HONO_ID)),
        "project must have no ejected hono copy before the switch",
      ).toBe(false);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), HONO_ID)),
        "global scope must have no ejected hono copy before the switch",
      ).toBe(false);

      // --- Act: edit at the project, set ONLY hono's source to Local (eject).
      // hono is the sole project-scope row and sorts last, so wrap the cursor up
      // to it and commit the Local column, leaving every global row plugin. ---
      wizard = await EditWizard.launch({
        projectDir,
        source: pluginSource,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      await sources.navigateUp();
      await sources.selectFocusedSourceCell();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // --- (a) The GLOBAL config is untouched: hono stays active at global scope
      // with its marketplace source. ---
      const globalHonoAfter = (await loadConfigOrFail(fakeHome)).skills.find(
        (s) => s.id === HONO_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(
        globalHonoAfter,
        "global config's active global hono entry must be unchanged by a project-scope switch",
      ).toStrictEqual(globalHonoBefore);

      // --- (b) The project-scope eject must not uninstall the still-needed
      // global plugin at Claude user scope. ---
      await expect({ dir: fakeHome }).toHavePluginInRegistry(honoPluginRef, "user");

      // --- (c) In the PROJECT config the active project entry flips to eject,
      // but the global tombstone must keep its marketplace source — a
      // project-scope source change must apply to the project entry only. ---
      const projectSkillsAfter = (await loadConfigOrFail(projectDir)).skills;
      const projectHonoAfter = projectSkillsAfter.find(
        (s) => s.id === HONO_ID && s.scope === "project" && s.excluded !== true,
      );
      const tombstoneAfter = projectSkillsAfter.find(
        (s) => s.id === HONO_ID && s.scope === "global" && s.excluded === true,
      );
      expect(projectHonoAfter, "active project hono must record the eject switch").toStrictEqual({
        ...projectHonoBefore,
        origin: EJECT_SOURCE,
      });
      expect(
        tombstoneAfter,
        "global tombstone must retain its marketplace source, not inherit the project eject",
      ).toStrictEqual(tombstoneBefore);

      // --- (d) The project gains an ejected hono copy; the global scope never
      // gains one. ---
      expect(
        await directoryExists(path.join(skillsPath(projectDir), HONO_ID)),
        "project must have an ejected hono copy after the switch",
      ).toBe(true);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), HONO_ID)),
        "global scope must have no ejected hono copy after the switch",
      ).toBe(false);
    },
  );

  it(
    "setting all sources to eject flips the project entry but leaves the global tombstone's marketplace source intact",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await establishPluginDualScope();
      currentTempDir = tempDir;

      const honoPluginRef = buildMarketplacePluginRef(HONO_ID, pluginSource.marketplaceName);

      // --- Pre-state: the untouched dual-scope both-plugin shape. ---
      // Global config owns an active global-scope hono, plugin-sourced.
      const globalHonoBefore = (await loadConfigOrFail(fakeHome)).skills.find(
        (s) => s.id === HONO_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(
        globalHonoBefore,
        "global config must carry an active global hono entry",
      ).toBeDefined();
      if (!globalHonoBefore) return;
      expect(globalHonoBefore.origin, "global hono must start plugin-sourced").not.toBe(
        EJECT_SOURCE,
      );

      // Project config owns the active project hono plus the masked global
      // tombstone, both carrying the same non-eject marketplace source.
      const projectSkillsBefore = (await loadConfigOrFail(projectDir)).skills;
      const projectHonoBefore = projectSkillsBefore.find(
        (s) => s.id === HONO_ID && s.scope === "project" && s.excluded !== true,
      );
      const tombstoneBefore = projectSkillsBefore.find(
        (s) => s.id === HONO_ID && s.scope === "global" && s.excluded === true,
      );
      expect(
        projectHonoBefore,
        "project config must carry an active project hono entry",
      ).toBeDefined();
      expect(tombstoneBefore, "project config must carry the global hono tombstone").toBeDefined();
      if (!projectHonoBefore || !tombstoneBefore) return;
      expect(projectHonoBefore.origin, "project hono must start plugin-sourced").not.toBe(
        EJECT_SOURCE,
      );
      expect(tombstoneBefore.origin, "global tombstone must start plugin-sourced").not.toBe(
        EJECT_SOURCE,
      );

      // Global plugin is registered at Claude user scope, and neither scope has
      // an ejected copy on disk yet.
      await expect({ dir: fakeHome }).toHavePluginInRegistry(honoPluginRef, "user");
      expect(
        await directoryExists(path.join(skillsPath(projectDir), HONO_ID)),
        "project must have no ejected hono copy before the set-all",
      ).toBe(false);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), HONO_ID)),
        "global scope must have no ejected hono copy before the set-all",
      ).toBe(false);

      // --- Act: edit at the project and set every editable source to eject. The
      // Sources step binds no bulk key; `setAllLocal` commits the mode on each
      // focusable row in turn, which for this fixture is hono's project row alone.
      // The tombstone is not a row at all, and `setInstallMode` writes only the
      // ACTIVE entry at the acting scope, so the leak this spec pins has two
      // independent stops. ---
      wizard = await EditWizard.launch({
        projectDir,
        source: pluginSource,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // --- Guard (a): the GLOBAL config is untouched — hono stays active at
      // global scope with its marketplace source. A project-scope set-all must
      // not rewrite the global install. ---
      const globalHonoAfter = (await loadConfigOrFail(fakeHome)).skills.find(
        (s) => s.id === HONO_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(
        globalHonoAfter,
        "global config's active global hono entry must be unchanged by a project-scope set-all",
      ).toStrictEqual(globalHonoBefore);

      // --- Guard (b): the project eject must not uninstall the still-needed
      // global plugin at Claude user scope. ---
      await expect({ dir: fakeHome }).toHavePluginInRegistry(honoPluginRef, "user");

      const projectSkillsAfter = (await loadConfigOrFail(projectDir)).skills;
      const projectHonoAfter = projectSkillsAfter.find(
        (s) => s.id === HONO_ID && s.scope === "project" && s.excluded !== true,
      );
      const tombstoneAfter = projectSkillsAfter.find(
        (s) => s.id === HONO_ID && s.scope === "global" && s.excluded === true,
      );

      // --- Guard (c): the active project hono correctly flips to eject — that is
      // the intended effect of "set all sources to eject". ---
      expect(projectHonoAfter, "active project hono must record the eject switch").toStrictEqual({
        ...projectHonoBefore,
        origin: EJECT_SOURCE,
      });

      // --- Guard (d): the project gains an ejected hono copy; the global scope
      // never gains one. ---
      expect(
        await directoryExists(path.join(skillsPath(projectDir), HONO_ID)),
        "project must have an ejected hono copy after the set-all",
      ).toBe(true);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), HONO_ID)),
        "global scope must have no ejected hono copy after the set-all",
      ).toBe(false);

      // --- Primary invariant: the masked global tombstone must KEEP its
      // marketplace source. It records the source of the masked global install,
      // not a source the project user is choosing, so a project-scope set-all
      // must leave it untouched. ---
      expect(
        tombstoneAfter,
        "global tombstone must retain its marketplace source, not inherit the set-all eject",
      ).toStrictEqual(tombstoneBefore);
    },
  );
});
