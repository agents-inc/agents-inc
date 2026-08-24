import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  loadConfigOrFail,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

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
 * mergeWithExistingConfig -> mergeConfigs -> writeScopedFromWizard HOME-context).
 */

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

describe("global edit at HOME preserves the registered projects array", () => {
  let tempDir: string;
  let globalHome: string;
  let registeredProject: string;

  let projectsBefore: string[] | undefined;
  let projectsAfter: string[] | undefined;
  let editExitCode: number;

  beforeAll(async () => {
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
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
      }),
    );

    // Seed the global install at ~/ with react + web-developer and a registered
    // project path in `projects`.
    const globalConfig: FixtureProjectConfig = buildProjectConfig({
      name: "preserve-projects-global",
      skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      selectedDomains: ["web"],
      stack: globalStack,
      projects: [realpathSync(registeredProject)],
    });
    await writeProjectConfig(globalHome, globalConfig);
    await createLocalSkill(globalHome, E2E_SKILL.react.id, {
      description: "Global react copy",
      metadata: reactMetadata,
    });

    projectsBefore = (await loadConfigOrFail(globalHome)).projects;

    // Edit at global scope and toggle react off — any change forces the
    // HOME-context write path, which is where `projects` would be lost.
    const wizard = await EditWizard.launch({
      projectDir: globalHome,
      source: E2E_SOURCE,
      env: { HOME: globalHome },
      ...TERMINAL_SIZE.TALL,
    });
    await wizard.build.selectSkill(E2E_SKILL.react.display);
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const result = await confirm.confirm();
    editExitCode = await result.exitCode;
    await result.destroy();

    projectsAfter = (await loadConfigOrFail(globalHome)).projects;
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
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
