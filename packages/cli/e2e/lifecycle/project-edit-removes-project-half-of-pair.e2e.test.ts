import path from "path";
import { appendFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
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

/** A line the user adds to the project's own copy of the skill once it is installed. */
const PROJECT_COPY_EDIT_MARKER = "## Section added to the project's copy after installation";

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
 *
 * "Leaves the global install whole" is held on the global copy's files, not its
 * name. The pair is seeded by copying the global skill into the project, so the
 * two copies start byte-identical and a drop that wrote the project's copy back
 * over the global one changed no byte and no directory name — this spec compared
 * only names and stayed green while every drop did exactly that. So the project's
 * copy is edited first, and the global folder is compared as a tree snapshot,
 * whose mtimes also catch a rewrite that happens to produce the same bytes.
 *
 * `s` on the same row is the other collapse, and the one that DOES write global: it
 * folds the project's copy into the global install, edits included, so every project
 * inherits it. Both keys leave the config holding the same entry, so the edited copy is
 * what tells a fold from a drop — the drop must leave the global copy without the edit,
 * the fold must leave it with it.
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

  it(
    "s on a persisted [P][G] row folds the project's copy, edits and all, into the global install",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createGlobalOnlyEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;

      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      await appendFile(
        path.join(projectSkillDir, FILES.SKILL_MD),
        `\n\n${PROJECT_COPY_EDIT_MARKER}\n`,
      );
      expect(
        await readTestFile(path.join(globalSkillDir, FILES.SKILL_MD)),
        "the global copy must lack the project's edit before the fold, or carrying it is vacuous",
      ).not.toContain(PROJECT_COPY_EDIT_MARKER);
      const projectCopy = await readTestFile(path.join(projectSkillDir, FILES.SKILL_MD));

      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");

      expect(
        await readTestFile(path.join(globalSkillDir, FILES.SKILL_MD)),
        "the fold moves the project's copy into the global install, which every project reads",
      ).toBe(projectCopy);
      expect(
        await directoryExists(projectSkillDir),
        "the folded project copy is moved, not left behind",
      ).toBe(false);
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "the project now inherits the folded global entry",
      ).toStrictEqual([{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }]);
      expect(
        await readSkillEntries(fakeHome, E2E_SKILL.react.id),
        "the global install keeps its mode, since the folded copy was Local too",
      ).toStrictEqual([{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }]);
    },
  );
});
