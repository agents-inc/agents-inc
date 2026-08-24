import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { finishWizard } from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  loadConfigOrFail,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * A PROJECT-context edit that migrates a GLOBAL-scoped skill's install mode must
 * reach every OTHER registered project — its config.ts and its compiled agents.
 *
 * The migration itself happens under `$HOME`, because `executeMigration` resolves each
 * skill's paths from ITS OWN scope. `recordGlobalSourceMigrations` then records the new
 * `origin` in the global config, and every other registered project inlines that value, so
 * its config and the agents compiled from it are stale until the change fans out.
 *
 * Shape of the fixture:
 *   - HOME owns react (global scope, marketplace source) and a GLOBAL
 *     api-developer whose stack preloads react. Both projects are registered.
 *   - project-a holds react as a persisted `[P][G]` pair — an active project entry plus the
 *     global tombstone that pair is written with — and a PROJECT-scoped web-developer whose
 *     stack preloads it.
 *   - project-b is the bystander: it inlines the global react row verbatim, exactly as an
 *     install would leave it, and owns a PROJECT-scoped web-developer of its own.
 *
 * Both projects' stale `.claude/agents/web-developer.md` files are produced by a
 * real `compile` run rather than hand-written, so the plugin-form reference under
 * test is exactly what the product emits while react is marketplace-sourced.
 *
 * project-a's own assertions (global config, project-a config, project-a's
 * recompiled agent) are the proof-of-execution half: they establish that the
 * migration path genuinely fired, so a red on project-b cannot be a fixture that
 * never switched anything.
 *
 * The Claude CLI is not required: a plugin -> eject migration copies the skill
 * locally and treats the plugin uninstall as best-effort.
 *
 * THE ROUTE THIS DRIVES, and why it is not the one this file was written with.
 *
 * The original fixture reached the migration through the Sources step's bulk `l` key, which
 * rewrote `origin` on every active entry — the inherited global react row included — from a
 * project directory. That key is withdrawn, and `setInstallMode` now refuses a
 * project-context call against a global slot the hydration snapshot owns, so the bulk route
 * is closed BY CONSTRUCTION. A spec whose trigger has been removed reports nothing: it went
 * `describe.skip` and read exactly like a passing file.
 *
 * The narrower route this drives instead is the residue that authority leaves legitimate:
 * commit an install-mode change on the PROJECT half of a `[P][G]` pair — the project's own
 * to configure — then collapse the pair P->G with `s` in the same session. The entry is the
 * project's when configured and global when written, so the migration is real and the global
 * config must both record it and carry it to every other registered project.
 */

/** Compiled reference form for a marketplace-sourced skill (bare id when ejected). */
const REACT_PLUGIN_REF = `${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`;

/** Marketplace label recorded as react's source, i.e. plugin (non-eject) form. */
const MARKET = "test-marketplace";

/** The project the edit is driven from — propagation deliberately skips it. */
const PROJECT_A = "project-a";

/** The bystander registered project that carries the red. */
const PROJECT_B = "project-b";

// The GLOBAL agent's stack preloads react at global scope, so the global install
// has an artifact of its own that tracks react's source.
const globalStack = {
  [E2E_AGENT["api-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

// Each registered project's own PROJECT-scoped agent preloads the same global
// react, so its compiled frontmatter carries react in whichever form the global
// source dictates. Global skills legitimately reach any agent per
// isScopeCompatible.
const projectStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const reactMetadata = renderMetadataYaml({
  domain: "web",
  author: "@agents-inc",
  displayName: E2E_SKILL.react.display,
  category: "web-framework",
  slug: E2E_SKILL.react.slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "c3d4e5f",
});

/**
 * A registered project as a normal wizard flow leaves it: the global react skill
 * inlined verbatim from the global config (marketplace-sourced), plus a
 * project-scoped agent whose stack references it.
 */
function buildRegisteredProjectConfig(name: string): FixtureProjectConfig {
  return buildProjectConfig({
    name,
    skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: MARKET }),
    agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
    selectedDomains: ["web"],
    stack: projectStack,
  });
}

/**
 * The editing project, holding react as a persisted `[P][G]` pair: the active project entry
 * the `s` toggle produces, plus the global tombstone written alongside it. That project half
 * is the one slot the Sources step still leaves editable at project scope, so it is the only
 * route left to an install-mode change that ends up global.
 */
function buildDualScopeProjectConfig(name: string): FixtureProjectConfig {
  return buildProjectConfig({
    name,
    skills: [
      ...buildSkillConfigs([E2E_SKILL.react.id], {
        scope: "global",
        origin: MARKET,
        excluded: true,
      }),
      ...buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: MARKET }),
    ],
    agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
    selectedDomains: ["web"],
    stack: projectStack,
  });
}

