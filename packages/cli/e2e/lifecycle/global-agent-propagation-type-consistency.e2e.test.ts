import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createPermissionsFile,
  ensureBinaryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  finishWizard,
  readActiveAgentNames,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT_DISPLAY } from "../fixtures/expected-values.js";
import { EDIT_PROJECT_SETUP_FLAG } from "../../src/cli/consts.js";
import { readGeneratedUnionMembers } from "../../src/cli/lib/__tests__/helpers/generated-types.js";

/**
 * Global-agent propagation — the propagated config pair's value and type sides
 * must stay in lockstep in every registered project.
 *
 * `ProjectConfig` persists no flat selected-agent list. The selected set is
 * derived from the non-excluded `config.agents[]` rows via `activeAgentNames`
 * (`src/cli/lib/configuration/scope-predicates.ts`), and the emitted
 * `SelectedAgentName` union in `config-types.ts` is derived from those same
 * rows (`config-types-writer.ts`, reached through `regenerateConfigTypes` in
 * the gate's `writeProjectConfigPair`). Both halves of a project's pair are
 * written from the same effective config in the same call, so after a global
 * change fans out, a project's active agent rows and its `SelectedAgentName`
 * union must name the same set — drift between them is the regression this
 * spec pins.
 *
 * Setup (exercises the real CLI pipeline end-to-end):
 *   1. Global init at HOME with api-developer DESELECTED — the global agents
 *      rows (and the union they seed) start without it.
 *   2. Register Project B via the Edit an `init` dashboard opens — `cc edit
 *      --project-setup`, the door that makes that directory the run's subject —
 *      with a minimal agent-scope change (web-developer G→P). A pure passthrough
 *      edit does not create the project config, so the toggle forces config
 *      generation and project registration. B's rows inherit the narrow global set.
 *   3. Register Project A the same way.
 *   4. Run `cc edit` in Project A and toggle api-developer ON. The agent
 *      lands at the wizard's default `scope: global`; `splitConfigByScope`
 *      routes it to the global partition, `mergeGlobalConfigs` appends the
 *      new global agent, and `propagateGlobalChangesToProjects` rewrites
 *      Project B's config pair.
 *
 * Assertion: after propagation, Project B's active agent rows (via
 * `activeAgentNames` over its `config.ts`) and its `SelectedAgentName` union
 * in `config-types.ts` must both include api-developer and must match as sets.
 */

const WEB_DEVELOPER_AGENT = "web-developer";
const API_DEVELOPER_AGENT = "api-developer";
const SELECTED_AGENT_ALIAS = "SelectedAgentName";

/**
 * Launch `cc init` at HOME and complete the wizard with api-developer
 * DESELECTED in the agents step. Sources set to local (eject mode).
 *
 * Selecting the E2E stack preselects the roster that stack declares —
 * web-developer and api-developer, and nothing the domains would have
 * added. Toggling api-developer off leaves the rest of the declared
 * roster intact. A fresh init with no pre-existing installedAgentConfigs
 * treats toggle-off as a CLEAN removal (no tombstone) — verified in
 * wizard-store.toggleAgent where `effectiveInstalledConfigs` is `null`
 * for fresh init — so api-developer gets no row in the global `agents`
 * array at all, and therefore none in the union derived from it.
 */
