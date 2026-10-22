import path from "path";
import { mkdir, readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeProjectConfig } from "./write-project-config.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import { sourceFolderInUse } from "../../installation/install-layout.js";
import { initializeMatrix } from "../../matrix/matrix-provider.js";
import type { AgentName, ProjectConfig, SkillId } from "../../../types/index.js";
import { STANDARD_FILES } from "../../../consts.js";
import { buildAgentDefs, createMockAgent } from "../../__tests__/factories/agent-factories.js";
import {
  buildAgentConfigs,
  buildInstallSelection,
  buildProjectConfig,
  buildSourceResult,
} from "../../__tests__/factories/config-factories.js";
import { readTestTsConfig, writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { readGeneratedUnion } from "../../__tests__/helpers/generated-types.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { buildSkillConfigs } from "../../__tests__/helpers/skill-config-builders.js";
import { FULLSTACK_TRIO_MATRIX } from "../../__tests__/mock-data/mock-matrices.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";

const SELECTED: SkillId = "web-framework-react";
const LEFT_OUT_OF_PROJECT: SkillId = "web-testing-vitest";
const LEFT_OUT_OF_GLOBAL: SkillId = "api-framework-hono";

/** Writes for real: the merge, the gate and the files it lands are the subject. */
describe("writeProjectConfig", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-write-project-config-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    initializeMatrix(FULLSTACK_TRIO_MATRIX);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  const skillIdsIn = async (dir: string): Promise<SkillId[]> =>
    (await readTestTsConfig<ProjectConfig>(getProjectConfigPath(dir, "claude"))).skills.map(
      (skill) => skill.id,
    );

  describe("a session that leaves installed skills out", () => {
    beforeEach(async () => {
      await writeTestTsConfig(
        home.dir,
        buildProjectConfig({
          agents: [],
          skills: buildSkillConfigs([LEFT_OUT_OF_GLOBAL], { scope: "global" }),
        }),
      );
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ agents: [], skills: buildSkillConfigs([LEFT_OUT_OF_PROJECT]) }),
      );
    });

    const writeSelecting = (authoritativeScope?: "all") =>
      writeProjectConfig({
        selection: buildInstallSelection(buildSkillConfigs([SELECTED])),
        sourceResult: buildSourceResult(FULLSTACK_TRIO_MATRIX, tempDir),
        projectDir,
        ...(authoritativeScope !== undefined && { authoritativeScope }),
      });

    it("drops them from the project and the global config alike when it owns every scope", async () => {
      await writeSelecting("all");

      expect(await skillIdsIn(projectDir)).toStrictEqual([SELECTED]);
      expect(await skillIdsIn(home.dir)).toStrictEqual([]);
    });

    it("keeps them in the project and the global config alike when it claims no authority", async () => {
      await writeSelecting();

      // The project's config.ts inlines the global rows it inherits.
      expect((await skillIdsIn(projectDir)).toSorted()).toStrictEqual(
        [LEFT_OUT_OF_GLOBAL, LEFT_OUT_OF_PROJECT, SELECTED].toSorted(),
      );
      expect(await skillIdsIn(home.dir)).toStrictEqual([LEFT_OUT_OF_GLOBAL]);
    });
  });

  describe("what it records of the selection", () => {
    const writtenConfig = (): Promise<ProjectConfig> =>
      readTestTsConfig<ProjectConfig>(getProjectConfigPath(projectDir, "claude"));

    it("records the domains the selection names", async () => {
      await writeProjectConfig({
        selection: buildInstallSelection(buildSkillConfigs([SELECTED]), {
          selectedDomains: ["web", "api"],
        }),
        sourceResult: buildSourceResult(FULLSTACK_TRIO_MATRIX, tempDir),
        projectDir,
      });

      expect((await writtenConfig()).selectedDomains).toStrictEqual(["web", "api"]);
    });

    it("records the selected sub-agents only as agent rows, never as a flat list", async () => {
      const selectedAgents: AgentName[] = ["api-developer", "web-developer"];

      await writeProjectConfig({
        selection: buildInstallSelection(buildSkillConfigs([SELECTED]), {
          selectedAgents,
          agentConfigs: buildAgentConfigs(selectedAgents),
        }),
        sourceResult: buildSourceResult(FULLSTACK_TRIO_MATRIX, tempDir),
        projectDir,
      });

      const config = await writtenConfig();
      expect(config.agents.map((agent) => agent.name).toSorted()).toStrictEqual(selectedAgents);
      expect(Object.keys(config)).not.toContain("selectedAgents");
    });
  });

  describe("the sub-agent roster its types are written against", () => {
    const SELECTED_AGENTS: AgentName[] = ["api-developer", "web-developer"];

    const writeWith = (agentDefs?: ReturnType<typeof buildAgentDefs>) =>
      writeProjectConfig({
        selection: buildInstallSelection(buildSkillConfigs([SELECTED]), {
          selectedAgents: SELECTED_AGENTS,
          agentConfigs: buildAgentConfigs(SELECTED_AGENTS, { scope: "global" }),
        }),
        sourceResult: buildSourceResult(FULLSTACK_TRIO_MATRIX, tempDir),
        projectDir,
        ...(agentDefs !== undefined && { agentDefs }),
      });

    const emittedAgentNames = async (): Promise<string | undefined> =>
      readGeneratedUnion(
        await readFile(
          path.join(sourceFolderInUse(home.dir, "claude").dir, STANDARD_FILES.CONFIG_TYPES_TS),
          "utf-8",
        ),
        "AgentName",
      );

    it("is the one it was handed, so a sub-agent outside it is typed as custom", async () => {
      await writeWith(buildAgentDefs({ "web-developer": createMockAgent("web-developer") }));

      expect(await emittedAgentNames()).toBe(
        ["", "  // Custom", "  | 'api-developer'", "  // Marketplace", "  | 'web-developer'"].join(
          "\n",
        ),
      );
    });

    it("is the CLI's own when none is handed, so every built-in sub-agent is typed as built in", async () => {
      await writeWith();

      expect(await emittedAgentNames()).toBe(" 'api-developer' | 'web-developer'");
    });
  });
});
