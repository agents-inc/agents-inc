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

/** The aliases a skill-set change regenerates, and must not collapse. */
const SCOPED_ALIASES = ["SkillId", "Category"] as const;

/** A line the user adds to the project's own copy of the skill once it is installed. */
const PROJECT_COPY_EDIT_MARKER = "## Section added to the project's copy after installation";

/**
 * The project-owned half of a persisted `[P][G]` pair is the project's to drop —
 * the ruled behaviour. The guard that refuses changes from project
 * scope covers GLOBAL-owned halves; it must not swallow the half the project
 * itself created.
 *
 * The pair is set up by `init --from` with React in the project over a global
 * install of it; the removal by `edit --from` naming React at global scope only.
 *
 * "Leaves the global install whole" is held on the global copy's files, not its
 * name. The pair is seeded by copying the global skill into the project, so the
 * two copies start byte-identical and a drop that wrote the project's copy back
 * over the global one changed no byte and no directory name — this spec compared
 * only names and stayed green while every drop did exactly that. So the project's
 * copy is edited first, and the global folder is compared as a tree snapshot,
 * whose mtimes also catch a rewrite that happens to produce the same bytes.
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

      // The pair: React in the project over the global install of it. A project skill never
      // reaches the global web-developer, so the project's React is assigned to no sub-agent.
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

      // Surface 4. The project's skill set just changed, so its unions were
      // regenerated — and a regeneration that degraded them would leave a
      // config.ts nothing checks. The global half's type surface is asserted the
      // same way its config is: byte-identical, because nothing at that scope moved.
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
      // EACH alias, not any: the two above hold while one alias rejects and the others have
      // collapsed to `string`.
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
