import { mkdir } from "fs/promises";
import path from "path";
import { expect } from "vitest";
import { cleanupTempDir, createPermissionsFile, createTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import type { DashboardSession } from "../pages/dashboard-session.js";
import type { ConfirmStep } from "../pages/steps/confirm-step.js";
import type { WizardResult } from "../pages/wizard-result.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";
import type {
  AgentName,
  AgentScopeConfig,
  SkillConfig,
  SkillId,
} from "../../src/cli/types/index.js";

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
  skillId: SkillId,
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

/** Load a scope's config.ts structurally and return its selectedAgents list. */
export async function readSelectedAgents(dir: string): Promise<AgentName[]> {
  const loaded = await loadProjectConfigFromDir(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  const selected = loaded?.config.selectedAgents;
  expect(selected, `config.ts at ${dir} must declare selectedAgents`).toBeDefined();
  return selected ?? [];
}

/** Load a scope's config.ts structurally and return its full skills array. */
export async function readAllSkillEntries(dir: string): Promise<SkillConfig[]> {
  const loaded = await loadProjectConfigFromDir(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return loaded ? loaded.config.skills : [];
}

/** Load a scope's config.ts structurally and return the ids in its skills array. */
export async function readConfigSkillIds(dir: string): Promise<SkillId[]> {
  return (await readAllSkillEntries(dir)).map((sc) => sc.id);
}

/**
 * Drive one `cc edit` session, applying the given action to the first-focused
 * skill (web-framework-react in the Web domain), then save through to
 * completion.
 *
 *   - "scope": press `s` (G->P toggle — produces the persisted dual-scope
 *     `[P][G]` pair)
 *   - "space": press space (toggle project-scope presence). On a persisted
 *     dual-scope pair this is the sanctioned P->G restoration: `s` is
 *     intentionally inert there (the dual-scope scope-toggle guard), and space
 *     collapses [P][G] -> [G], removing the tombstone and project override
 *     while leaving the global install untouched.
 */
export async function runEditWithFirstSkillAction(
  projectDir: string,
  fakeHome: string,
  sourceDir: string,
  sourceTempDir: string,
  action: "scope" | "space",
): Promise<void> {
  const wizard = await EditWizard.launch({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
    env: { HOME: fakeHome },
    rows: 60,
    cols: 120,
  });

  try {
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
  sourceDir: string,
  sourceTempDir: string,
  skillLabel: string,
): Promise<Array<"P" | "G">> {
  const wizard = await EditWizard.launch({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
    env: { HOME: fakeHome },
    rows: 60,
    cols: 120,
  });

  try {
    return await wizard.build.getScopeBadgesForSkill(skillLabel);
  } finally {
    wizard.abort();
    await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    await wizard.destroy();
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
  sourceDir: string,
  sourceTempDir: string,
  homeDir: string,
  projectDir: string,
  options?: { setLocal?: boolean },
): Promise<{ exitCode: number; output: string }> {
  const dashboard = await InitWizard.launchForDashboard({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
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
 * Runs Phase A + Phase B to establish dual-scope state.
 */
export async function setupDualScope(
  sourceDir: string,
  sourceTempDir: string,
  fakeHome: string,
  projectDir: string,
): Promise<void> {
  // Phase A: Init global
  const phaseA = await initGlobal(sourceDir, sourceTempDir, fakeHome);
  expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

  // Phase B: Init project with scope toggling
  const phaseB = await initProject(sourceDir, sourceTempDir, fakeHome, projectDir);
  expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);
}

/**
 * Runs Phase A: Init from HOME directory with eject mode (local sources).
 * Like initGlobal() but navigates through sources step to set all local.
 */
export async function initGlobalWithEject(
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

    const confirm = await agents.acceptDefaults("init");
    return await finishWizard(await confirm.confirm());
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

/**
 * Runs Phase A (with eject) + Phase B to establish dual-scope state
 * where all skills are installed in eject mode.
 */
export async function setupDualScopeWithEject(
  sourceDir: string,
  sourceTempDir: string,
  fakeHome: string,
  projectDir: string,
): Promise<void> {
  const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
  expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

  const phaseB = await initProject(sourceDir, sourceTempDir, fakeHome, projectDir);
  expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);
}

/**
 * Creates a complete dual-scope environment via wizard interactions
 * with eject mode for all skills. Returns a handle with destroy() for cleanup.
 */
export async function createDualScopeEnv(
  sourceDir: string,
  sourceTempDir: string,
): Promise<DualScopeEnv> {
  const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
  await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);
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
  sourceDir: string,
  sourceTempDir: string,
  homeDir: string,
  projectDir: string,
): Promise<{ exitCode: number; output: string }> {
  const dashboard = await InitWizard.launchForDashboard({
    projectDir,
    source: { sourceDir, tempDir: sourceTempDir },
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
  sourceDir: string,
  sourceTempDir: string,
  homeDir: string,
  projectDir: string,
): Promise<void> {
  const wizard = await InitWizard.launch({
    source: { sourceDir, tempDir: sourceTempDir },
    projectDir,
    env: { HOME: homeDir },
    rows: 60,
    cols: 120,
  });

  try {
    const domain = await wizard.stack.selectFirstStack();
    const build = await domain.acceptDefaults();

    // Web domain: toggle web-testing-vitest to project scope (react stays global).
    await build.focusSkill("vitest");
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
export async function createGlobalOnlyEnv(
  sourceDir: string,
  sourceTempDir: string,
): Promise<DualScopeEnv> {
  const { tempDir, fakeHome, projectDir } = await createTestEnvironment();

  const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
  expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

  const phaseB = await initProjectAllGlobal(sourceDir, sourceTempDir, fakeHome, projectDir);
  expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

  return {
    fakeHome,
    projectDir,
    destroy: () => cleanupTempDir(tempDir),
  };
}
