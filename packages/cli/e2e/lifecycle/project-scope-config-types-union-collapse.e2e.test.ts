import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  finishWizard,
  readAllSkillEntries,
} from "../fixtures/dual-scope-helpers.js";
import { TS_NOT_ASSIGNABLE, probeConfigTypesNarrowing } from "../helpers/type-check-probe.js";

/**
 * A project-scope install must not disable type checking of config.ts.
 *
 * `writeScopedFromWizard` splits the merged config by scope. When every selected
 * skill is project-scoped the GLOBAL partition comes out with `skills: []`, and
 * that empty partition is still handed to `writeGlobalPair` ->
 * `generateConfigTypesSource`. Its union formatters return the literal `"string"`
 * for an empty member list, so the global `config-types.ts` is emitted as
 * `export type SkillId = string`. The project's own types then extend those
 * aliases (`SkillId = GlobalSkillId | "web-framework-react"`), and a union with
 * `string` in it absorbs every literal — so the project's config.ts silently
 * loses all type safety.
 *
 * The sibling writer for the same empty state
 * (`generateBlankGlobalConfigTypesSource` in config-writer.ts) emits `never`, so
 * the two writers disagree about what an empty install means.
 *
 * These specs assert the property the generated aliases exist for rather than
 * the text they are printed as: a skill id / category that is not installed must
 * be a type error. The project-scope spec fails on current main; the
 * global-scope spec is the control and passes.
 */

/**
 * Aliases that collapse when the global partition is empty. `AgentName` and
 * `Domain` survive this particular flow because agents default to global scope
 * and `config.domains` is carried through independently — they are excluded so
 * a failure here can only mean the skill/category unions degraded.
 */
const SKILL_SCOPED_ALIASES = ["SkillId", "Category"] as const;

/**
 * The probe takes the NAMES of the aliases to import and supplies its own bogus literal, so a
 * literal handed over in their place is a compile error rather than a passing run. The two are
 * indistinguishable at runtime and not at all in what they prove: a skill id renders
 * `import type { web-framework-react }`, which tsc rejects as a SYNTAX error, so the exit code
 * is non-zero for a reason that has nothing to do with narrowing — and the collapse this file
 * exists to catch produces exactly the same non-zero exit. Pinned against the parameter itself
 * rather than the alias union's name: widening it back to `readonly string[]` must fail here.
 */
const _aLiteralIsNotAnAliasName: Parameters<typeof probeConfigTypesNarrowing>[1] = [
  // @ts-expect-error a skill id is a MEMBER of SkillId, never the name of an alias to import
  E2E_SKILL.react.id,
];

/** Everything an eject-mode install writes into a `.claude-src/` directory. */
const INSTALLED_CLAUDE_SRC_ENTRIES = ["config-types.ts", "config.ts"];

/** `source` recorded for skills installed from a local source via `setAllLocal`. */
const EJECT_SOURCE = "eject";

/** Emitted alias text that means "this union accepts anything". */
const COLLAPSED_SKILL_ID = "export type SkillId = string;";
const COLLAPSED_CATEGORY = "export type Category = string;";

/**
 * Fresh init in a PROJECT directory with no prior global install, selecting a
 * single skill from the scratch flow so the scope of that one skill decides
 * whether the global partition ends up empty.
 *
 * `skillScope: "project"` toggles react to project scope, leaving the global
 * partition with zero skills — the state that triggers the collapse.
 * `skillScope: "global"` leaves it at its default global scope, so the global
 * partition has one skill and the unions are built normally.
 */
async function initSingleSkillProject(options: {
  sourceDir: string;
  sourceTempDir: string;
  fakeHome: string;
  projectDir: string;
  skillScope: "project" | "global";
}): Promise<{ exitCode: number; output: string }> {
  const wizard = await InitWizard.launch({
    source: { sourceDir: options.sourceDir, tempDir: options.sourceTempDir },
    projectDir: options.projectDir,
    env: { HOME: options.fakeHome },
    ...TERMINAL_SIZE.TALL,
  });

  try {
    const domain = await wizard.stack.selectScratch();
    // Keep only Web so the install has exactly one category to narrow.
    await domain.toggleDomain(STEP_TEXT.DOMAIN_API);
    await domain.toggleDomain(STEP_TEXT.DOMAIN_MOBILE);
    const build = await domain.advance();

    await build.selectSkill(E2E_SKILL.react.display);
    if (options.skillScope === "project") {
      // selectSkill already left focus on react — a second focusSkill would wrap
      // onto the first-alphabetical cell (Vue), so toggle the already-focused react.
      await build.toggleScopeOnFocusedSkill();
    }

    const sources = await build.advanceToSources();
    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults("init");
    return await finishWizard(await confirm.confirm());
  } catch (e) {
    await wizard.destroy();
    throw e;
  }
}

