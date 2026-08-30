import { mkdir } from "fs/promises";
import path from "path";
import { expect } from "vitest";
import { cleanupTempDir, createPermissionsFile, createTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import type { DashboardSession } from "../pages/dashboard-session.js";
import type { ConfirmStep } from "../pages/steps/confirm-step.js";
import type { WizardResult } from "../pages/wizard-result.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";
import { activeAgentNames } from "../../src/cli/lib/configuration/scope-predicates.js";
import { E2E_SKILL } from "./expected-values.js";
import type { E2ESource } from "../helpers/create-e2e-source.js";
import type { AgentName, AgentScopeConfig, SkillConfig } from "../../src/cli/types/index.js";

export type DualScopeEnv = {
  fakeHome: string;
  projectDir: string;
  destroy: () => Promise<void>;
};

/**
 * Read a skill's SkillConfig entries from the project's config.ts via a
 * structural load, sorted deterministically (scope, then excluded flag) so
 * assertions are order-independent.
 */
export async function readSkillEntries(
  projectDir: string,
  skillId: string,
): Promise<SkillConfig[]> {
  const loaded = await loadProjectConfigFromDir(projectDir);
  expect(loaded, `project config.ts must exist at ${projectDir}`).not.toBeNull();
  if (!loaded) return [];
  return loaded.config.skills
    .filter((sc) => sc.id === skillId)
    .sort((a, b) => {
      const aKey = `${a.scope}${a.excluded ? "-excluded" : ""}`;
      const bKey = `${b.scope}${b.excluded ? "-excluded" : ""}`;
      return aKey.localeCompare(bKey);
    });
}

/** Load a scope's config.ts structurally and return its agents array. */
export async function readAgentEntries(dir: string): Promise<AgentScopeConfig[]> {
  const loaded = await loadProjectConfigFromDir(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return loaded ? loaded.config.agents : [];
}

/** Load a scope's config.ts structurally and return the names of its active agents. */
export async function readActiveAgentNames(dir: string): Promise<AgentName[]> {
  const loaded = await loadProjectConfigFromDir(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return activeAgentNames(loaded?.config.agents ?? []);
}

/** Load a scope's config.ts structurally and return its full skills array. */
export async function readAllSkillEntries(dir: string): Promise<SkillConfig[]> {
  const loaded = await loadProjectConfigFromDir(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return loaded ? loaded.config.skills : [];
}

/** Load a scope's config.ts structurally and return the ids in its skills array. */
export async function readConfigSkillIds(dir: string): Promise<string[]> {
  return (await readAllSkillEntries(dir)).map((sc) => sc.id);
}

/**
 * Drive one `cc edit` session, applying the given action to web-framework-react
 * in the Web domain (focused explicitly rather than relying on where the grid
 * opens), then save through to completion.
 *
 *   - "scope": press `s`, the SOLE dual-scope toggle. On a `[G]`-only row it is
 *     the G->P toggle that produces the persisted dual-scope `[P][G]` pair; on a
 *     persisted `[P][G]` pair it is the P->G collapse back to `[G]`, dropping the
 *     tombstone and the project override while leaving the global install intact.
 *   - "space": press space (toggle project-scope presence). On a `[P][G]` pair it
 *     drops the half the PROJECT owns, collapsing the row to the inherited `[G]`
 *     it was masking and leaving the global install untouched. On a `[G]`-only
 *     inherited row it is inert and emits the global-locked toast: that entry is
 *     global-owned, and project scope may not tombstone it.
 */
export async function runEditWithFirstSkillAction(
  projectDir: string,
  fakeHome: string,
  source: E2ESource,
  action: "scope" | "space",
): Promise<void> {
  const wizard = await EditWizard.launch({
    projectDir,
    source,
    env: { HOME: fakeHome },
    rows: 60,
    cols: 120,
  });

  try {
    await wizard.build.focusSkill(E2E_SKILL.react.display);
    if (action === "scope") {
      await wizard.build.toggleScopeOnFocusedSkill();
    } else {
      await wizard.build.toggleFocusedSkill();
    }
    await wizard.build.advanceDomain();
    // API domain: pass through.
    await wizard.build.advanceDomain();
    // Methodology domain -> Sources.
    const sources = await wizard.build.advanceToSources();
    await sources.waitForReady();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const result = await confirm.confirm();
    expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
    await result.destroy();
  } finally {
    await wizard.destroy();
  }
}

/**
 * Re-open `cc edit`, read one skill's scope badges, then abort without saving.
 *
 * Read-only: the wizard is aborted with Ctrl+C, so nothing is written to
 * config.ts or the skill directories. Owns the whole session — it launches,
 * aborts, waits for exit and destroys, so callers must NOT also track the
 * wizard for afterEach cleanup.
 *
 * Only reads the FIRST domain's grid (the wizard opens on Web). Skills in a
 * later domain need an explicit `advanceDomain()` and are not covered here.
 */
export async function readSkillBadgesViaEdit(
  projectDir: string,
  fakeHome: string,
  source: E2ESource,
  skillLabel: string,
): Promise<Array<"P" | "G">> {
  const wizard = await EditWizard.launch({
    projectDir,
    source,
    env: { HOME: fakeHome },
    rows: 60,
    cols: 120,
  });

  try {
    return await wizard.build.getScopeBadgesForSkill(skillLabel);
  } finally {
    await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
  }
}

/**
 * Shared helpers for dual-scope lifecycle E2E tests.
 *
 * Used by:
 *   - global-scope-lifecycle.e2e.test.ts
 *   - dual-scope-edit-display.e2e.test.ts
 *   - dual-scope-edit-integrity.e2e.test.ts
 *   - config-scope-integrity.e2e.test.ts
 */

/** The temp directory triple a dual-scope test runs against. */
export type TestEnvironment = {
  tempDir: string;
  fakeHome: string;
  projectDir: string;
};

/**
 * Creates the temp directory structure for a dual-scope test.
 *
 *   tempDir/
 *     fake-home/
 *       .claude/settings.json
 *       project/
 *         .claude/settings.json
 *
 * `permissions` (default true) writes the two `.claude/settings.json`
 * permission files. Pass `false` for flows that must start with no
 * `.claude` directory at either scope — the only on-disk difference is the
 * presence of those two settings.json files (and the `.claude` dirs holding
 * them).
 */
export async function createTestEnvironment(options?: {
  permissions?: boolean;
}): Promise<TestEnvironment> {
  const tempDir = await createTempDir();
  const fakeHome = path.join(tempDir, "fake-home");
  const projectDir = path.join(fakeHome, "project");

  await mkdir(fakeHome, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  // Create permissions files to prevent permission prompt hang
  if (options?.permissions !== false) {
    await createPermissionsFile(fakeHome);
    await createPermissionsFile(projectDir);
  }

  return { tempDir, fakeHome, projectDir };
}

/**
 * Runs Phase A: Init from HOME directory, accepting all defaults.
 */
export async function initGlobal(
  source: E2ESource,
  homeDir: string,
): Promise<{ exitCode: number; output: string }> {
  const wizard = await InitWizard.launch({
    source,
    projectDir: homeDir,
    env: { HOME: homeDir },
  });

  try {
    return await finishWizard(await wizard.completeWithDefaults());
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * Runs Phase B: Init from project directory when an install already exists.
 *
 * Since a global install exists from Phase A, `cc init` shows the dashboard
 * (Edit / Compile / Doctor / List) instead of the setup wizard. This helper
 * drives the dashboard exactly like a real user: wait for the menu → press
 * Enter on the default "Edit" option → drive the edit wizard.
 *
 * Toggles api-framework-hono skill and api-developer agent to project scope
 * via the edit wizard to produce the same end state as a fresh install would.
 */
export async function initProject(
  source: E2ESource,
  homeDir: string,
  projectDir: string,
  options?: { setLocal?: boolean },
): Promise<{ exitCode: number; output: string }> {
  const dashboard = await InitWizard.launchForDashboard({
    projectDir,
    source,
    env: { HOME: homeDir },
  });

  try {
    await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

    // "Edit" is the first (default) dashboard option — press Enter to launch it.
    const build = await dashboard.selectEdit();

    // Web domain (pass through, all skills stay global)
    await build.advanceDomain();

    // API domain: toggle first skill to project scope
    await build.toggleScopeOnFocusedSkill();

    // Advance through remaining domains (API -> Meta -> Sources)
    const sources = await build.passThroughAllDomainsGeneric();

    // Sources step -- optionally set ALL sources to local (default: yes)
    await sources.waitForReady();
    if (options?.setLocal !== false) {
      await sources.setAllLocal();
    }
    const agents = await sources.advance();

    // Agents step -- navigate to api-developer and toggle to project scope
    await agents.navigateCursorToAgent("API Developer");
    await agents.toggleScopeOnFocusedAgent();
    const confirm = await agents.advance("edit");

    // Confirm step
    return await finalizeEdit(confirm, dashboard);
  } catch (e) {
    await dashboard.destroy();
    throw e;
  }
}

/**
 * Wait for a finished wizard to exit, capture its raw output, then destroy the
 * session. `output` is `result.rawOutput` — callers needing the sanitized
 * `result.output` must read it themselves before destroying.
 *
 * Does NOT assert on the exit code: failure-path flows return non-success
 * codes, so the assertion stays at the call site.
 */
export async function finishWizard(
  result: WizardResult,
): Promise<{ exitCode: number; output: string }> {
  const exitCode = await result.exitCode;
  const output = result.rawOutput;
  await result.destroy();
  return { exitCode, output };
}

/**
 * Confirm the edit wizard and return the exit code + raw output.
 * Shared by initProject() and initProjectAllGlobal(): both flows end with a
 * confirm step followed by session exit and cleanup of the dashboard session.
 */
async function finalizeEdit(
  confirm: ConfirmStep,
  dashboard: DashboardSession,
): Promise<{ exitCode: number; output: string }> {
  const outcome = await finishWizard(await confirm.confirm());
  // finishWizard destroyed the underlying session; dashboard shares it, so we
  // only clean up the dashboard's cleanupDirs.
  await dashboard.destroy();
  return outcome;
}

/**
 * Runs Phase A: Init from HOME directory with eject mode (local sources).
 * Like initGlobal() but navigates through sources step to set all local.
 */
export async function initGlobalWithEject(
  source: E2ESource,
  homeDir: string,
): Promise<{ exitCode: number; output: string }> {
  const wizard = await InitWizard.launch({
    source,
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

    const confirm = await agents.acceptDefaults("init");
    return await finishWizard(await confirm.confirm());
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * Phase A variant that installs the stack MINUS one Web-domain skill: the skill
 * is deselected in the build grid before the install runs, so it ends up in the
 * source and in no scope's config.
 *
 * That absence is the only route to a genuinely NEW pick in a later project
 * edit — every other skill the E2E stack carries is installed globally by the
 * plain Phase A, and picking one of those back is a re-selection of an
 * inherited global install, which the scope guards refuse.
 */
export async function initGlobalWithEjectWithoutSkill(
  source: E2ESource,
  homeDir: string,
  skillLabel: string,
): Promise<{ exitCode: number; output: string }> {
  const wizard = await InitWizard.launch({
    source,
    projectDir: homeDir,
    env: { HOME: homeDir },
    ...TERMINAL_SIZE.TALL,
  });

  try {
    const domain = await wizard.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    await build.focusSkill(skillLabel);
    await build.toggleFocusedSkill();
    const sources = await build.passThroughAllDomains();

    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.advance();

    const confirm = await agents.acceptDefaults("init");
    return await finishWizard(await confirm.confirm());
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * Phase B variant that moves ONE AGENT to project scope and changes nothing
 * else: the same dashboard -> Edit session `initProject` drives, without the
 * skill-side scope toggle.
 *
 * The project-scoped agent is what makes a project-scoped SKILL observable in
 * compiled output — a global agent can never carry one — so any flow asserting
 * that the project side of a dual-scope install is real needs this shape.
 */
export async function initProjectWithProjectScopedAgent(
  source: E2ESource,
  homeDir: string,
  projectDir: string,
  agentLabel: string,
): Promise<{ exitCode: number; output: string }> {
  const dashboard = await InitWizard.launchForDashboard({
    projectDir,
    source,
    env: { HOME: homeDir },
  });

  try {
    await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

    const build = await dashboard.selectEdit();
    const sources = await build.passThroughAllDomainsGeneric();

    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.advance();

    await agents.navigateCursorToAgent(agentLabel);
    await agents.toggleScopeOnFocusedAgent();
    const confirm = await agents.advance("edit");

    return await finalizeEdit(confirm, dashboard);
  } catch (e) {
    await dashboard.destroy();
    throw e;
  }
}

/**
 * Runs Phase A (with eject) + Phase B to establish dual-scope state
 * where all skills are installed in eject mode.
 *
 * There is no plugin-mode counterpart and there was never a state one could reach: the shared
 * plain source ships no `.claude-plugin/marketplace.json`, so plugin install mode has no
 * marketplace to resolve and `init` refuses the whole run. Phase B sets every source local
 * anyway, so eject is also what makes the two halves agree. A `setupDualScope` taking the
 * {@link initGlobal} route sat here unused until 2026-08-26 for exactly that reason, and was
 * deleted rather than left as a second name for this one. A dual-scope flow that genuinely needs
 * a PLUGIN global drives {@link initGlobal} against a plugin fixture directly — see
 * `lifecycle/dual-scope-edit-mixed-sources.e2e.test.ts`.
 */
export async function setupDualScopeWithEject(
  source: E2ESource,
  fakeHome: string,
  projectDir: string,
): Promise<void> {
  const phaseA = await initGlobalWithEject(source, fakeHome);
  expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

  const phaseB = await initProject(source, fakeHome, projectDir);
  expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);
}

/**
 * Creates a complete dual-scope environment via wizard interactions
 * with eject mode for all skills. Returns a handle with destroy() for cleanup.
 */
export async function createDualScopeEnv(source: E2ESource): Promise<DualScopeEnv> {
  const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
  await setupDualScopeWithEject(source, fakeHome, projectDir);
  return {
    fakeHome,
    projectDir,
    destroy: () => cleanupTempDir(tempDir),
  };
}

/**
 * Runs init in project directory when an install already exists, but without
 * toggling any skills/agents to project scope. All skills remain global-scoped.
 *
 * Same dashboard → Edit flow as initProject(), but the edit wizard is just
 * passed through without scope changes. Sources are set to local.
 */
export async function initProjectAllGlobal(
  source: E2ESource,
  homeDir: string,
  projectDir: string,
): Promise<{ exitCode: number; output: string }> {
  const dashboard = await InitWizard.launchForDashboard({
    projectDir,
    source,
    env: { HOME: homeDir },
  });

  try {
    await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);

    // "Edit" is the default dashboard option.
    const build = await dashboard.selectEdit();

    // Pass through all domains without changes.
    const sources = await build.passThroughAllDomainsGeneric();

    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.advance();

    const confirm = await agents.acceptDefaults("edit");
    return await finalizeEdit(confirm, dashboard);
  } catch (e) {
    await dashboard.destroy();
    throw e;
  }
}

/**
 * Fresh project init (NO prior global install) that toggles web-testing-vitest
 * (a non-preloaded skill) and api-developer (agent) to PROJECT scope, leaving
 * web-framework-react and web-developer at GLOBAL scope.
 *
 * Because nothing was installed globally first, the project-scoped vitest/api-developer
 * are genuine project-only entries — no global install underneath them and no global
 * tombstone. web-framework-react / web-developer land in the freshly-created global
 * config as inherited global-active entries. This is the exact shape for testing
 * project-scope deselection (project-only entries get dropped) against inherited-global
 * preservation (global entries must survive a project edit).
 *
 * vitest is deliberately a non-preloaded (dynamic) skill: a preloaded skill (react/hono)
 * is locked to its selected agent and cannot be deselected on its own, so it could never
 * exercise the skill-drop merge path.
 */
export async function setupProjectOnlyMixedScope(
  source: E2ESource,
  homeDir: string,
  projectDir: string,
): Promise<void> {
  const wizard = await InitWizard.launch({
    source,
    projectDir,
    env: { HOME: homeDir },
    rows: 60,
    cols: 120,
  });

  try {
    const domain = await wizard.stack.selectFirstStack();
    const build = await domain.acceptDefaults();

    // Web domain: toggle web-testing-vitest to project scope (react stays global).
    await build.focusSkill(E2E_SKILL.vitest.display);
    await build.toggleScopeOnFocusedSkill();
    await build.advanceDomain();
    // API domain: pass through (hono + api-framework stay global).
    await build.advanceDomain();
    // Methodology domain -> Sources.
    const sources = await build.advanceToSources();

    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.advance();

    // Toggle api-developer to project scope (project-only agent).
    await agents.navigateCursorToAgent("API Developer");
    await agents.toggleScopeOnFocusedAgent();
    const confirm = await agents.advance("init");

    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    expect(exitCode, `Project-only mixed-scope init failed: ${result.rawOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    await result.destroy();
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * Creates a global-only environment via wizard interactions with eject mode.
 * Phase A initializes the global home, Phase B initializes the project
 * with all skills remaining global-scoped (no scope toggling).
 */
export async function createGlobalOnlyEnv(source: E2ESource): Promise<DualScopeEnv> {
  const { tempDir, fakeHome, projectDir } = await createTestEnvironment();

  const phaseA = await initGlobalWithEject(source, fakeHome);
  expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

  const phaseB = await initProjectAllGlobal(source, fakeHome, projectDir);
  expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

  return {
    fakeHome,
    projectDir,
    destroy: () => cleanupTempDir(tempDir),
  };
}
