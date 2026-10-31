import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { generateConfigSource } from "../../src/cli/lib/configuration/config-writer.js";
import { splitConfigByScope } from "../../src/cli/lib/configuration/config-generator.js";
import { matrix } from "../../src/cli/lib/matrix/matrix-provider.js";
import { loadInstalledConfig } from "../../src/cli/lib/configuration/project-config.js";
import {
  cleanupTempDir,
  configTsPath,
  createTempDir,
  loadConfigOrFail,
  readTestFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { saUnflagged } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import {
  TEST_CUSTOM_SOURCE_URL,
  TEST_SOURCE_URL,
} from "../../src/cli/lib/__tests__/test-constants.js";

/** Declared under `web-e2e`, the category the control files it in. */
const CYPRESS_E2E_SKILL = "web-testing-cypress-e2e";

/** A live category that is not the one the catalogue declares for Cypress. */
const UNDECLARED_CYPRESS_CATEGORY = "web-testing";

const INLINED_GLOBAL = buildProjectConfig({
  name: "global",
  skills: buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "eject" }),
  agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
});

const GLOBAL_WITHOUT_ENTRIES = buildProjectConfig({ name: "global", skills: [], agents: [] });

/** What an installed global carries besides its entries. */
const GLOBAL_WITH_STACK_AND_FIELDS = buildProjectConfig({
  ...INLINED_GLOBAL,
  marketplace: TEST_SOURCE_URL,
  selectedDomains: ["web"],
  stack: { "web-developer": { "web-framework": [saUnflagged("web-framework-react")] } },
});

const PROJECT_HALF = buildProjectConfig({
  name: "inlines-its-global",
  skills: buildSkillConfigs([CYPRESS_E2E_SKILL], { scope: "project", origin: "eject" }),
  agents: buildAgentConfigs(["web-tester"], { scope: "project" }),
  stack: { "web-tester": { "web-e2e": [saUnflagged(CYPRESS_E2E_SKILL)] } },
});

const PROJECT_HALF_WITH_ITS_OWN_FIELDS = buildProjectConfig({
  ...PROJECT_HALF,
  marketplace: TEST_CUSTOM_SOURCE_URL,
  selectedDomains: ["api"],
});

/** Owns React itself, so the global's React is masked for this project. */
const PROJECT_HALF_MASKING_GLOBAL_REACT = buildProjectConfig({
  name: "masks-a-global-skill",
  skills: [
    ...buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      origin: "eject",
      excluded: true,
    }),
    ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
  ],
  agents: buildAgentConfigs(["web-tester"], { scope: "project" }),
});

// A fixture's config must be one the CLI would write: loading and re-writing it must be byte-identical
// (the loader normalises, so a state the product refuses drifts or throws).
describe("a fixture's config survives the product's own load-then-write cycle", () => {
  it("round-trips ProjectBuilder.dualScope's two configs byte for byte", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScope();

    for (const dir of [project.dir, globalHome.dir]) {
      const reread = await loadInstalledConfig(dir);
      expect(reread, `no config at ${dir}`).not.toBeNull();
      if (!reread) continue;

      const rewritten = generateConfigSource(reread.config, matrix);
      expect(
        rewritten,
        `${dir} holds a configuration the CLI would not have written — the fixture and the product disagree about it`,
      ).toBe(await readTestFile(configTsPath(dir)));
    }

    await cleanupTempDir(path.dirname(project.dir));
  });

  it("round-trips a config whose stack names each skill's declared category", async () => {
    const dir = await createTempDir();
    await writeProjectConfig(
      dir,
      buildProjectConfig({
        name: "declared-categories",
        skills: buildSkillConfigs([CYPRESS_E2E_SKILL], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        stack: { "web-developer": { "web-e2e": [saUnflagged(CYPRESS_E2E_SKILL)] } },
      }),
    );

    const reread = await loadInstalledConfig(dir);
    expect(reread).not.toBeNull();
    if (reread)
      expect(generateConfigSource(reread.config, matrix)).toBe(
        await readTestFile(configTsPath(dir)),
      );

    await cleanupTempDir(dir);
  });
});

