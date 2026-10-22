import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EJECT_SOURCE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  loadConfigOrFail,
  readTestFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readAllSkillEntries } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";

const REMOVED_SKILL = E2E_SKILL.hono;

/** Its compiled `.md` preloads the removed skill, so it proves propagation drove a recompile. */
const PROJECT_AGENT = E2E_AGENT["api-developer"];

const PROJECT_AGENT_ONLY_ID = "ProjAgt1";

function sourceFolderOf(dir: string): string {
  return path.dirname(configTsPath(dir));
}

/** Structural (load, filter, write), so the removal cannot depend on the writer's formatting. */
async function removeGlobalSkillByHand(globalHome: string, skillId: string): Promise<void> {
  const globalConfig = await loadConfigOrFail(globalHome);

  expect(
    globalConfig.skills.map((s) => s.id),
    "the global config must hold the skill this hand-edit removes",
  ).toContain(skillId);
  expect(
    globalConfig.projects?.length,
    "the project install must have registered itself — propagation reads that list",
  ).toBeGreaterThan(0);

  await writeProjectConfig(globalHome, {
    ...globalConfig,
    skills: globalConfig.skills.filter((s) => s.id !== skillId),
  });
}

describe("compile at the home directory fans a hand-edited global config out to registered projects", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      PROJECT_AGENT_ONLY_ID,
      e2eStackPayload({ scope: "global", projectAgents: [PROJECT_AGENT.name] }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "rewrites the registered project's config pair and recompiles its agents",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const installed = await runInitFrom(
        store,
        PROJECT_AGENT_ONLY_ID,
        { dir: projectDir, globalHome: fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

      const projectAgentMd = path.join(agentsPath(projectDir), `${PROJECT_AGENT.name}.md`);

      expect(
        await readAllSkillEntries(projectDir),
        "the project config must inline the global skill it is about to be orphaned from",
      ).toContainEqual({ id: REMOVED_SKILL.id, scope: "global", origin: EJECT_SOURCE_NAME });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(PROJECT_AGENT.name, {
        contains: [REMOVED_SKILL.id],
      });
      const projectAgentBefore = await readTestFile(projectAgentMd);

      // Control: a failure at the end is about the global change, not the install.
      const afterInstall = await typecheckGeneratedConfig(sourceFolderOf(projectDir));
      expect(
        afterInstall.exitCode,
        `A freshly installed project config.ts must type-check.\ntsc output:\n${afterInstall.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      await removeGlobalSkillByHand(fakeHome, REMOVED_SKILL.id);
      const globalConfigAfterEdit = await readTestFile(configTsPath(fakeHome));

      const compile = await CLI.run(["compile"], { dir: fakeHome }, { env: { HOME: fakeHome } });
      expect(compile.exitCode, `Compile at HOME failed: ${compile.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      expect(
        (await readAllSkillEntries(projectDir)).map((s) => s.id),
        "the removed global skill must not survive in the registered project's config",
      ).not.toContain(REMOVED_SKILL.id);
      expect(
        await readTestFile(configTsPath(projectDir)),
        "no trace of the removed skill may remain in the project's config.ts",
      ).not.toContain(REMOVED_SKILL.id);

      const afterPropagation = await typecheckGeneratedConfig(sourceFolderOf(projectDir));
      expect(
        afterPropagation.exitCode,
        `Propagation must leave the project's config pair type-checking.\ntsc output:\n${afterPropagation.output || "(no diagnostics)"}`,
      ).toBe(EXIT_CODES.SUCCESS);

      // Propagation is config-only, so the command owes the recompile. A byte diff too: the file
      // must have been rewritten, not merely lack the skill.
      expect(
        compile.output,
        "compile must report the propagated project's agent recompile",
      ).toContain(STEP_TEXT.PROPAGATED_RECOMPILE_ONE);
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(PROJECT_AGENT.name, {
        notContains: [REMOVED_SKILL.id],
      });
      expect(
        await readTestFile(projectAgentMd),
        "the propagated project's compiled agent must have been rewritten",
      ).not.toBe(projectAgentBefore);

      // compile never rewrites the hand-edited config.ts it was pointed at.
      expect(await readTestFile(configTsPath(fakeHome))).toBe(globalConfigAfterEdit);
    },
  );
});
