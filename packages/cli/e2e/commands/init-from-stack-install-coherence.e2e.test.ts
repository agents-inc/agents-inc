import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  E2E_AGENT,
  E2E_SKILL,
  E2E_STACK_AGENTS,
  E2E_STACK_DESCRIPTION,
  E2E_STACK_ID,
  E2E_STACK_SKILL_IDS,
} from "../fixtures/expected-values.js";
import {
  createTestEnvironment,
  readActiveAgentNames,
  readAllSkillEntries,
  readConfigSkillIds,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  fileExists,
  loadConfigOrFail,
  readCompiledAgents,
  skillsPath,
  listFiles,
} from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

/**
 * A stack install lands its declared roster and leaves a config pair that type-checks, asserted on
 * four surfaces. The pair is checked at both scopes, since a permissive global half absorbs the
 * project's aliases.
 */

/** Each alias must reject a bogus literal; one collapsed to `string` emits no diagnostic. */
const STACK_DERIVED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

const INSTALLED_SOURCE_FOLDER_ENTRIES = ["config-types.ts", "config.ts"];

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const STACKED_ID = "StackCo1";
const onBoth = { [WEB_DEV]: "lazy", [API_DEV]: "lazy" } as const;

describe("init --from — a stack install lands its roster and type-checks", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    // The web app always sends the expansion: `stackId` is metadata, `assignments` the data.
    store.publish(
      STACKED_ID,
      buildSeedPayload({
        stackId: E2E_STACK_ID,
        skills: {
          [E2E_SKILL.react.id]: ejectedGlobalSkill(),
          [E2E_SKILL.vitest.id]: ejectedGlobalSkill(),
          [E2E_SKILL.zustand.id]: ejectedGlobalSkill(),
          [E2E_SKILL.reviewing.id]: ejectedGlobalSkill({ assignments: onBoth }),
          [E2E_SKILL["cli-reviewing"].id]: ejectedGlobalSkill(),
          [E2E_SKILL["research-methodology"].id]: ejectedGlobalSkill({ assignments: onBoth }),
          [E2E_SKILL.hono.id]: ejectedGlobalSkill({ assignments: { [API_DEV]: "lazy" } }),
        },
        agents: {
          [WEB_DEV]: { on: true, scope: "global" },
          [API_DEV]: { on: true, scope: "global" },
        },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "installs the stack's declared skills and agents, and the generated config pair still narrows",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const { fakeHome: globalHome, projectDir } = env;
      const result = await runInitFrom(
        store,
        STACKED_ID,
        { dir: projectDir, globalHome },
        source.sourceDir,
      );
      expect(result.exitCode, `init failed:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);

      expect((await loadConfigOrFail(projectDir)).description).toBe(E2E_STACK_DESCRIPTION);

      // Default scope is global, so the skills land in the global partition.
      expect(
        await readActiveAgentNames(projectDir),
        "the project config must name exactly the sub-agents the stack declares",
      ).toStrictEqual(E2E_STACK_AGENTS);
      expect(
        [...new Set(await readConfigSkillIds(projectDir))].sort(),
        "the project config must carry exactly the skills the stack assigns",
      ).toStrictEqual(E2E_STACK_SKILL_IDS);
      expect(
        [...new Set((await readAllSkillEntries(globalHome)).map((entry) => entry.id))].sort(),
        "the global config must carry exactly the skills the stack assigns",
      ).toStrictEqual(E2E_STACK_SKILL_IDS);

      const compiled = await readCompiledAgents(globalHome);
      expect(
        Object.keys(compiled).sort(),
        "the compiled agents must be exactly the stack's declared roster",
      ).toStrictEqual(E2E_STACK_AGENTS.map((name) => `${name}.md`));
      for (const agentName of E2E_STACK_AGENTS) {
        await expect({ dir: globalHome }).toHaveAgentFrontmatter(agentName, { name: agentName });
      }
      expect(
        (await listFiles(skillsPath(globalHome))).sort(),
        "every skill the stack assigns must be ejected onto disk",
      ).toStrictEqual(E2E_STACK_SKILL_IDS);

      // The config the CLI just wrote must accept itself.
      const globalSourceFolder = path.dirname(configTypesTsPath(globalHome));
      const projectSourceFolder = path.dirname(configTypesTsPath(projectDir));
      expect(await fileExists(configTypesTsPath(globalHome))).toBe(true);
      expect(await fileExists(configTypesTsPath(projectDir))).toBe(true);

      const globalTypecheck = await typecheckGeneratedConfig(globalSourceFolder);
      expect(
        globalTypecheck.exitCode,
        `the global config.ts must type-check against its own config-types.ts.\ntsc output:\n${globalTypecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const projectTypecheck = await typecheckGeneratedConfig(projectSourceFolder);
      expect(
        projectTypecheck.exitCode,
        `the project config.ts must type-check against its own config-types.ts.\ntsc output:\n${projectTypecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      // A value not installed must still be a type error.
      const globalProbe = await probeConfigTypesNarrowing(
        globalSourceFolder,
        STACK_DERIVED_ALIASES,
      );
      expect(
        globalProbe.exitCode,
        `a bogus literal must not type-check against the global config-types.ts.\ntsc output:\n${globalProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(globalProbe.output).toContain(TS_NOT_ASSIGNABLE);
      // Each alias, not any: one rejecting while others collapse to `string` is the degradation
      // caught here.
      expect(
        globalProbe.rejected,
        `every stack-derived alias must reject its bogus literal in the global config-types.ts.\ntsc output:\n${globalProbe.output}`,
      ).toStrictEqual([...STACK_DERIVED_ALIASES]);

      const projectProbe = await probeConfigTypesNarrowing(
        projectSourceFolder,
        STACK_DERIVED_ALIASES,
      );
      expect(
        projectProbe.exitCode,
        `a bogus literal must not type-check against the project config-types.ts.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);
      expect(
        projectProbe.rejected,
        `every stack-derived alias must reject its bogus literal in the project config-types.ts.\ntsc output:\n${projectProbe.output}`,
      ).toStrictEqual([...STACK_DERIVED_ALIASES]);

      // Probing writes and removes a file, so both trees must be as the install left them.
      expect(
        (await listFiles(globalSourceFolder)).sort(),
        "probing must leave the global source folder untouched",
      ).toStrictEqual(INSTALLED_SOURCE_FOLDER_ENTRIES);
      expect(
        (await listFiles(projectSourceFolder)).sort(),
        "probing must leave the project source folder untouched",
      ).toStrictEqual(INSTALLED_SOURCE_FOLDER_ENTRIES);
    },
  );
});