/** The compiled agent a registered project owns at project scope. */
function projectAgentPath(dir: string): string {
  return path.join(agentsPath(dir), `${E2E_AGENT["web-developer"].name}.md`);
}

describe("project-context source migration of a global skill propagates to other registered projects", () => {
  let tempDir: string;

  let fakeHome: string;
  let projectA: string;
  let projectB: string;

  let compileAExitCode: number;
  let compileAOutput: string;
  let compileBExitCode: number;
  let compileBOutput: string;
  let preEditAgentA: string;
  let preEditAgentB: string;
  let editExitCode: number;
  let editOutput: string;
  let globalConfig: FixtureProjectConfig;
  let configA: FixtureProjectConfig;
  let configB: FixtureProjectConfig;

  beforeAll(async () => {
    await ensureBinaryExists();

    tempDir = await createTempDir();
    fakeHome = path.join(tempDir, "home");
    projectA = path.join(tempDir, PROJECT_A);
    projectB = path.join(tempDir, PROJECT_B);
    for (const dir of [fakeHome, projectA, projectB]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // Global install: react at global scope sourced from a marketplace (plugin
    // form), a global api-developer preloading it, and BOTH projects registered.
    //
    // `source` is recorded because a real install records it. Omitting it makes
    // the fixture stage a SECOND global delta: `mergeGlobalConfigs` fills the
    // empty field from the incoming split, marks the merge dirty on that alone,
    // and the propagation this spec is about running for the wrong reason.
    await writeProjectConfig(
      fakeHome,
      buildProjectConfig({
        name: "project-context-migration-global",
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: MARKET }),
        agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [realpathSync(projectA), realpathSync(projectB)],
      }),
    );
    // Skill content lives at the global scope that owns it; the ref FORMAT is
    // driven purely by the config `source` string, independent of content
    // location (see dual-scope-mixed-source-compiled-ref.e2e.test.ts).
    await createLocalSkill(fakeHome, E2E_SKILL.react.id, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    await writeProjectConfig(projectA, buildDualScopeProjectConfig(PROJECT_A));
    await writeProjectConfig(projectB, buildRegisteredProjectConfig(PROJECT_B));

    // Phase 1: a real compile of BOTH projects while react is still
    // marketplace-sourced, producing the genuine plugin-form artifacts the
    // migration has to invalidate.
    const compiledA = await runCLI(["compile"], projectA, {
      env: { HOME: fakeHome },
    });
    compileAExitCode = compiledA.exitCode;
    compileAOutput = compiledA.combined;
    preEditAgentA = await readTestFile(projectAgentPath(projectA));

    const compiledB = await runCLI(["compile"], projectB, {
      env: { HOME: fakeHome },
    });
    compileBExitCode = compiledB.exitCode;
    compileBOutput = compiledB.combined;
    preEditAgentB = await readTestFile(projectAgentPath(projectB));

    // Phase 2: edit from PROJECT A (cwd = project-a, HOME = fakeHome, so this is a genuine
    // project-context edit). Commit the mode change on the ONE editable row — the project
    // half of the `[P][G]` pair; the locked global row is skipped by the walk — then go back
    // to the build step and collapse the pair P->G with `s`, which carries the entry, and
    // the mode just committed on it, to global scope.
    const wizard = await EditWizard.launch({
      projectDir: projectA,
      source: E2E_SOURCE,
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.TALL,
    });
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    await sources.setAllLocal();

    const build = await sources.goBack();
    await build.focusSkill(E2E_SKILL.react.display);
    await build.toggleScopeOnFocusedSkill();

    const sourcesAgain = await build.passThroughAllDomainsGeneric();
    await sourcesAgain.waitForReady();
    const agents = await sourcesAgain.advance();
    const confirm = await agents.acceptDefaults("edit");
    const outcome = await finishWizard(await confirm.confirm());
    editExitCode = outcome.exitCode;
    editOutput = outcome.output;

    globalConfig = await loadConfigOrFail(fakeHome);
    configA = await loadConfigOrFail(projectA);
    configB = await loadConfigOrFail(projectB);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  // Pre-state: the artifacts the migration must invalidate are genuine product
  // output, not hand-written fixtures.
  it("compiles both registered projects' agents in plugin-ref form while react is marketplace-sourced", () => {
    expect(compileAExitCode, `project-a compile must succeed: ${compileAOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(compileBExitCode, `project-b compile must succeed: ${compileBOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(
      preEditAgentA,
      "a marketplace-sourced skill must compile to the plugin ref form in project-a",
    ).toContain(REACT_PLUGIN_REF);
    expect(
      preEditAgentB,
      "a marketplace-sourced skill must compile to the plugin ref form in project-b",
    ).toContain(REACT_PLUGIN_REF);
  });

  it("completes the project-context source change successfully", () => {
    expect(editExitCode, `project-context edit must succeed: ${editOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
  });

  // Proof-of-execution: the migration genuinely switched the global-scoped skill.
  // Without these, every project-b assertion below could pass or fail for setup
  // reasons rather than for the missing propagation.
  it("records the new eject source in the global config", () => {
    expect(
      globalConfig.skills.filter((s) => s.id === E2E_SKILL.react.id),
      "the global react entry must record the eject source the migration performed",
    ).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: EJECT_SOURCE }),
    );
  });

  it("records the new eject source in the editing project's inlined skills", () => {
    expect(
      configA.skills.filter((s) => s.id === E2E_SKILL.react.id),
      "project-a's inlined react entry must record the eject source",
    ).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: EJECT_SOURCE }),
    );
  });

  it("recompiles the editing project's agent to the bare skill reference", async () => {
    await expect({ dir: projectA }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      skills: [E2E_SKILL.react.id],
    });
    await expect({ dir: projectA }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      notContains: [REACT_PLUGIN_REF],
    });
  });

  // The red: the bystander registered project.
  it("records the new eject source in the bystander project's inlined skills", () => {
    expect(
      configB.skills.filter((s) => s.id === E2E_SKILL.react.id),
      "project-b's inlined react entry must record the eject source the global migration produced",
    ).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: EJECT_SOURCE }),
    );
  });

  it("drops the plugin-form skill reference from the bystander project's compiled agent", async () => {
    await expect({ dir: projectB }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      notContains: [REACT_PLUGIN_REF],
    });
  });

  it("emits the bare skill id in the bystander project's compiled agent frontmatter", async () => {
    await expect({ dir: projectB }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      skills: [E2E_SKILL.react.id],
    });
  });

  it("rewrites the bystander project's compiled agent rather than leaving it byte-identical", async () => {
    expect(
      await readTestFile(projectAgentPath(projectB)),
      "project-b's compiled agent must have been rewritten by the propagated recompile",
    ).not.toBe(preEditAgentB);
  });

  it("reports the propagated recompile", () => {
    expect(
      editOutput,
      "the edit must report recompiling the registered project it propagated into",
    ).toContain(STEP_TEXT.PROPAGATED_RECOMPILE);
  });
});
