import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
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
 * A global-scope `cc edit` at ~/ must preserve the global config's registered
 * `projects` array across the write. `mergeConfigs` seeds `merged` from
 * `newConfig` (which never carries `projects` — the wizard result has no such
 * field), so without an explicit carry-forward the field would be dropped and
 * the home-context propagation guard `if (finalConfig.projects?.length)` would
 * silently never fire.
 *
 * This exercises the merger's `projects` preservation branch through the real
 * edit-at-HOME pipeline (writeProjectConfig -> buildAndMergeConfig ->
 * mergeWithExistingConfig -> mergeConfigs -> writeScopedConfigs HOME-context).
 */

const REACT = "web-framework-react";
const WEB_DEVELOPER: AgentName = "web-developer";

const globalStack = {
  [WEB_DEVELOPER]: {
    "web-framework": [{ id: REACT, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

const reactMetadata =
  `author: "@test"\ndisplayName: ${REACT}\ncategory: web-framework\nslug: react\n` +
  `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
  `contentHash: "b2c3d4e"\n`;

describe("global edit at HOME preserves the registered projects array", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;
  let globalHome: string;
  let registeredProject: string;

  let projectsBefore: string[] | undefined;
  let projectsAfter: string[] | undefined;
  let editExitCode: number;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;

    tempDir = await createTempDir();
    globalHome = path.join(tempDir, "home");
    registeredProject = path.join(tempDir, "registered-project");
    for (const dir of [globalHome, registeredProject]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // Seed the registered project's own minimal config so it is a live
    // (non-stale) registered project.
    await writeProjectConfig(
      registeredProject,
      buildProjectConfig({
        name: "registered-project",
        skills: buildSkillConfigs([REACT], { scope: "global", source: "eject" }),
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "project" }),
      }),
    );

    // Seed the global install at ~/ with react + web-developer and a registered
    // project path in `projects`.
    const globalConfig: ProjectConfig = buildProjectConfig({
      name: "preserve-projects-global",
      skills: buildSkillConfigs([REACT], { scope: "global", source: "eject" }),
      agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      domains: ["web"],
      selectedAgents: [WEB_DEVELOPER],
      stack: globalStack,
      projects: [realpathSync(registeredProject)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, REACT, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    const seededGlobal = await loadProjectConfigFromDir(globalHome);
    if (!seededGlobal) throw new Error("seeded global config must load");
    projectsBefore = seededGlobal.config.projects;

    // Edit at global scope and toggle react off — any change forces the
    // HOME-context write path, which is where `projects` would be lost.
    const wizard = await EditWizard.launch({
      projectDir: globalHome,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: globalHome },
      rows: 60,
      cols: 120,
    });
    await wizard.build.selectSkill(REACT);
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const result = await confirm.confirm();
    editExitCode = await result.exitCode;
    await result.destroy();

    const loadedGlobal = await loadProjectConfigFromDir(globalHome);
    if (!loadedGlobal) throw new Error("global config must exist after edit");
    projectsAfter = loadedGlobal.config.projects;
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it("completes the global edit successfully", () => {
    expect(editExitCode).toBe(EXIT_CODES.SUCCESS);
  });

  it("seeds the projects array before the edit", () => {
    expect(projectsBefore).toStrictEqual([realpathSync(registeredProject)]);
  });

  it("preserves the registered projects array across the HOME-context write", () => {
    expect(projectsAfter).toStrictEqual(projectsBefore);
  });
});