async function initGlobalWithoutApiDeveloper(
  sourceDir: string,
  sourceTempDir: string,
  homeDir: string,
): Promise<{ exitCode: number; output: string }> {
  const wizard = await InitWizard.launch({
    source: { sourceDir, tempDir: sourceTempDir },
    projectDir: homeDir,
    env: { HOME: homeDir },
  });

  try {
    const domain = await wizard.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    const sources = await build.passThroughAllDomains();
    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.advance();

    // Deselect api-developer. Fresh global init → no tombstone → the row
    // simply leaves `config.agents`.
    await agents.toggleAgent(E2E_AGENT_DISPLAY["api-developer"]);
    const confirm = await agents.advance("init");
    return finishWizard(await confirm.confirm());
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * Register a project with the global config by driving the Edit wizard an `init`-originated
 * dashboard selection would open, and toggling the scope of one existing global agent to
 * project (web-developer G→P). A pure passthrough edit does NOT create the project config
 * (see `edit-global-fallback.e2e.test.ts`), so we need some state change to force config
 * generation and project registration.
 *
 * `--project-setup` is the flag `init`'s dashboard appends for an `init`-originated Edit, and
 * it is what makes this directory the run's subject. Without it a bare `cc edit` here edits
 * the installation it FOUND — the global one — because this directory holds no config of its
 * own; `resolveEditRoot` in `commands/edit.tsx` decides that, the scope toggle is inert under
 * it, and the registration this helper exists to perform would silently not happen. Reaching
 * the same wizard by the same door the docblock always described.
 *
 * We toggle an AGENT's scope (not a skill's) so the registration leaves every
 * skill at global scope. Phase 4 then adds api-developer as the ONLY new
 * global-scoped entry, which is what makes `classifyGlobalChange` report a
 * change whose consequence tier propagates — a project-scoped skill added here
 * would register the project just as well but would not isolate the promotion
 * as the propagating change.
 */
async function registerProjectViaAgentScopeChange(
  sourceDir: string,
  sourceTempDir: string,
  fakeHome: string,
  projectDir: string,
): Promise<{ exitCode: number; output: string }> {
  const editWizard = await EditWizard.launch({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
    env: { HOME: fakeHome },
    extraArgs: [`--${EDIT_PROJECT_SETUP_FLAG}`],
    ...TERMINAL_SIZE.TALL,
  });

  try {
    const sources = await editWizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();

    // Toggle web-developer's scope G→P. Minimal project-level change
    // that creates a project-scoped agent without creating any
    // project-scoped skills, so Phase 4's promotion is the only global
    // change in play.
    await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["web-developer"]);
    await agents.toggleScopeOnFocusedAgent();

    const confirm = await agents.advance("edit");
    return finishWizard(await confirm.confirm());
  } catch (e) {
    await editWizard.destroy();
    throw e;
  }
}

/**
 * Run `cc edit` in the given project (A) and toggle api-developer ON.
 * `applyAgentToggle` (`stores/wizard-store.ts`) appends every newly
 * selected agent as `{ name, scope: "global" }`, so the promotion needs
 * no further nudging.
 *
 * `splitConfigByScope` routes that row to the global partition,
 * `mergeGlobalConfigs` appends it as a new global agent, and
 * `writeScopedFromWizard`'s project-context branch
 * (`writeFromProjectContext` in `lib/config-gate/index.ts`) hands the
 * classified change to `applyConsequences`, which calls
 * `propagateGlobalChangesToProjects` for every OTHER registered project
 * — Project B.
 *
 * Driving the promotion from a project context rather than from HOME is
 * the point: this spec is about a project edit fanning a new global
 * agent out to a sibling project, which is the shape the value/type
 * drift showed up in.
 */
async function addApiDeveloperGloballyViaProjectEdit(
  sourceDir: string,
  sourceTempDir: string,
  fakeHome: string,
  projectDir: string,
): Promise<{ exitCode: number; output: string }> {
  const editWizard = await EditWizard.launch({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
    env: { HOME: fakeHome },
    ...TERMINAL_SIZE.TALL,
  });

  try {
    const sources = await editWizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();

    // Toggle api-developer ON. `applyAgentToggle` appends it at
    // `scope: "global"`, which is what routes it to the global partition.
    await agents.toggleAgent(E2E_AGENT_DISPLAY["api-developer"]);
    const confirm = await agents.advance("edit");
    return finishWizard(await confirm.confirm());
  } catch (e) {
    await editWizard.destroy();
    throw e;
  }
}

