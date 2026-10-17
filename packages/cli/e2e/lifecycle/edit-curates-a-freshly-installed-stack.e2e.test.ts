import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import { readConfigSkillIds } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL, E2E_STACK_SKILL_IDS } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  createPermissionsFile,
  createTempDir,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { buildSeedSkill } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { readGeneratedUnion } from "../../src/cli/lib/__tests__/helpers/generated-types.js";

/**
 * Journey 9 from an empty tree: a stack installed by `init --from`, then curated by `edit --from`
 * dropping the stack's `web-testing` pick and adding the spare in the same category, so the
 * category's stack entry must name only the added skill.
 */

const DESELECTED_STACK_SKILL = E2E_SKILL.vitest;

const SELECTED_NON_STACK_SKILL = E2E_SKILL["visual-regression"];

const CURATED_AGENT = E2E_AGENT["web-developer"];

const CURATED_CATEGORY = "web-testing";

const INSTALLED_SKILL_IDS = [...E2E_STACK_SKILL_IDS].sort();

const CURATED_SKILL_IDS = [
  ...E2E_STACK_SKILL_IDS.filter((id) => id !== DESELECTED_STACK_SKILL.id),
  SELECTED_NON_STACK_SKILL.id,
].sort();

const SKILL_ID_ALIAS = "SkillId";

const STACK_PAYLOAD = e2eStackPayload({ scope: "global" });
const STACK_ID = "Curate01";

const CURATED_ID = "Curate02";
const CURATED_BASE = e2eStackPayload({ scope: "global", without: [DESELECTED_STACK_SKILL.id] });
const CURATED_PAYLOAD = {
  ...CURATED_BASE,
  skills: {
    ...CURATED_BASE.skills,
    [SELECTED_NON_STACK_SKILL.id]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [CURATED_AGENT.name]: "lazy" },
    }),
  },
};

describe("an installed stack's picks are curated by a later edit, from nothing", () => {
  let store: SeedConfigStore;
  let globalHome: string;

  let installedSkillIds: string[];
  let installedSkillDirs: string[];
  let curatedSkillIds: string[];
  let curatedSkillDirs: string[];
  let curatedStackEntry: unknown;
  let compiledAgentBody: string;
  let generatedSkillIdUnion: string | undefined;
  let editExitCode: number;
  let editOutput: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(STACK_ID, STACK_PAYLOAD);
    store.publish(CURATED_ID, CURATED_PAYLOAD);
    globalHome = await createTempDir();
    await createPermissionsFile(globalHome);

    const install = await runInitFrom(store, STACK_ID, { dir: globalHome }, E2E_SOURCE.sourceDir);
    expect(install.exitCode, `stack install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

    installedSkillIds = (await readConfigSkillIds(globalHome)).slice().sort();
    installedSkillDirs = await listFiles(skillsPath(globalHome));

    ({ exitCode: editExitCode, output: editOutput } = await applyEditFrom(store, CURATED_ID, {
      dir: globalHome,
    }));

    const curated = await loadConfigOrFail(globalHome);
    curatedSkillIds = curated.skills.map((skill) => skill.id).sort();
    curatedStackEntry = curated.stack?.[CURATED_AGENT.name]?.[CURATED_CATEGORY];
    curatedSkillDirs = await listFiles(skillsPath(globalHome));

    // Asserting lookup: an absent file read as empty would satisfy the negative below.
    const compiled = (await readCompiledAgents(globalHome))[`${CURATED_AGENT.name}.md`];
    if (compiled === undefined) {
      throw new Error(`no compiled ${CURATED_AGENT.name}.md at ${globalHome}`);
    }
    compiledAgentBody = compiled;

    generatedSkillIdUnion = readGeneratedUnion(
      await readTestFile(configTypesTsPath(globalHome)),
      SKILL_ID_ALIAS,
    );
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (globalHome) await cleanupTempDir(globalHome);
  });

  // Subject guard: otherwise the curation is a no-op every after-assertion holds for.
  it("installs exactly the stack's own skills, spare excluded", () => {
    expect(
      installedSkillIds,
      "the install must write the stack's roster and nothing else",
    ).toStrictEqual(INSTALLED_SKILL_IDS);
    expect(
      installedSkillDirs,
      "the ejected skill directories must match the roster the config records",
    ).toStrictEqual(INSTALLED_SKILL_IDS);
  });

  it("completes the curating edit successfully", () => {
    expect(editExitCode, `the curating edit must succeed: ${editOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  it("swaps the dropped stack skill for the added non-stack one in config.ts", () => {
    expect(
      curatedSkillIds,
      "the curated roster must be the stack's, less its pick, plus the spare",
    ).toStrictEqual(CURATED_SKILL_IDS);
  });

  // Both skills share a category, so the entry must name the added skill alone.
  it("rewrites the curated category's stack entry to name only the added skill", () => {
    expect(
      curatedStackEntry,
      `${CURATED_AGENT.name}'s ${CURATED_CATEGORY} stack entry must name only the added skill`,
    ).toStrictEqual([{ id: SELECTED_NON_STACK_SKILL.id, preloaded: false }]);
  });

  it("moves the ejected skill directories with the curation", () => {
    expect(
      curatedSkillDirs,
      "the dropped skill's directory must be gone and the added one's present",
    ).toStrictEqual(CURATED_SKILL_IDS);
  });

  it("recompiles the sub-agent onto the added skill", () => {
    expect(compiledAgentBody, "the compiled sub-agent must reference the added skill").toContain(
      SELECTED_NON_STACK_SKILL.id,
    );
    expect(
      compiledAgentBody,
      "the compiled sub-agent must no longer reference the dropped skill",
    ).not.toContain(DESELECTED_STACK_SKILL.id);
  });

  // Read off the alias: the dropped id also appears in comments and the sibling `config.ts`.
  it("regenerates the SkillId union around the curated roster", () => {
    expect(generatedSkillIdUnion, `config-types.ts must declare a ${SKILL_ID_ALIAS}`).toBeDefined();
    expect(generatedSkillIdUnion, `${SKILL_ID_ALIAS} must name the added skill`).toContain(
      SELECTED_NON_STACK_SKILL.id,
    );
    expect(
      generatedSkillIdUnion,
      `${SKILL_ID_ALIAS} must not name the dropped skill`,
    ).not.toContain(DESELECTED_STACK_SKILL.id);
  });

  it("holds all four surfaces at the curated scope", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    await expectFourSurfaces(globalHome);
  });
});