describe("generated config types keep narrowing after a project-scope install", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "rejects an uninstalled skill id when the only skill is project-scoped",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const install = await initSingleSkillProject({
        sourceDir,
        sourceTempDir,
        fakeHome,
        projectDir,
        skillScope: "project",
      });
      expect(install.exitCode, `Project-scope init failed: ${install.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Config side: react is the project's only skill and it is project-scoped,
      // and the global config carries no skills at all. This is the precondition
      // that makes the empty-union path fire — without it the assertions below
      // would pass vacuously against a normally-built union.
      const projectSkills = await readAllSkillEntries(projectDir);
      expect(projectSkills, "project config.ts must record react at project scope").toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "project", origin: EJECT_SOURCE },
      ]);
      expect(
        await readAllSkillEntries(fakeHome),
        "global config.ts must carry no skills after an all-project-scope install",
      ).toStrictEqual([]);

      // Filesystem side: the skill really is installed under the project and not
      // under the home scope.
      expect(
        await listFiles(skillsPath(projectDir)),
        "react must be copied into the project skills dir",
      ).toStrictEqual([E2E_SKILL.react.id]);
      expect(
        await listFiles(skillsPath(fakeHome)),
        "no skill may be copied into the global skills dir",
      ).toStrictEqual([]);

      const globalTypesPath = configTypesTsPath(fakeHome);
      const projectTypesPath = configTypesTsPath(projectDir);
      expect(await fileExists(globalTypesPath), "global config-types.ts must be written").toBe(
        true,
      );
      expect(await fileExists(projectTypesPath), "project config-types.ts must be written").toBe(
        true,
      );

      // The invariant those aliases exist for: an id that is not installed must
      // be a type error in the project's config.ts.
      const projectProbe = await probeConfigTypesNarrowing(
        path.dirname(projectTypesPath),
        SKILL_SCOPED_ALIASES,
      );
      expect(
        projectProbe.exitCode,
        `A bogus SkillId/Category literal must not type-check against the project's config-types.ts.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);

      // Same invariant at the scope the collapse originates from: a global config
      // with zero installed skills must reject every skill id, not accept all.
      const globalProbe = await probeConfigTypesNarrowing(
        path.dirname(globalTypesPath),
        SKILL_SCOPED_ALIASES,
      );
      expect(
        globalProbe.exitCode,
        `A bogus SkillId/Category literal must not type-check against the global config-types.ts.\ntsc output:\n${globalProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(globalProbe.output).toContain(TS_NOT_ASSIGNABLE);

      // Secondary, on the emitted text: pins the exact defect signature so the
      // failure names the mechanism, not just the symptom.
      const globalTypes = await readTestFile(globalTypesPath);
      expect(globalTypes, "generated SkillId must not degrade to `string`").not.toContain(
        COLLAPSED_SKILL_ID,
      );
      expect(globalTypes, "generated Category must not degrade to `string`").not.toContain(
        COLLAPSED_CATEGORY,
      );
    },
  );

  it(
    "rejects an uninstalled skill id when the only skill is global-scoped",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const install = await initSingleSkillProject({
        sourceDir,
        sourceTempDir,
        fakeHome,
        projectDir,
        skillScope: "global",
      });
      expect(install.exitCode, `Global-scope init failed: ${install.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Config side: the mirror image of the spec above — react lands in the
      // global partition, so the global unions are built from a non-empty list.
      expect(
        await readAllSkillEntries(fakeHome),
        "global config.ts must record react at global scope",
      ).toStrictEqual([{ id: E2E_SKILL.react.id, scope: "global", origin: EJECT_SOURCE }]);

      // Filesystem side.
      expect(
        await listFiles(skillsPath(fakeHome)),
        "react must be copied into the global skills dir",
      ).toStrictEqual([E2E_SKILL.react.id]);

      const globalTypesPath = configTypesTsPath(fakeHome);
      const projectTypesPath = configTypesTsPath(projectDir);
      expect(await fileExists(globalTypesPath), "global config-types.ts must be written").toBe(
        true,
      );
      expect(await fileExists(projectTypesPath), "project config-types.ts must be written").toBe(
        true,
      );

      const globalProbe = await probeConfigTypesNarrowing(
        path.dirname(globalTypesPath),
        SKILL_SCOPED_ALIASES,
      );
      expect(
        globalProbe.exitCode,
        `A bogus SkillId/Category literal must not type-check against the global config-types.ts.\ntsc output:\n${globalProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(globalProbe.output).toContain(TS_NOT_ASSIGNABLE);

      const projectProbe = await probeConfigTypesNarrowing(
        path.dirname(projectTypesPath),
        SKILL_SCOPED_ALIASES,
      );
      expect(
        projectProbe.exitCode,
        `A bogus SkillId/Category literal must not type-check against the project's config-types.ts.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);

      // Filesystem side: probing is a read-only act. Both .claude-src trees must
      // be exactly what the install wrote, with no probe artifact left behind.
      expect(
        await listFiles(path.dirname(projectTypesPath)),
        "probing must leave the project .claude-src tree untouched",
      ).toStrictEqual(INSTALLED_CLAUDE_SRC_ENTRIES);
      expect(
        await listFiles(path.dirname(globalTypesPath)),
        "probing must leave the global .claude-src tree untouched",
      ).toStrictEqual(INSTALLED_CLAUDE_SRC_ENTRIES);
    },
  );
});