describe("global-agent propagation -- value and type sides stay in lockstep", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "propagates a newly-globalized agent to both the agent rows AND the SelectedAgentName type of every registered project",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Build global install with api-developer DESELECTED at
      // the agents step, so the global agent rows (and the
      // `SelectedAgentName` union they seed) start without it.
      // ================================================================
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;
      const projectADir = path.join(fakeHome, "project-A");
      const projectBDir = path.join(fakeHome, "project-B");

      await mkdir(projectADir, { recursive: true });
      await mkdir(projectBDir, { recursive: true });
      await createPermissionsFile(projectADir);
      await createPermissionsFile(projectBDir);

      const phase1 = await initGlobalWithoutApiDeveloper(sourceDir, sourceTempDir, fakeHome);
      expect(phase1.exitCode, `Global init failed: ${phase1.output}`).toBe(EXIT_CODES.SUCCESS);

      const globalConfigPath = configTsPath(fakeHome);
      const globalTypesPath = configTypesTsPath(fakeHome);
      expect(await fileExists(globalConfigPath)).toBe(true);
      expect(await fileExists(globalTypesPath)).toBe(true);

      // Sanity: global starts WITHOUT api-developer. The preselected set
      // is the stack's declared roster minus the one agent the helper
      // toggled off — what matters here is that api-developer is absent
      // and that the value/type sides agree on the initial narrow set.
      const globalTypesPhase1 = await readTestFile(globalTypesPath);
      const globalSelectedPhase1 = await readActiveAgentNames(fakeHome);
      const globalTypeUnionPhase1 = readGeneratedUnionMembers(
        globalTypesPhase1,
        SELECTED_AGENT_ALIAS,
      );
      expect(globalSelectedPhase1).toContain(WEB_DEVELOPER_AGENT);
      expect(globalSelectedPhase1).not.toContain(API_DEVELOPER_AGENT);
      expect([...globalTypeUnionPhase1].sort()).toStrictEqual([...globalSelectedPhase1].sort());

      // ================================================================
      // Phase 2: Register Project B. A pure passthrough edit would NOT
      // create B's project config (see edit-global-fallback.e2e.test.ts)
      // — the edit command returns early with "No changes made". So we
      // make the minimal change that forces project config creation:
      // toggle web-developer G→P in the agents step. An agent-scope
      // change (not a skill-scope change) is intentional — see the
      // helper's docstring for why. B's stored agent rows inherit from
      // the narrow global verbatim.
      // ================================================================
      const projectBRegistration = await registerProjectViaAgentScopeChange(
        sourceDir,
        sourceTempDir,
        fakeHome,
        projectBDir,
      );
      expect(projectBRegistration.exitCode, "Project B registration should succeed").toBe(
        EXIT_CODES.SUCCESS,
      );

      const projectBConfigPath = configTsPath(projectBDir);
      const projectBTypesPath = configTypesTsPath(projectBDir);
      expect(await fileExists(projectBConfigPath)).toBe(true);
      expect(await fileExists(projectBTypesPath)).toBe(true);

      // Pre-condition: B starts without api-developer and the value/type
      // sides agree. The exact contents follow the stack's declared roster —
      // the invariant under test is symmetry and api-developer's absence,
      // not the specific composition.
      const projectBTypesBefore = await readTestFile(projectBTypesPath);
      const projectBSelectedBefore = await readActiveAgentNames(projectBDir);
      const projectBTypeUnionBefore = readGeneratedUnionMembers(
        projectBTypesBefore,
        SELECTED_AGENT_ALIAS,
      );
      expect(
        projectBSelectedBefore,
        "Project B's active agent rows must not contain api-developer before global promotion",
      ).not.toContain(API_DEVELOPER_AGENT);
      expect(
        projectBTypeUnionBefore,
        "Project B SelectedAgentName union must not contain api-developer before global promotion",
      ).not.toContain(API_DEVELOPER_AGENT);
      expect(
        [...projectBTypeUnionBefore].sort(),
        "Pre-condition: Project B value and type sides must be in lockstep before the promotion event",
      ).toStrictEqual([...projectBSelectedBefore].sort());

      // ================================================================
      // Phase 3: Register Project A the same way. Order matters only
      // because A's Phase-4 edit propagates to every registered project
      // that is NOT the current one — so B must be registered before
      // the promotion edit is run.
      // ================================================================
      const projectARegistration = await registerProjectViaAgentScopeChange(
        sourceDir,
        sourceTempDir,
        fakeHome,
        projectADir,
      );
      expect(projectARegistration.exitCode, "Project A registration should succeed").toBe(
        EXIT_CODES.SUCCESS,
      );

      // ================================================================
      // Phase 4: Promote api-developer to global via `cc edit` in Project
      // A. The edit adds a NEW global-scoped agent to global config
      // (via splitConfigByScope → mergeGlobalConfigs), triggering
      // `propagateGlobalChangesToProjects` for every other registered
      // project — specifically Project B.
      // ================================================================
      const projectBContentBefore = await readTestFile(projectBConfigPath);
      const phase4 = await addApiDeveloperGloballyViaProjectEdit(
        sourceDir,
        sourceTempDir,
        fakeHome,
        projectADir,
      );
      expect(phase4.exitCode, `Global edit failed: ${phase4.output}`).toBe(EXIT_CODES.SUCCESS);

      // Sanity: propagation must actually have rewritten B's config.ts
      // and the global config must actually have grown. Otherwise the
      // lockstep assertions below would be vacuous passes.
      const projectBContentAfter = await readTestFile(projectBConfigPath);
      expect(
        projectBContentAfter,
        "Pre-condition: propagation must rewrite Project B's config.ts after Phase 4",
      ).not.toStrictEqual(projectBContentBefore);

      const globalSelectedAfter = await readActiveAgentNames(fakeHome);
      expect(
        globalSelectedAfter,
        "Pre-condition: the global config's active agent rows must include api-developer after Phase 4",
      ).toContain(API_DEVELOPER_AGENT);

      // ================================================================
      // Phase 5: the assertion this spec exists for — the value AND type
      // sides of Project B's config must both carry api-developer.
      // ================================================================
      const projectBTypesAfter = await readTestFile(projectBTypesPath);

      const projectBSelectedAfter = await readActiveAgentNames(projectBDir);
      const projectBTypeUnionAfter = readGeneratedUnionMembers(
        projectBTypesAfter,
        SELECTED_AGENT_ALIAS,
      );

      // Value side: the active rows of config.ts::agents MUST contain api-developer.
      expect(
        projectBSelectedAfter,
        "Project B config.ts::agents must include an active api-developer row after global promotion",
      ).toContain(API_DEVELOPER_AGENT);
      expect(
        projectBSelectedAfter,
        "Project B config.ts::agents must still include an active web-developer row",
      ).toContain(WEB_DEVELOPER_AGENT);

      // Type side: config-types.ts::SelectedAgentName MUST contain api-developer.
      expect(
        projectBTypeUnionAfter,
        "Project B config-types.ts::SelectedAgentName must include api-developer after global promotion",
      ).toContain(API_DEVELOPER_AGENT);
      expect(
        projectBTypeUnionAfter,
        "Project B config-types.ts::SelectedAgentName must still include web-developer",
      ).toContain(WEB_DEVELOPER_AGENT);

      // Symmetry invariant: every active name in config.ts::agents must
      // appear in config-types.ts::SelectedAgentName, and vice versa.
      // Drift between the two writers is what this spec pins.
      expect(
        [...projectBTypeUnionAfter].sort(),
        `config.ts::agents (active) and config-types.ts::SelectedAgentName must match.
config.ts:       ${JSON.stringify([...projectBSelectedAfter].sort())}
config-types.ts: ${JSON.stringify([...projectBTypeUnionAfter].sort())}`,
      ).toStrictEqual([...projectBSelectedAfter].sort());
    },
  );
});
