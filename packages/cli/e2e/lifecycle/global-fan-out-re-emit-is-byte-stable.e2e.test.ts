import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  readTestFile,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * A home-directory `compile` fanning out twice must rewrite a registered project's `config.ts`
 * byte-for-byte identically: the second run's input is the first run's output. Arranged inside the
 * `it`, since the run mutates the project it reads and a retry would compare different fan-outs.
 */

const GLOBAL_SKILL = E2E_SKILL.react;

const PROJECT_SKILL = E2E_SKILL.vitest;
const PROJECT_AGENT = E2E_AGENT["api-developer"];
const GLOBAL_AGENT = E2E_AGENT["web-developer"];

const EJECT_SOURCE = "eject";

/** The one scalar the project's own config carries; the global config carries three. */
const SHARED_AUTHOR = "@owner";

describe("a global fan-out re-emits an unaffected project's config byte-identically", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "leaves the project's config.ts and compiled agents untouched on a second identical fan-out",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "registered-project");
      for (const dir of [globalHome, projectDir]) {
        await mkdir(dir, { recursive: true });
        await createPermissionsFile(dir);
      }

      // The project carries only one of the three global scalars, the asymmetry a first emission
      // leaves behind.
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "byte-stable-global",
          description: "Global install",
          skills: buildSkillConfigs([GLOBAL_SKILL.id], { scope: "global", origin: EJECT_SOURCE }),
          agents: buildAgentConfigs([GLOBAL_AGENT.name], { scope: "global" }),
          selectedDomains: ["web"],
          stack: { [GLOBAL_AGENT.name]: { "web-framework": [{ id: GLOBAL_SKILL.id }] } },
          marketplaceName: "byte-stable-marketplace",
          author: SHARED_AUTHOR,
          projects: [realpathSync(projectDir)],
        }),
      );
      await createLocalSkill(globalHome, GLOBAL_SKILL.id, {
        description: "Global skill inherited by the registered project",
        metadata: renderMetadataYaml({
          displayName: GLOBAL_SKILL.display,
          category: "web-framework",
          slug: GLOBAL_SKILL.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "hash-global",
        }),
      });

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "byte-stable-project",
          skills: [
            ...buildSkillConfigs([GLOBAL_SKILL.id], { scope: "global", origin: EJECT_SOURCE }),
            ...buildSkillConfigs([PROJECT_SKILL.id], { scope: "project", origin: EJECT_SOURCE }),
          ],
          agents: buildAgentConfigs([PROJECT_AGENT.name], { scope: "project" }),
          stack: { [PROJECT_AGENT.name]: { "web-testing": [{ id: PROJECT_SKILL.id }] } },
          author: SHARED_AUTHOR,
        }),
      );
      await createLocalSkill(projectDir, PROJECT_SKILL.id, {
        description: "Project-owned skill compiled into the project's own agent",
        metadata: renderMetadataYaml({
          displayName: PROJECT_SKILL.display,
          category: "web-testing",
          slug: PROJECT_SKILL.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "hash-project",
        }),
      });

      const projectAgentMd = path.join(agentsPath(projectDir), `${PROJECT_AGENT.name}.md`);

      const firstRun = await CLI.run(
        ["compile"],
        { dir: globalHome },
        { env: { HOME: globalHome } },
      );
      expect(firstRun.exitCode, `First compile at HOME failed: ${firstRun.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(firstRun.output, "the fan-out must have reached the registered project").toContain(
        STEP_TEXT.PROPAGATED_RECOMPILE_ONE,
      );

      const configAfterFirst = await readTestFile(configTsPath(projectDir));
      const agentAfterFirst = await readTestFile(projectAgentMd);
      expect(
        configAfterFirst,
        "the re-emitted project config must inline the global scalars",
      ).toContain(`author: '${SHARED_AUTHOR}'`);
      expect(agentAfterFirst, "the project's own agent must carry its project skill").toContain(
        PROJECT_SKILL.id,
      );

      const secondRun = await CLI.run(
        ["compile"],
        { dir: globalHome },
        { env: { HOME: globalHome } },
      );
      expect(secondRun.exitCode, `Second compile at HOME failed: ${secondRun.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      expect(
        await readTestFile(configTsPath(projectDir)),
        "a fan-out that changes no value must not move a byte of the project's config.ts",
      ).toBe(configAfterFirst);
      expect(
        await readTestFile(projectAgentMd),
        "a fan-out that changes no value must not rewrite the project's compiled agent",
      ).toBe(agentAfterFirst);
      expect(
        secondRun.output,
        "the second fan-out must report the project's agents as unchanged",
      ).toContain(
        `${STEP_TEXT.PROPAGATED_RECOMPILE} 0 registered projects, 1 ${STEP_TEXT.UNCHANGED}`,
      );
    },
  );
});
