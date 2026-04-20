import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  ensureBinaryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";

/**
 * D-222 — Global-agent propagation writes `selectedAgents` value but not its
 * type → type error in other registered projects.
 *
 * When a user promotes a new agent to GLOBAL scope from Project A, the global
 * config gains that agent in its `selectedAgents` field and the CLI
 * propagates the change to every other registered project. The value-side
 * writer (`generateProjectConfigWithInlinedGlobal`) merges global + project
 * `selectedAgents` into each downstream project's `config.ts`. The type-side
 * writer (`generateConfigTypesSource` via `writeStandaloneConfigTypes`) should
 * emit the matching `SelectedAgentName` union in `config-types.ts`.
 *
 * The bug in `propagateGlobalChangesToProjects`
 * (`src/cli/lib/installation/local-installer.ts`) is that `combinedConfig`
 * spreads `projectConfig` but forgets to merge the global + project
 * `selectedAgents` the way it merges `skills`, `agents`, and `domains`. So the
 * type-side writer sees the stale project-level `selectedAgents` array while
 * the value-side writer produces the merged list — leaving Project B with:
 *
 *   // config.ts
 *   const selectedAgents: SelectedAgentName[] = [
 *     "web-developer", "api-developer",  // value side correct
 *   ];
 *
 *   // config-types.ts
 *   export type SelectedAgentName = "web-developer";
 *   //                                           ^ api-developer is missing
 *
 * `tsc --noEmit` then errors on B because `"api-developer"` is not assignable
 * to `SelectedAgentName`.
 *
 * Setup (exercises the real CLI pipeline end-to-end):
 *   1. Global init at HOME with api-developer DESELECTED — global
 *      `selectedAgents` starts without api-developer.
 *   2. Register Project B via `cc edit` with a minimal agent-scope
 *      change (web-developer G→P). B's disk `config.ts::selectedAgents`
 *      is inlined from the narrow global — no api-developer. B's
 *      `config-types.ts::SelectedAgentName` is correspondingly narrow.
 *   3. Register Project A the same way.
 *   4. Run `cc edit` in Project A and toggle api-developer ON. Because
 *      A's project config has no project-scoped skills (the registration
 *      helper used an agent-scope toggle, not a skill-scope toggle),
 *      `reconcileNewAgentScopes` leaves api-developer at the wizard's
 *      default `scope: global`. `splitConfigByScope` routes it to the
 *      global partition, `mergeGlobalConfigs` detects a new global
 *      agent (`globalDataChanged=true`), and
 *      `propagateGlobalChangesToProjects` fires for Project B.
 *
 * Assertion: B's config.ts AND config-types.ts must both include
 * `api-developer` after propagation. This test is EXPECTED TO FAIL on
 * current `main` — the type-side assertion fails because propagation's
 * `combinedConfig` omits the merged `selectedAgents`.
 */

const WEB_DEVELOPER_AGENT = "web-developer";
const API_DEVELOPER_AGENT = "api-developer";
const API_DEVELOPER_DISPLAY = "API Developer";

/**
 * Extract the `selectedAgents` literal array from a rendered `config.ts`.
 * The writer emits a single-line declaration:
 *   const selectedAgents: SelectedAgentName[] = ["name1", "name2"];
 *
 * Returns the list of agent names. Throws (via expect) if the declaration
 * block is not found — preferable to returning [] silently.
 */
