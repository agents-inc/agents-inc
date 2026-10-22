import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { EJECT_SOURCE_NAME, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  fileExists,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readAllSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { TS_NOT_ASSIGNABLE, probeConfigTypesNarrowing } from "../helpers/type-check-probe.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * An empty global partition must not emit `SkillId = string`, which the project's extending union
 * would absorb everything into. The global-scope spec is the control.
 */

/** `AgentName` and `Domain` survive this flow, so a failure can only mean these degraded. */
const SKILL_SCOPED_ALIASES = ["SkillId", "Category"] as const;

/**
 * The probe takes alias NAMES: a skill id there renders invalid syntax, a non-zero exit
 * indistinguishable from the collapse. Pinned so widening the parameter to `string[]` fails here.
 */
const _aLiteralIsNotAnAliasName: Parameters<typeof probeConfigTypesNarrowing>[1] = [
  // @ts-expect-error a skill id is a member of SkillId, not an alias name
  E2E_SKILL.react.id,
];

const INSTALLED_SOURCE_FOLDER_ENTRIES = ["config-types.ts", "config.ts"];

const COLLAPSED_SKILL_ID = "export type SkillId = string;";
const COLLAPSED_CATEGORY = "export type Category = string;";

const WEB_DEV = E2E_AGENT["web-developer"].name;

/**
 * `skillScope: "project"` leaves the global partition empty (the collapse trigger); `"global"`
 * builds the unions normally.
 */
async function initSingleSkillProject(
  store: SeedConfigStore,
  options: { fakeHome: string; projectDir: string; skillScope: "project" | "global" },
): Promise<{ exitCode: number; output: string }> {
  const inProject = options.skillScope === "project";
  return installFromSeed(
    store,
    `OneSkill${options.skillScope}`,
    buildSeedPayload({
      skills: {
        [E2E_SKILL.react.id]: buildSeedSkill({
          install: "eject",
          scope: options.skillScope,
          assignments: inProject ? {} : { [WEB_DEV]: "preloaded" },
        }),
      },
      agents: { [WEB_DEV]: { on: true, scope: "global" } },
    }),
    { dir: options.projectDir, home: options.fakeHome },
  );
}

describe("generated config types keep narrowing after a project-scope install", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

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

      const install = await initSingleSkillProject(store, {
        fakeHome,
        projectDir,
        skillScope: "project",
      });
      expect(install.exitCode, `Project-scope init failed: ${install.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Precondition: no global skills at all, or the assertions below pass vacuously.
      const projectSkills = await readAllSkillEntries(projectDir);
      expect(projectSkills, "project config.ts must record react at project scope").toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "project", origin: EJECT_SOURCE_NAME },
      ]);
      expect(
        await readAllSkillEntries(fakeHome),
        "global config.ts must carry no skills after an all-project-scope install",
      ).toStrictEqual([]);

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

      const projectProbe = await probeConfigTypesNarrowing(
        path.dirname(projectTypesPath),
        SKILL_SCOPED_ALIASES,
      );
      expect(
        projectProbe.exitCode,
        `A bogus SkillId/Category literal must not type-check against the project's config-types.ts.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);
      // Each alias: the checks above hold while one rejects and the rest collapsed to `string`.
      expect(
        projectProbe.rejected,
        `every alias asked for must reject its bogus literal.\ntsc output:\n${projectProbe.output}`,
      ).toStrictEqual([...SKILL_SCOPED_ALIASES]);

      const globalProbe = await probeConfigTypesNarrowing(
        path.dirname(globalTypesPath),
        SKILL_SCOPED_ALIASES,
      );
      expect(
        globalProbe.exitCode,
        `A bogus SkillId/Category literal must not type-check against the global config-types.ts.\ntsc output:\n${globalProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(globalProbe.output).toContain(TS_NOT_ASSIGNABLE);
      expect(
        globalProbe.rejected,
        `every alias asked for must reject its bogus literal.\ntsc output:\n${globalProbe.output}`,
      ).toStrictEqual([...SKILL_SCOPED_ALIASES]);

      // Names the mechanism, not just the symptom.
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

      const install = await initSingleSkillProject(store, {
        fakeHome,
        projectDir,
        skillScope: "global",
      });
      expect(install.exitCode, `Global-scope init failed: ${install.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      expect(
        await readAllSkillEntries(fakeHome),
        "global config.ts must record react at global scope",
      ).toStrictEqual([{ id: E2E_SKILL.react.id, scope: "global", origin: EJECT_SOURCE_NAME }]);

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
      expect(
        globalProbe.rejected,
        `every alias asked for must reject its bogus literal.\ntsc output:\n${globalProbe.output}`,
      ).toStrictEqual([...SKILL_SCOPED_ALIASES]);

      const projectProbe = await probeConfigTypesNarrowing(
        path.dirname(projectTypesPath),
        SKILL_SCOPED_ALIASES,
      );
      expect(
        projectProbe.exitCode,
        `A bogus SkillId/Category literal must not type-check against the project's config-types.ts.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);
      expect(
        projectProbe.rejected,
        `every alias asked for must reject its bogus literal.\ntsc output:\n${projectProbe.output}`,
      ).toStrictEqual([...SKILL_SCOPED_ALIASES]);

      expect(
        await listFiles(path.dirname(projectTypesPath)),
        "probing must leave the project source-folder tree untouched",
      ).toStrictEqual(INSTALLED_SOURCE_FOLDER_ENTRIES);
      expect(
        await listFiles(path.dirname(globalTypesPath)),
        "probing must leave the global source-folder tree untouched",
      ).toStrictEqual(INSTALLED_SOURCE_FOLDER_ENTRIES);
    },
  );
});
