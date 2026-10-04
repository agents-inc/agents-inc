import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  E2E_AGENT,
  E2E_SKILL,
  E2E_STACK_AGENTS,
  E2E_STACK_DISPLAY,
  E2E_STACK_SKILL_IDS,
} from "../fixtures/expected-values.js";
import { readConfigSkillIds } from "../fixtures/dual-scope-helpers.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  completeWithLocalSources,
  configTypesTsPath,
  listFiles,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * What a user is told when the marketplace they chose ships a stack naming a skill that
 * marketplace's own catalogue does not carry — and whether what they are told is true.
 *
 * The load leaves the skill out of the stack, and the stack's own sentence says so: "Left out of
 * the stack — selecting it would install nothing." It must be the only thing said about that id.
 * A second line for the same skill — "not found in matrix. It may be a custom or local skill" —
 * contradicts it: a stack is resolved against its marketplace before any local skill is merged,
 * so no custom or local copy stands in, and this run has none to offer. That line also arrives
 * FIRST, so on a terminal short enough to give the startup band one row it takes the row, and the
 * true sentence is counted away under "... and 1 more".
 *
 * Which assertion carries the red against the defect: at `TERMINAL_SIZE.SHORT` the positive one,
 * because the sentence is evicted; at `TALL` the negative one, because both lines fit and the
 * contradiction is painted in full. Each negative has its positive subject guard — the sentence
 * itself — in the same frame, so an absence there is never a band that painted nothing.
 *
 * The third case is the half a frame cannot show: the generated files, which are what decide
 * which of the two lines was honest. The fourth is the subject guard for the whole file — the
 * same launch against a marketplace carrying every skill its stack names says neither line, so the
 * sentence above is attributable to the missing skill rather than to the stack step itself.
 */

/** The skill the marketplace under test does not ship and its stack still names. */
const NOT_CARRIED = E2E_SKILL.zustand.id;

/** Everything the stack names that the marketplace does ship — what selecting it installs. */
const CARRIED_STACK_SKILL_IDS = E2E_STACK_SKILL_IDS.filter((id) => id !== NOT_CARRIED);

/** The sub-agent whose stack entry named the missing skill, and a sibling skill it still gets. */
const NAMING_AGENT = E2E_AGENT["web-developer"].name;
const CARRIED_SIBLING = E2E_SKILL.vitest.id;

describe("a marketplace stack naming a skill its own catalogue does not carry", () => {
  let source: E2ESource;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    source = await createE2ESource({ withoutSkills: [NOT_CARRIED] });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "spends the band's only row on the sentence saying the skill was left out",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launchInProject({ source, ...TERMINAL_SIZE.SHORT });

      const screen = wizard.getScreen();
      expect(
        screen,
        "the one row must go to the line that says what happened to the skill",
      ).toContain(STEP_TEXT.STACK_SKILL_LEFT_OUT);
      expect(screen, "and the band names the skill it left out").toContain(NOT_CARRIED);
      expect(
        screen,
        "no line may hold out a custom or local copy the stack never takes",
      ).not.toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "says it once when the band has rows to spare, with no line contradicting it",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launchInProject({ source, ...TERMINAL_SIZE.TALL });

      const screen = wizard.getScreen();
      expect(screen, "the stack is left out OF, not refused — its row is still offered").toContain(
        E2E_STACK_DISPLAY,
      );
      expect(screen, "the sentence saying what happened to the skill").toContain(
        STEP_TEXT.STACK_SKILL_LEFT_OUT,
      );
      expect(
        screen,
        "and nothing beside it claiming the same skill may be a custom or local one",
      ).not.toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "installs the rest of the stack and nothing under the skill it left out",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launchInProject({ source, ...TERMINAL_SIZE.TALL });
      const globalHome = wizard.globalHome;

      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode, `init failed:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      expect(
        [...new Set(await readConfigSkillIds(result.project.dir))].sort(),
        "the project config carries exactly the stack's skills the marketplace ships",
      ).toStrictEqual(CARRIED_STACK_SKILL_IDS);
      expect(
        [...new Set(await readConfigSkillIds(globalHome))].sort(),
        "and so does the global config, which is the scope the install lands in",
      ).toStrictEqual(CARRIED_STACK_SKILL_IDS);
      expect(
        (await listFiles(skillsPath(globalHome))).sort(),
        "every skill the install copied is one the marketplace ships",
      ).toStrictEqual(CARRIED_STACK_SKILL_IDS);

      expect(
        Object.keys(await readCompiledAgents(globalHome)).sort(),
        "the stack's whole roster still compiles — the skill is dropped, not the sub-agent",
      ).toStrictEqual(E2E_STACK_AGENTS.map((name) => `${name}.md`));
      await expect({ dir: globalHome }).toHaveCompiledAgentContent(NAMING_AGENT, {
        contains: [CARRIED_SIBLING],
        notContains: [NOT_CARRIED],
      });

      const configTypes = await readTestFile(configTypesTsPath(globalHome));
      expect(configTypes, "the generated union still names what was installed").toContain(
        CARRIED_SIBLING,
      );
      expect(configTypes, "and not the skill no copy of which exists").not.toContain(NOT_CARRIED);
    },
  );

  it(
    "says nothing about it when the stack names only skills the catalogue carries",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await InitWizard.launchInProject({ ...TERMINAL_SIZE.TALL });

      const screen = wizard.getScreen();
      expect(screen, "the same stack, reached the same way").toContain(E2E_STACK_DISPLAY);
      expect(screen, "nothing was left out, so nothing says so").not.toContain(
        STEP_TEXT.STACK_SKILL_LEFT_OUT,
      );
      expect(screen).not.toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
    },
  );
});
