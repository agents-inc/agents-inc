import { realpathSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  fileExists,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName, ProjectConfig, StackAgentConfig } from "../../src/cli/types/index.js";

/**
 * Agent-removal propagation to registered projects.
 *
 * When a GLOBAL agent is removed via `cc edit` at global scope,
 * `propagateGlobalChangesToProjects` (local-installer.ts) rewrites each
 * registered project's config.ts. The project's own `agents[]` copy is
 * reconciled by `retainReconciledAgents` (drops active-global entries that
 * are neither project-scoped nor live tombstones), and the inlined writer
 * (`generateProjectConfigWithInlinedGlobal` in config-writer.ts) separately
 * re-inlines whatever is CURRENTLY active in `globalConfig.agents` on every
 * write. Together these two mechanisms should make a removed global agent
 * disappear from the project's rendered `agents[]`.
 *
 * This test verifies, via a real CLI run (not by reading the code):
 *   1. The removed global agent is gone from the project's rendered
 *      agents[] AND selectedAgents[].
 *   2. A separate, genuinely project-scoped agent whose stack references a
 *      skill ALSO referenced by the removed global agent is left completely
 *      untouched (no cross-contamination — the skill itself was not removed).
 *   3. The project's compiled `.claude/agents/<removed-agent>.md` file is NOT
 *      cleaned up (the known, already-tracked D-240 gap: propagation rewrites
 *      config.ts / config-types.ts but never recompiles or prunes a registered
 *      project's agent .md files).
 */

const REACT = "web-framework-react";
const WEB_DEVELOPER: AgentName = "web-developer";
const WEB_DEVELOPER_DISPLAY = "Web Developer";
const API_DEVELOPER: AgentName = "api-developer";

