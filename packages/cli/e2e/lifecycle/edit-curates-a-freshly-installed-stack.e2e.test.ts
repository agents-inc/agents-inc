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
 * Journey 9 — "a stack's picks are editable" — driven from an empty tree, which
 * none of its three existing specs can do: each opens from a config a fixture
 * wrote (`ProjectBuilder.editable`, or `buildProjectConfig` +
 * `writeProjectConfig`), so what they curate is a stack nothing installed.
 *
 * Here the stack arrives the way a user's does — a configuration naming it,
 * installed by a real `init --from` — and is then curated by a real `edit --from`
 * of the configuration the editor hands back, in one pass that does both halves
 * the journey names:
 *
 *   - DROP a skill the stack chose (`web-testing-vitest`, the stack's own pick
 *     for the `web-testing` category).
 *   - ADD one the stack did not (`web-testing-visual-regression`, the fixture's
 *     spare: it is assigned to no agent by the stack, so adding it is a genuine
 *     addition rather than a re-selection).
 *
 * Both land in the same category, so the stack entry the curation leaves behind
 * is the discriminating one — a `web-testing` list still naming vitest, or
 * naming both, is the defect this exists to catch, and neither is visible in a
 * skill roster alone.
 *
 * The expected roster is derived from `E2E_STACK_SKILL_IDS` — the stack object's
 * own assignments — rather than from a second hand-written list, so a stack that
 * gains or loses a skill cannot leave this spec agreeing with itself.
 */

/** The stack's own pick for `web-testing`, dropped by the edit. */
const DESELECTED_STACK_SKILL = E2E_SKILL.vitest;

/** The fixture's spare, in the same category, added by the same edit. */
const SELECTED_NON_STACK_SKILL = E2E_SKILL["visual-regression"];

/** The sub-agent whose `web-testing` assignment both halves of the curation move. */
const CURATED_AGENT = E2E_AGENT["web-developer"];

const CURATED_CATEGORY = "web-testing";

/** The skill roster the install writes: exactly what the stack assigns. */
const INSTALLED_SKILL_IDS = [...E2E_STACK_SKILL_IDS].sort();

/** The roster after the curation: the stack's, less its pick, plus the spare. */
const CURATED_SKILL_IDS = [
  ...E2E_STACK_SKILL_IDS.filter((id) => id !== DESELECTED_STACK_SKILL.id),
  SELECTED_NON_STACK_SKILL.id,
].sort();

const SKILL_ID_ALIAS = "SkillId";

/** The stack, ejected into the global installation. */
const STACK_PAYLOAD = e2eStackPayload({ scope: "global" });
const STACK_ID = "Curate01";

/** The stack as the editor hands it back curated: its `web-testing` pick swapped for the spare. */
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

    // Phase A — install the stack, eject mode.
    const install = await runInitFrom(store, STACK_ID, { dir: globalHome }, E2E_SOURCE.sourceDir);
    expect(install.exitCode, `stack install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

    installedSkillIds = (await readConfigSkillIds(globalHome)).slice().sort();
    installedSkillDirs = await listFiles(skillsPath(globalHome));

    // Phase B — curate that stack: drop its `web-testing` pick, add the spare.
    ({ exitCode: editExitCode, output: editOutput } = await applyEditFrom(store, CURATED_ID, {
      dir: globalHome,
    }));

    const curated = await loadConfigOrFail(globalHome);
    curatedSkillIds = curated.skills.map((skill) => skill.id).sort();
    curatedStackEntry = curated.stack?.[CURATED_AGENT.name]?.[CURATED_CATEGORY];
    curatedSkillDirs = await listFiles(skillsPath(globalHome));

    // An asserting lookup, not a default: an absent compiled file read as an empty body would
    // satisfy the "no longer references the dropped skill" negative below for free.
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

  // The subject guard for everything below: the skill the edit drops must have been
  // installed by the stack, and the one it adds must NOT have been — otherwise the
  // curation is a no-op that every after-assertion would hold for.
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

  // The half a roster cannot show. Both skills share a category, so the entry must name the
  // added skill ALONE — a list still holding vitest, or holding both, passes every roster
  // assertion above while the sub-agent goes on loading a skill the config no longer carries.
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

  // Surface 4, the one this journey's three variants leave unasserted. Read off the emitted
  // alias rather than the whole file: the dropped id also appears in comments and in the
  // sibling `config.ts`, so a whole-file negative would be answering a different question.
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
