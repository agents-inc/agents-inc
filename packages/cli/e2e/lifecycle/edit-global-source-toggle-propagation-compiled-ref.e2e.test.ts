import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { finishWizard } from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
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
 * D-256 (regression coverage for D-240): a plugin -> eject source change made at
 * GLOBAL scope must reach a registered project's COMPILED agents, not just its
 * config.ts.
 *
 * `propagateGlobalChangesToProjects` (local-installer.ts) rewrites each
 * registered project's `.claude-src/config.ts` and `config-types.ts` after a
 * global change, but never recompiles that project's `.claude/agents/*.md`.
 * `compileAgentsAllScopes` only covers the CURRENT context (home + the current
 * project), never the other registered projects. So after the toggle the
 * registered project's config correctly records `source: "eject"` while its
 * compiled agent still emits the plugin form `<id>:<id>`, which no longer
 * resolves.
 *
 * Shape of the fixture:
 *   - HOME owns react (global scope, marketplace source) and a GLOBAL
 *     api-developer whose stack preloads react.
 *   - The registered project owns a PROJECT-scoped web-developer whose stack
 *     preloads the same global react.
 *
 * The project's stale `.claude/agents/web-developer.md` is produced by a real
 * `cc compile` run (not hand-written), so the plugin-form reference under test
 * is exactly what the product emits while react is marketplace-sourced.
 *
 * The Claude CLI is not required: a plugin -> eject migration copies the skill
 * locally and treats the plugin uninstall as best-effort.
 */

const REACT_PLUGIN_REF = `${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`;

/** Marketplace label recorded as react's source, i.e. plugin (non-eject) form. */
const MARKET = "test-marketplace";

// The GLOBAL agent's stack preloads react at global scope, so its own compiled
// output tracks react's source and proves the current context WAS recompiled.
const globalStack = {
  [E2E_AGENT["api-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

// The registered project's own PROJECT-scoped agent preloads the same global
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
  contentHash: "b2c3d4e",
});

/**
 * The registered project as a normal wizard flow leaves it: the global react
 * skill is inlined verbatim from the global config (marketplace-sourced), and
 * the project owns a project-scoped agent whose stack references it.
 */
function buildRegisteredProjectConfig(name: string): FixtureProjectConfig {
  return buildProjectConfig({
    name,
    skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: MARKET }),
    agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
    stack: projectStack,
  });
}