describe("a ProjectBuilder config.ts is the file the CLI writes for it", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it.each([
    { label: "without a marketplace", options: {} },
    { label: "recording a marketplace", options: { marketplace: TEST_SOURCE_URL } },
  ])("round-trips withCustomSkill's config $label byte for byte", async ({ options }) => {
    const project = await ProjectBuilder.withCustomSkill(options);
    tempDir = path.dirname(project.dir);

    expect(
      generateConfigSource(await loadConfigOrFail(project.dir), matrix),
      "the fixture holds a config.ts the CLI would not have written",
    ).toBe(await readTestFile(configTsPath(project.dir)));
  });

  it("writes dualScopeWithGlobalTypes's project config as the CLI writes one beneath a global config", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScopeWithGlobalTypes();
    tempDir = path.dirname(project.dir);

    const globalConfig = await loadConfigOrFail(globalHome.dir);
    const projectHalf = splitConfigByScope(await loadConfigOrFail(project.dir)).project;

    expect(
      generateConfigSource(projectHalf, matrix, { isProjectConfig: true, globalConfig }),
      "the CLI inlines the global config's entries into a project config; it writes no import of it",
    ).toBe(await readTestFile(configTsPath(project.dir)));
  });
});

describe("a project config written with the global config it inlines", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  it("is written, and reads back with each global entry once beside the project's own", async () => {
    await writeProjectConfig(dir, PROJECT_HALF, {
      isProjectConfig: true,
      globalConfig: INLINED_GLOBAL,
    });

    const reread = await loadConfigOrFail(dir);
    expect(reread.skills).toStrictEqual([...INLINED_GLOBAL.skills, ...PROJECT_HALF.skills]);
    expect(reread.agents).toStrictEqual([...INLINED_GLOBAL.agents, ...PROJECT_HALF.agents]);
  });

  it("is written when it masks one of the global's entries, which reads back masked", async () => {
    await writeProjectConfig(dir, PROJECT_HALF_MASKING_GLOBAL_REACT, {
      isProjectConfig: true,
      globalConfig: INLINED_GLOBAL,
    });

    const reread = await loadConfigOrFail(dir);
    expect(reread.skills).toStrictEqual(PROJECT_HALF_MASKING_GLOBAL_REACT.skills);
    expect(reread.agents).toStrictEqual([
      ...INLINED_GLOBAL.agents,
      ...PROJECT_HALF_MASKING_GLOBAL_REACT.agents,
    ]);
  });

  it("is written when the global carries a stack, a marketplace and domains, and reads back with the project's own marketplace", async () => {
    await writeProjectConfig(dir, PROJECT_HALF_WITH_ITS_OWN_FIELDS, {
      isProjectConfig: true,
      globalConfig: GLOBAL_WITH_STACK_AND_FIELDS,
    });

    const reread = await loadConfigOrFail(dir);
    expect(reread.skills).toStrictEqual([...INLINED_GLOBAL.skills, ...PROJECT_HALF.skills]);
    expect(reread.agents).toStrictEqual([...INLINED_GLOBAL.agents, ...PROJECT_HALF.agents]);
    expect(reread.marketplace).toBe(TEST_CUSTOM_SOURCE_URL);
  });

  it("is written when the global config it inlines has no entries", async () => {
    await writeProjectConfig(dir, PROJECT_HALF, {
      isProjectConfig: true,
      globalConfig: GLOBAL_WITHOUT_ENTRIES,
    });

    const reread = await loadConfigOrFail(dir);
    expect(reread.skills).toStrictEqual(PROJECT_HALF.skills);
    expect(reread.agents).toStrictEqual(PROJECT_HALF.agents);
  });

  it("is refused when its stack files a skill under a category the catalogue does not declare for it", async () => {
    const misfiled = {
      ...PROJECT_HALF,
      stack: {
        "web-tester": { [UNDECLARED_CYPRESS_CATEGORY]: [saUnflagged(CYPRESS_E2E_SKILL)] },
      },
    };

    await expect(
      writeProjectConfig(dir, misfiled, { isProjectConfig: true, globalConfig: INLINED_GLOBAL }),
    ).rejects.toThrow("the CLI would not have written");
  });
});