function parseSelectedAgentsArray(configContent: string): string[] {
  const blockMatch = configContent.match(
    /const selectedAgents:\s*SelectedAgentName\[\]\s*=\s*\[([\s\S]*?)\];/,
  );
  expect(
    blockMatch,
    "Expected config.ts to declare `const selectedAgents: SelectedAgentName[] = [...]`",
  ).not.toBeNull();

  const body = blockMatch![1];
  return Array.from(body.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/**
 * Extract the `SelectedAgentName` union literal members from a rendered
 * `config-types.ts`. The writer emits:
 *   export type SelectedAgentName = "name1" | "name2";
 *
 * Returns the list of names from the RHS of the declaration (no `AgentName`
 * fallback — the test asserts the bounded-union emission explicitly).
 */
function parseSelectedAgentNameUnion(configTypesContent: string): string[] {
  const blockMatch = configTypesContent.match(
    /export type SelectedAgentName\s*=\s*([^;]+);/,
  );
  expect(
    blockMatch,
    "Expected config-types.ts to declare `export type SelectedAgentName = ...;`",
  ).not.toBeNull();

  const rhs = blockMatch![1];
  return Array.from(rhs.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/**
 * Launch `cc init` at HOME and complete the wizard with api-developer
 * DESELECTED in the agents step. Sources set to local (eject mode).
 *
 * The E2E stack preselects the full DOMAIN_AGENTS set for `web` and
 * `api` (web-developer, web-reviewer, …, api-developer, api-reviewer,
 * …). Toggling api-developer off leaves the other web-/api-scope agents
 * intact. A fresh init with no pre-existing installedAgentConfigs
 * treats toggle-off as a CLEAN removal (no tombstone) — verified in
 * wizard-store.toggleAgent where `effectiveInstalledConfigs` is `null`
 * for fresh init — so api-developer is absent from both the written
 * `selectedAgents` array AND the global `agents` array.
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

    // Deselect api-developer. Fresh global init → no tombstone → name
    // simply leaves selectedAgents.
    await agents.toggleAgent(API_DEVELOPER_DISPLAY);
    const confirm = await agents.advance("init");
    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    const output = result.rawOutput;
    await result.destroy();
    return { exitCode, output };
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * Register a project with the global config by launching its Edit wizard
 * (dashboard → Edit) and toggling the scope of one existing global agent
 * to project (web-developer G→P). A pure passthrough edit does NOT create
 * the project config (see `edit-global-fallback.e2e.test.ts`), so we need
 * some state change to force config generation and project registration.
 *
 * We toggle an AGENT's scope (not a skill's) because
 * `reconcileNewAgentScopes` only demotes newly-added global agents when
 * the project has an active project-scoped SKILL. Using an agent-scope
 * toggle keeps every skill at global scope, which leaves Phase 4's
 * api-developer promotion at `scope: global` — the only code path that
 * triggers `propagateGlobalChangesToProjects`.
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
    rows: 60,
    cols: 120,
  });

  try {
    const sources = await editWizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();

    // Toggle web-developer's scope G→P. Minimal project-level change
    // that creates a project-scoped agent without creating any
    // project-scoped skills (preventing reconcileNewAgentScopes from
    // interfering with Phase 4's promotion).
    await agents.navigateCursorToAgent("Web Developer");
    await agents.toggleScopeOnFocusedAgent();

    const confirm = await agents.advance("edit");
    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    const output = result.rawOutput;
    await result.destroy();
    return { exitCode, output };
  } catch (e) {
    await editWizard.destroy();
    throw e;
  }
}

/**
 * Run `cc edit` in the given project (A) and toggle api-developer ON.
 * The toggle-on adds `{name: "api-developer", scope: "global"}` by
 * default (via `applyAgentToggle`).
 *
 * Because the registration helper above uses an agent-scope change (not
 * a skill-scope change), the project has no active project-scoped
 * skills — so `reconcileNewAgentScopes` skips the demotion path and
 * api-developer stays at global. `splitConfigByScope` routes it to the
 * global partition. `mergeGlobalConfigs` detects a new global agent →
 * `globalDataChanged=true`. `writeScopedConfigs`'s project-context
 * branch then calls `propagateGlobalChangesToProjects` for every other
 * registered project (Project B).
 *
 * Editing from HOME would be a simpler trigger, but the current
 * `mergeConfigs` does NOT preserve `projects` across edit-at-HOME
 * writes, so that path drops the project registry before propagation
 * could fire. Driving the promotion from a project context exercises
 * the production propagation call-site — the trigger D-222 actually
 * rides on.
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
    rows: 60,
    cols: 120,
  });

  try {
    const sources = await editWizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();

    // Toggle api-developer ON. Registration helper deliberately avoids
    // project-scoped skills, so `reconcileNewAgentScopes` skips the
    // demotion path and the agent stays at its default scope:global.
    await agents.toggleAgent(API_DEVELOPER_DISPLAY);
    const confirm = await agents.advance("edit");
    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    const output = result.rawOutput;
    await result.destroy();
    return { exitCode, output };
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
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "propagates a newly-globalized agent to both selectedAgents array AND SelectedAgentName type in registered projects",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Build global install with api-developer DESELECTED at
      // the agents step, so global `selectedAgents` (and the
      // `SelectedAgentName` union it seeds) starts without it.
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

      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const globalTypesPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS);
      expect(await fileExists(globalConfigPath)).toBe(true);
      expect(await fileExists(globalTypesPath)).toBe(true);

      // Sanity: global starts WITHOUT api-developer. The preselected set
      // is derived from DOMAIN_AGENTS and includes web-developer plus
      // several other web-/api-scope agents — what matters here is that
      // api-developer is absent and that the value/type sides agree on
      // the initial narrow set.
      const globalConfigPhase1 = await readTestFile(globalConfigPath);
      const globalTypesPhase1 = await readTestFile(globalTypesPath);
      const globalSelectedPhase1 = parseSelectedAgentsArray(globalConfigPhase1);
      const globalTypeUnionPhase1 = parseSelectedAgentNameUnion(globalTypesPhase1);
      expect(globalSelectedPhase1).toContain(WEB_DEVELOPER_AGENT);
      expect(globalSelectedPhase1).not.toContain(API_DEVELOPER_AGENT);
      expect([...globalTypeUnionPhase1].sort()).toStrictEqual(
        [...globalSelectedPhase1].sort(),
      );

      // ================================================================
      // Phase 2: Register Project B. A pure passthrough edit would NOT
      // create B's project config (see edit-global-fallback.e2e.test.ts)
      // — the edit command returns early with "No changes made". So we
      // make the minimal change that forces project config creation:
      // toggle web-developer G→P in the agents step. An agent-scope
      // change (not a skill-scope change) is intentional — see the
      // helper's docstring for why. B's stored `selectedAgents` inherits
      // from the narrow global verbatim.
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

      const projectBConfigPath = path.join(projectBDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const projectBTypesPath = path.join(projectBDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS);
      expect(await fileExists(projectBConfigPath)).toBe(true);
      expect(await fileExists(projectBTypesPath)).toBe(true);

      // Pre-condition: B starts without api-developer and the value/type
      // sides agree. The exact contents depend on DOMAIN_AGENTS preselection
      // (several web-/api-scope agents) — the invariant under test is
      // symmetry and api-developer's absence, not the specific composition.
      const projectBConfigBefore = await readTestFile(projectBConfigPath);
      const projectBTypesBefore = await readTestFile(projectBTypesPath);
      const projectBSelectedBefore = parseSelectedAgentsArray(projectBConfigBefore);
      const projectBTypeUnionBefore = parseSelectedAgentNameUnion(projectBTypesBefore);
      expect(
        projectBSelectedBefore,
        "Project B selectedAgents must not contain api-developer before global promotion",
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
      // downstream D-222 assertions would be meaningless vacuous passes.
      const projectBContentAfter = await readTestFile(projectBConfigPath);
      expect(
        projectBContentAfter,
        "Pre-condition: propagation must rewrite Project B's config.ts after Phase 4",
      ).not.toStrictEqual(projectBContentBefore);

      const globalConfigAfter = await readTestFile(globalConfigPath);
      const globalSelectedAfter = parseSelectedAgentsArray(globalConfigAfter);
      expect(
        globalSelectedAfter,
        "Pre-condition: global selectedAgents must include api-developer after Phase 4",
      ).toContain(API_DEVELOPER_AGENT);


      // ================================================================
      // Phase 5: The assertion that defines D-222 — value AND type sides
      // of Project B's config must both carry api-developer.
      //
      // On current `main` (bug unfixed): the value-side passes, the
      // type-side fails. The test turns green only when
      // `propagateGlobalChangesToProjects` merges `selectedAgents` into
      // its `combinedConfig`.
      // ================================================================
      const projectBTypesAfter = await readTestFile(projectBTypesPath);

      const projectBSelectedAfter = parseSelectedAgentsArray(projectBContentAfter);
      const projectBTypeUnionAfter = parseSelectedAgentNameUnion(projectBTypesAfter);

      // Value side: config.ts::selectedAgents MUST contain api-developer.
      expect(
        projectBSelectedAfter,
        "Project B config.ts::selectedAgents must include api-developer after global promotion",
      ).toContain(API_DEVELOPER_AGENT);
      expect(
        projectBSelectedAfter,
        "Project B config.ts::selectedAgents must still include web-developer",
      ).toContain(WEB_DEVELOPER_AGENT);

      // Type side: config-types.ts::SelectedAgentName MUST contain api-developer.
      // THIS IS THE D-222 ASSERTION — expected to FAIL on current main.
      expect(
        projectBTypeUnionAfter,
        "Project B config-types.ts::SelectedAgentName must include api-developer after global promotion (D-222)",
      ).toContain(API_DEVELOPER_AGENT);
      expect(
        projectBTypeUnionAfter,
        "Project B config-types.ts::SelectedAgentName must still include web-developer",
      ).toContain(WEB_DEVELOPER_AGENT);

      // Symmetry invariant: every name in config.ts::selectedAgents must
      // appear in config-types.ts::SelectedAgentName, and vice versa.
      // This is the real D-222 invariant — the drift between the two
      // writers is the bug.
      expect(
        [...projectBTypeUnionAfter].sort(),
        `D-222 symmetry: config.ts::selectedAgents and config-types.ts::SelectedAgentName must match.
config.ts:       ${JSON.stringify(projectBSelectedAfter.sort())}
config-types.ts: ${JSON.stringify(projectBTypeUnionAfter.sort())}`,
      ).toStrictEqual([...projectBSelectedAfter].sort());
    },
  );
});
