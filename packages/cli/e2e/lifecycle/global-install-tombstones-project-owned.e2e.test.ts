import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  readAgentEntriesFor,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentScopeConfig, AgentName, SkillConfig } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * D-268 + D-259 (same root cause): a project that owns a skill/agent at PROJECT
 * scope while that same skill/agent is ACTIVE at GLOBAL scope must be reconciled
 * to the proper dual-scope shape when global changes propagate to it — the active
 * project entry PLUS a `{ scope: "global", excluded: true }` tombstone, rendering
 * `[P][G]`. `propagateGlobalChangesToProjects` (local-installer.ts) instead
 * re-inlines the global copy as a SECOND ACTIVE entry with no tombstone, leaving
 * the id/name active at BOTH scopes — the malformed "project-then-global leaves
 * both active" state.
 *
 * Setup drives the real `cc edit` pipeline (no code inspection):
 *   1. A registered project P owns web-testing-vitest at PROJECT scope and
 *      web-developer at PROJECT scope. The global install already has
 *      web-developer active at GLOBAL scope (the agent precondition); vitest is
 *      NOT yet global.
 *   2. `cc edit` at HOME adds vitest at GLOBAL scope — a genuine project-then-
 *      global transition for the skill — which fires propagation to P.
 *   3. After propagation, P's config.ts must carry the dual-scope pair for BOTH
 *      the owned skill and the owned agent.
 *
 * Expected to FAIL on current `main`: the tombstone is never written, so each
 * owned id/name is active at both scopes. The purely-inherited control skill
 * (react — owned only at global scope) already reconciles correctly and is the
 * working path this bug does NOT touch.
 */

// The global web-developer agent's stack references react at global scope.
const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const reactMetadata = renderMetadataYaml({
  displayName: E2E_SKILL.react.display,
  category: "web-framework",
  slug: E2E_SKILL.react.slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "b2c3d4e",
});

describe("global-scope install tombstones project-owned skills and agents", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;
  let globalHome: string;
  let projectDir: string;

  let editExitCode: number;
  let editRawOutput: string;
  let globalVitestInstalled: boolean;

  let globalVitest: SkillConfig[];
  let globalWebDeveloper: AgentScopeConfig[];
  let projectVitest: SkillConfig[];
  let projectReact: SkillConfig[];
  let projectWebDeveloper: AgentScopeConfig[];

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;

    tempDir = await createTempDir();
    globalHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "registered-project");
    for (const dir of [globalHome, projectDir]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // Global install: react + web-developer at GLOBAL scope. vitest is
    // deliberately absent so the Phase-2 edit ADDS it globally (a real
    // project-then-global transition). The project is pre-registered.
    const globalConfig: FixtureProjectConfig = buildProjectConfig({
      name: "tombstone-project-owned-global",
      skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      selectedDomains: ["web"],
      stack: globalStack,
      projects: [realpathSync(projectDir)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, E2E_SKILL.react.id, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    // Registered project P: owns vitest at PROJECT scope and web-developer at
    // PROJECT scope. react is inherited from the global install; web-developer
    // is ALSO active at global scope (see globalConfig above), so the project's
    // own project-scoped web-developer is the agent precondition — a
    // project-owned entry sitting under a live global install with no tombstone.
    const projectConfig: FixtureProjectConfig = buildProjectConfig({
      name: "tombstone-project-owned",
      skills: [
        ...buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
        ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "project", origin: "eject" }),
      ],
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
    });
    await writeProjectConfig(projectDir, projectConfig);

    // Phase 2: `cc edit` at HOME, add vitest at global scope. Adding a new
    // global skill forces the global write path and fires
    // propagateGlobalChangesToProjects for the registered project.
    const wizard = await EditWizard.launch({
      projectDir: globalHome,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: globalHome },
      ...TERMINAL_SIZE.TALL,
    });
    try {
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);
      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      // Switch all skills to local (eject) — adding a new skill otherwise
      // defaults to plugin mode, which the local test source cannot resolve.
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      editExitCode = await result.exitCode;
      editRawOutput = result.rawOutput;
      await result.destroy();
    } catch (e) {
      await wizard.destroy();
      throw e;
    }

    globalVitestInstalled = await directoryExists(
      path.join(skillsPath(globalHome), E2E_SKILL.vitest.id),
    );
    globalVitest = await readSkillEntries(globalHome, E2E_SKILL.vitest.id);
    globalWebDeveloper = await readAgentEntriesFor(globalHome, E2E_AGENT["web-developer"].name);
    projectVitest = await readSkillEntries(projectDir, E2E_SKILL.vitest.id);
    projectReact = await readSkillEntries(projectDir, E2E_SKILL.react.id);
    projectWebDeveloper = await readAgentEntriesFor(projectDir, E2E_AGENT["web-developer"].name);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it("completes the global-scope skill addition edit successfully", () => {
    expect(editExitCode, `global edit must succeed: ${editRawOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  // Proof the transition happened: vitest is now a single active global skill.
  it("adds the selected skill at global scope in the global config", () => {
    expect(globalVitest).toStrictEqual([
      { id: E2E_SKILL.vitest.id, scope: "global", origin: "eject" },
    ]);
  });

  // Filesystem side of the same transition: the skill was physically installed
  // at the global scope path, so the config claim above is backed by disk state.
  it("physically installs the newly-added skill at the global scope path", () => {
    expect(globalVitestInstalled).toBe(true);
  });

  // Proof the agent precondition holds after the edit: web-developer is active
  // at global scope, so the project's project-scoped web-developer sits under a
  // live global install.
  it("keeps the project-owned agent active at global scope in the global config", () => {
    expect(globalWebDeveloper).toStrictEqual([
      { name: E2E_AGENT["web-developer"].name, scope: "global" },
    ]);
  });

  // Proof-of-execution: propagation re-inlined a global entry for each owned
  // item alongside the retained project entry. Passes on both the buggy and the
  // fixed code — it only asserts propagation FIRED, not the tombstone shape.
  it("re-inlines both scopes of the project-owned skill into the registered project", () => {
    expect(projectVitest.map((entry) => entry.scope).sort()).toStrictEqual(["global", "project"]);
  });

  it("re-inlines both scopes of the project-owned agent into the registered project", () => {
    expect(projectWebDeveloper.map((entry) => entry.scope).sort()).toStrictEqual([
      "global",
      "project",
    ]);
  });

  // Control: a purely-inherited global skill (react, NOT owned at project scope)
  // reconciles to a single active global entry — the already-correct path this
  // bug does not affect.
  it("leaves a purely-inherited global skill as a single active global entry", () => {
    expect(projectReact).toStrictEqual([
      { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
    ]);
  });

  // RED on current main: the owned skill is re-inlined as a SECOND active global
  // entry instead of a tombstone, leaving vitest active at both scopes.
  it("writes a global tombstone for the project-owned skill, not a second active install", () => {
    expect(projectVitest).toStrictEqual([
      { id: E2E_SKILL.vitest.id, scope: "global", origin: "eject", excluded: true },
      { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
    ]);
  });

  // RED on current main: the owned agent is re-inlined as a SECOND active global
  // entry instead of a tombstone, leaving web-developer active at both scopes.
  it("writes a global tombstone for the project-owned agent, not a second active install", () => {
    expect(projectWebDeveloper).toStrictEqual([
      { name: E2E_AGENT["web-developer"].name, scope: "global", excluded: true },
      { name: E2E_AGENT["web-developer"].name, scope: "project" },
    ]);
  });
});
