import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  configTsPath,
  configTypesTsPath,
  directoryExists,
  listFiles,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createGlobalOnlyEnv,
  readSkillEntries,
  runEditWithFirstSkillAction,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";

/** The aliases a skill-set change regenerates, and must not collapse. */
const SCOPED_ALIASES = ["SkillId", "Category"] as const;

/**
 * The project-owned half of a persisted `[P][G]` pair is the project's to drop —
 * the ruled behaviour. The guard that refuses changes from project
 * scope covers GLOBAL-owned halves; it must not swallow the half the project
 * itself created.
 *
 * Both states are reached through the real wizard: the pair by an `s` toggle in
 * a project-scope edit, saved; the removal by a second session pressing SPACE on
 * the same row, saved. The negative half of the same guard — a `[G]`-only
 * inherited row refusing the identical keystroke — is pinned in
 * `global-skill-toggle-guard.e2e.test.ts`, which is what tells a correctly
 * scoped guard from one that has given up its whole domain.
 */

describe("project edit drops the project half of a dual-scope pair", () => {
  let env: DualScopeEnv | undefined;

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "spacebar on a persisted [P][G] row removes the project half and leaves the global install whole",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createGlobalOnlyEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;

      // Seed the pair the same way a user does: `s` on an inherited global row,
      // saved through to completion.
      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");
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

      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "space");

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

      // Surface 4. The project's skill set just changed, so its unions were
      // regenerated — and a regeneration that degraded them would leave a
      // config.ts nothing checks. The global half's type surface is asserted the
      // same way its config is: byte-identical, because nothing at that scope moved.
      const projectClaudeSrc = path.dirname(configTypesTsPath(projectDir));
      const projectTypecheck = await typecheckGeneratedConfig(projectClaudeSrc);
      expect(
        projectTypecheck.exitCode,
        `the project config must still type-check after dropping its half.\ntsc output:\n${projectTypecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const projectProbe = await probeConfigTypesNarrowing(projectClaudeSrc, SCOPED_ALIASES);
      expect(
        projectProbe.exitCode,
        `a bogus literal must not type-check against the regenerated project types.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);
      expect(
        await readTestFile(configTypesTsPath(fakeHome)),
        "a project-scope removal must not rewrite the global config-types.ts",
      ).toBe(globalTypesBefore);
    },
  );
});
