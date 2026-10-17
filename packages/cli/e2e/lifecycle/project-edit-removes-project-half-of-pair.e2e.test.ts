import path from "path";
import { appendFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import {
  configTsPath,
  configTypesTsPath,
  directoryExists,
  listFiles,
  readCompiledAgents,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  readSkillEntries,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import {
  applyFromSeed,
  e2eStackPayload,
  installE2EStackGlobally,
  installFromSeed,
} from "../fixtures/e2e-stack-seed.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";

const SCOPED_ALIASES = ["SkillId", "Category"] as const;

const PROJECT_COPY_EDIT_MARKER = "## Section added to the project's copy after installation";

/**
 * A project may drop the project-owned half of a `[P][G]` pair; the guard refusing project-scope
 * changes covers only global-owned halves. The project's copy is edited first and the global folder
 * compared as a tree snapshot, so a drop that wrote the project copy back over it is caught.
 */

describe("project edit drops the project half of a dual-scope pair", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "an edit leaving out a persisted [P][G] pair's project half removes it and leaves the global install whole",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const { fakeHome, projectDir } = env;
      const project = { dir: projectDir, home: fakeHome };

      // A project skill never reaches the global web-developer, so the project's React is
      // assigned to no sub-agent.
      await installE2EStackGlobally(store, fakeHome);
      await installFromSeed(
        store,
        "Paired1",
        e2eStackPayload({
          projectSkills: [E2E_SKILL.react.id],
          unassigned: [E2E_SKILL.react.id],
        }),
        project,
      );
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "setup must persist an active project entry plus a global tombstone",
      ).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
      ]);
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.react.id)),
        "setup must copy the skill into the project's skills dir",
      ).toBe(true);

      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      await appendFile(
        path.join(skillsPath(projectDir), E2E_SKILL.react.id, FILES.SKILL_MD),
        `\n\n${PROJECT_COPY_EDIT_MARKER}\n`,
      );
      expect(
        await readTestFile(path.join(globalSkillDir, FILES.SKILL_MD)),
        "the global copy must differ from the edited project copy before the drop, or a write over it would leave its bytes as they were",
      ).not.toContain(PROJECT_COPY_EDIT_MARKER);
      const globalSkillBefore = await readTreeSnapshot(globalSkillDir);

      const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
      const globalTypesBefore = await readTestFile(configTypesTsPath(fakeHome));
      const globalAgentsBefore = await readCompiledAgents(fakeHome);
      const globalSkillsBefore = await listFiles(skillsPath(fakeHome));
      expect(
        Object.keys(globalAgentsBefore).length,
        "the global scope must hold compiled agents before the edit, or its unchanged-ness is vacuous",
      ).toBeGreaterThan(0);
      expect(
        globalSkillsBefore,
        "the global install must hold the skill before the edit — it is what must survive",
      ).toContain(E2E_SKILL.react.id);

      await applyFromSeed(store, "Dropped1", e2eStackPayload(), project);

      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "dropping the project half must collapse the pair to the inherited global entry",
      ).toStrictEqual([{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }]);
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.react.id)),
        "dropping the project half must remove the project's copy of the skill",
      ).toBe(false);

      expect(
        await readTestFile(configTsPath(fakeHome)),
        "a project-scope removal must not rewrite the global config",
      ).toBe(globalConfigBefore);
      expect(
        await readCompiledAgents(fakeHome),
        "a project-scope removal must not rewrite the global agents",
      ).toStrictEqual(globalAgentsBefore);
      expect(
        await listFiles(skillsPath(fakeHome)),
        "a project-scope removal must not uninstall the global copy of the skill",
      ).toStrictEqual(globalSkillsBefore);
      expect(
        await readTreeSnapshot(globalSkillDir),
        "a project-scope removal must not write over the global copy of the skill",
      ).toStrictEqual(globalSkillBefore);

      // The project's unions were regenerated; the global type surface must be byte-identical.
      const projectSourceFolder = path.dirname(configTypesTsPath(projectDir));
      const projectTypecheck = await typecheckGeneratedConfig(projectSourceFolder);
      expect(
        projectTypecheck.exitCode,
        `the project config must still type-check after dropping its half.\ntsc output:\n${projectTypecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const projectProbe = await probeConfigTypesNarrowing(projectSourceFolder, SCOPED_ALIASES);
      expect(
        projectProbe.exitCode,
        `a bogus literal must not type-check against the regenerated project types.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);
      // Each alias: the checks above hold while one rejects and the rest collapsed to `string`.
      expect(
        projectProbe.rejected,
        `every alias asked for must reject its bogus literal.\ntsc output:\n${projectProbe.output}`,
      ).toStrictEqual([...SCOPED_ALIASES]);
      expect(
        await readTestFile(configTypesTsPath(fakeHome)),
        "a project-scope removal must not rewrite the global config-types.ts",
      ).toBe(globalTypesBefore);
    },
  );
});
