import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  E2E_SKILL,
  E2E_SKILL_IDS,
  E2E_STACK_AGENTS,
  E2E_STACK_SKILL_IDS,
} from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  configTypesTsPath,
  flattenCliOutput,
  listFiles,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

// At project scope the install's copies and the eject's share one folder.
const NOT_INSTALLED = E2E_SKILL_IDS.filter((id) => !E2E_STACK_SKILL_IDS.includes(id));

const CUSTOMISED_SKILL = E2E_SKILL.react.id;
const USERS_OWN_EDIT = "the user's own edit to a skill init --from copied";

describe("eject skills on an installation init --from made", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "copies in every marketplace skill the project lacks, leaving its own copies, its configuration and its sub-agents as they were",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const { projectDir, fakeHome } = env;
      await installFromSeed(
        store,
        "EjSkInst",
        e2eStackPayload({ scope: "project" }),
        { dir: projectDir, home: fakeHome },
        source.sourceDir,
      );

      const skillsDir = skillsPath(projectDir);
      expect(
        (await listFiles(skillsDir)).sort(),
        "init --from copied the stack's skills into the project",
      ).toStrictEqual([...E2E_STACK_SKILL_IDS].sort());
      const customisedSkillMd = path.join(skillsDir, CUSTOMISED_SKILL, FILES.SKILL_MD);
      const customised = `${await readTestFile(customisedSkillMd)}\n${USERS_OWN_EDIT}\n`;
      await writeFile(customisedSkillMd, customised);

      const configBefore = await readTestFile(configTsPath(projectDir));
      const typesBefore = await readTestFile(configTypesTsPath(projectDir));
      const agentsBefore = await readCompiledAgents(projectDir);
      // `readCompiledAgents` answers `{}` for a missing directory, so name the roster.
      expect(Object.keys(agentsBefore).sort()).toStrictEqual(
        E2E_STACK_AGENTS.map((name) => `${name}.md`),
      );

      const { exitCode, stdout, output } = await CLI.run(["eject", "skills"], {
        dir: projectDir,
        globalHome: fakeHome,
      });

      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
      expect(compactCliOutput(stdout)).toContain(
        compactCliOutput(
          `${NOT_INSTALLED.length} skills ejected to ${skillsDir} from ${source.sourceDir}`,
        ),
      );
      expect(compactCliOutput(output)).toContain(
        compactCliOutput(
          `Skills already exist at ${skillsDir} — skipped ${E2E_STACK_SKILL_IDS.length} skills. Use --force to overwrite them.`,
        ),
      );

      expect((await listFiles(skillsDir)).sort()).toStrictEqual([...E2E_SKILL_IDS].sort());
      for (const skillId of NOT_INSTALLED) {
        await expect({ dir: projectDir }).toHaveSkillCopied(skillId);
      }
      expect(
        await readTestFile(customisedSkillMd),
        "an eject without --force keeps the user's edit to a copy the install made",
      ).toBe(customised);

      expect(
        await readTestFile(configTsPath(projectDir)),
        "ejecting skills is not a configuration change",
      ).toBe(configBefore);
      expect(await readTestFile(configTypesTsPath(projectDir))).toBe(typesBefore);
      expect(await readCompiledAgents(projectDir), "eject skills compiles nothing").toStrictEqual(
        agentsBefore,
      );
    },
  );
});