describe("global-scope source change propagates to registered projects", () => {
  let tempDir: string;

  let fakeHome: string;
  let projectDir: string;

  let compileExitCode: number;
  let compileOutput: string;
  let preEditProjectAgent: string;
  let editExitCode: number;
  let editOutput: string;
  /**
   * The TERMINAL BUFFER after the run, which is a different surface from the raw
   * capture: `edit` clears the screen and the scrollback before printing its change
   * summary, so this holds the summary alone — no wizard frames. The raw capture
   * keeps every byte the process ever wrote, including the confirm step's own `~`
   * source-change indicator, which a `toContain("~ <skill>")` on it matches whether
   * or not the command printed anything.
   */
  let editSummaryScreen: string;
  let projectConfig: FixtureProjectConfig;

  beforeAll(async () => {
    await ensureBinaryExists();

    tempDir = await createTempDir();
    fakeHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "project-a");
    for (const dir of [fakeHome, projectDir]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // Global install: react at global scope sourced from a marketplace (plugin
    // form), a global api-developer preloading it, and the project registered.
    await writeProjectConfig(
      fakeHome,
      buildProjectConfig({
        name: "propagation-source-toggle-global",
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: MARKET }),
        agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [realpathSync(projectDir)],
      }),
    );
    // Skill content lives at the global scope that owns it; the ref FORMAT is
    // driven purely by the config `source` string, independent of content
    // location (see dual-scope-mixed-source-compiled-ref.e2e.test.ts).
    await createLocalSkill(fakeHome, E2E_SKILL.react.id, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    await writeProjectConfig(projectDir, buildRegisteredProjectConfig("project-a"));

    // Phase 1: a real compile of the registered project while react is still
    // marketplace-sourced, producing the genuine plugin-form artifact this test
    // expects the global toggle to invalidate.
    const compiled = await runCLI(["compile"], projectDir, {
      env: { HOME: fakeHome },
    });
    compileExitCode = compiled.exitCode;
    compileOutput = compiled.combined;
    preEditProjectAgent = await readTestFile(
      path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`),
    );

    // Phase 2: edit at GLOBAL scope (HOME and cwd both the fake home, otherwise
    // this silently becomes a project edit) and switch every source to local
    // ("l"), flipping react from the marketplace to eject. This rewrites the
    // global config and fires propagateGlobalChangesToProjects for the
    // registered project.
    const wizard = await EditWizard.launch({
      projectDir: fakeHome,
      source: E2E_SOURCE,
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.TALL,
    });
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const editRun = await confirm.confirm();
    // Read the processed buffer once the process has exited but BEFORE finishWizard
    // destroys the session — the order finishWizard's own docblock prescribes.
    await editRun.exitCode;
    editSummaryScreen = editRun.output;
    const outcome = await finishWizard(editRun);
    editExitCode = outcome.exitCode;
    editOutput = outcome.output;

    projectConfig = await loadConfigOrFail(projectDir);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  // Pre-state: the artifact the global toggle must invalidate is a genuine
  // product output, not a hand-written fixture.
  it("compiles the registered project's agent in plugin-ref form while react is marketplace-sourced", () => {
    expect(compileExitCode, `project compile must succeed: ${compileOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(
      preEditProjectAgent,
      "a marketplace-sourced skill must compile to the plugin ref form",
    ).toContain(REACT_PLUGIN_REF);
  });

  it("completes the global-scope source change successfully", () => {
    expect(editExitCode, `global edit must succeed: ${editOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  // The same switch as the summary reports it. A plugin -> eject move keeps the skill
  // installed, so the Changes block carries one amber `~` line; a `-`/`+` pair would
  // read as an uninstall plus an unrelated install of something else.
  it("reports the install-mode switch as one ~ line in the change summary", () => {
    expect(
      editSummaryScreen,
      "a plugin -> eject switch is a modification, not a removal and an addition",
    ).toContain(`~ ${E2E_SKILL.react.display}`);
    expect(editSummaryScreen, "the summary must not double the switch as a removal").not.toContain(
      `- ${E2E_SKILL.react.display}`,
    );
    expect(
      editSummaryScreen,
      "the summary must not double the switch as an addition",
    ).not.toContain(`+ ${E2E_SKILL.react.display}`);
  });

  // Proof-of-execution: propagation actually rewrote the registered project's
  // config.ts with the new source. Without this the compiled-agent assertions
  // below could pass or fail for setup reasons rather than the missing
  // recompile.
  it("records the new eject source in the registered project's inlined skills", () => {
    expect(
      projectConfig.skills.filter((s) => s.id === E2E_SKILL.react.id),
      "the registered project's inlined react entry must record the eject source",
    ).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: EJECT_SOURCE }),
    );
  });

  // The current context IS recompiled: the global agent's own compiled output
  // switches to the bare id. This is what the registered project never gets.
  it("recompiles the current context's global agent to the bare skill reference", async () => {
    await expect({ dir: fakeHome }).toHaveAgentFrontmatter(E2E_AGENT["api-developer"].name, {
      skills: [E2E_SKILL.react.id],
    });
    await expect({ dir: fakeHome }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      notContains: [REACT_PLUGIN_REF],
    });
  });

  it("drops the plugin-form skill reference from the registered project's compiled agent", async () => {
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      notContains: [REACT_PLUGIN_REF],
    });
  });

  it("emits the bare skill id in the registered project's compiled agent frontmatter", async () => {
    await expect({ dir: projectDir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      skills: [E2E_SKILL.react.id],
    });
  });
});