// The global (web-developer) agent's stack references react at global scope.
const globalStack = {
  [WEB_DEVELOPER]: {
    "web-framework": [{ id: REACT, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

// A project-scoped agent whose stack references the SAME globally-installed
// react that the removed global agent also references. Removing the global
// AGENT (not the skill) must leave this project-scoped stack entry intact.
const projectStack = {
  [API_DEVELOPER]: {
    "web-framework": [{ id: REACT, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

const reactMetadata =
  `author: "@test"\ndisplayName: ${REACT}\ncategory: web-framework\nslug: react\n` +
  `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
  `contentHash: "b2c3d4e"\n`;

/**
 * The registered project as it would appear after a normal wizard flow:
 * the global react skill and global web-developer agent are inlined, plus the
 * project's own project-scoped api-developer. selectedAgents mirrors the
 * inlined global + project union the writer produces.
 */
function buildRegisteredProjectConfig(name: string): ProjectConfig {
  return buildProjectConfig({
    name,
    skills: buildSkillConfigs([REACT], { scope: "global", source: "eject" }),
    agents: [
      ...buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      ...buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
    ],
    selectedAgents: [WEB_DEVELOPER, API_DEVELOPER],
    stack: projectStack,
  });
}

describe("global-scope agent removal propagates to registered projects", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;

  let projectDir: string;
  let projectConfig: ProjectConfig;
  let compiledAgentMdExists: boolean;
  let editExitCode: number;
  let editRawOutput: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;

    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "project-a");
    for (const dir of [globalHome, projectDir]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // Global install: web-developer (global) references react (global). The
    // registered project owns a project-scoped api-developer whose stack also
    // references the global react.
    const globalConfig = buildProjectConfig({
      name: "propagation-agent-removal-global",
      skills: buildSkillConfigs([REACT], { scope: "global", source: "eject" }),
      agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      domains: ["web"],
      selectedAgents: [WEB_DEVELOPER],
      stack: globalStack,
      projects: [realpathSync(projectDir)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, REACT, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    await writeProjectConfig(projectDir, buildRegisteredProjectConfig("project-a"));

    // Seed a previously-compiled web-developer.md in the PROJECT's agents dir.
    // Its survival after propagation is what demonstrates the D-240 gap.
    const projectAgentsDir = agentsPath(projectDir);
    await mkdir(projectAgentsDir, { recursive: true });
    await writeFile(
      path.join(projectAgentsDir, `${WEB_DEVELOPER}.md`),
      "---\nname: web-developer\n---\nStale compiled agent body\n",
    );

    // Edit at global scope: keep react, deselect the web-developer AGENT. This
    // rewrites the global config and fires propagateGlobalChangesToProjects for
    // the registered project.
    const wizard = await EditWizard.launch({
      projectDir: globalHome,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: globalHome },
      rows: 60,
      cols: 120,
    });
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();
    await agents.toggleAgent(WEB_DEVELOPER_DISPLAY);
    const confirm = await agents.advance("edit");
    const result = await confirm.confirm();
    editExitCode = await result.exitCode;
    editRawOutput = result.rawOutput;
    await result.destroy();

    const loaded = await loadProjectConfigFromDir(projectDir);
    if (!loaded) throw new Error("project config must exist after edit");
    projectConfig = loaded.config;

    compiledAgentMdExists = await fileExists(
      path.join(agentsPath(projectDir), `${WEB_DEVELOPER}.md`),
    );
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it("completes the global-scope edit successfully", () => {
    expect(editExitCode, `global edit must succeed: ${editRawOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  // Proof-of-execution + assertion 1a: the removed global agent must be gone
  // from the project's inlined agents[].
  it("drops the removed global agent from the project's inlined agents[]", () => {
    expect(
      projectConfig.agents.filter((a) => !a.excluded).map((a) => a.name),
      "project agents[] must no longer contain the removed global web-developer",
    ).not.toContain(WEB_DEVELOPER);
  });

  // Assertion 1b: the removed global agent should ALSO be gone from
  // selectedAgents[] — but it is NOT. `propagateGlobalChangesToProjects`
  // reconciles the project's `agents[]` (retainReconciledAgents) and `stack`
  // (retainReconciledStack) against the now-current global data, but never
  // reconciles `selectedAgents[]`. The project's stored selectedAgents (a flat
  // union that legitimately contains the global agent's name, per the inlined
  // writer) is carried forward verbatim and re-unioned with the shrunken
  // global list, so the removed global agent lingers in selectedAgents[] while
  // being absent from agents[] — an internal drift. This is the
  // "agent REMOVAL propagation" gap explicitly deferred in D-222 (which fixed
  // only the agent-ADDITION direction). See finding
  // 2026-07-18-propagation-selected-agents-not-pruned-on-agent-removal.md.
  it("removed global agent no longer lingers in the project's selectedAgents[]", () => {
    expect(
      projectConfig.selectedAgents ?? [],
      "selectedAgents[] must not contain the removed global web-developer",
    ).not.toContain(WEB_DEVELOPER);
  });

  // Assertion 2: the project-scoped api-developer's stack referencing the
  // still-present global react must be completely untouched (no
  // cross-contamination). react was NOT removed — only the global AGENT was —
  // so removedGlobalSkillIds is empty and retainReconciledStack returns the
  // stack unchanged. loadProjectConfigFromDir parses the compacted `"react"`
  // literal back into a { id, preloaded } SkillAssignment, so the loaded shape
  // is the seeded entry verbatim.
  it("leaves the project-scoped agent's own stack entries untouched", () => {
    expect(
      projectConfig.stack?.[API_DEVELOPER]?.["web-framework"],
      "project-scoped api-developer stack must still reference react unchanged",
    ).toStrictEqual([{ id: REACT, preloaded: false }]);
  });

  it("keeps the project-scoped api-developer active in agents[]", () => {
    expect(
      projectConfig.agents.filter((a) => !a.excluded).map((a) => a.name),
      "project-scoped api-developer must survive propagation",
    ).toContain(API_DEVELOPER);
  });

  // Assertion 3: KNOWN D-240 gap — propagation rewrites config.ts /
  // config-types.ts but never touches the project's compiled agent .md files,
  // so the stale web-developer.md is left on disk.
  it("does not clean up the project's compiled agent .md (matches known D-240 gap)", () => {
    expect(
      compiledAgentMdExists,
      "project .claude/agents/web-developer.md is expected to survive per known D-240 gap",
    ).toBe(true);
  });
});
