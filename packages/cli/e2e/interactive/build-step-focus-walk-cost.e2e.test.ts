import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ensureBinaryExists, createTempDir, cleanupTempDir } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { CategoryWalkError } from "../pages/steps/build-step.js";
import { INTERNAL_RETRIES, KEYS } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";

/**
 * What `focusSkill` SPENDS, which every other spec is blind to.
 *
 * Assertions about focus all read where the cursor ended, and a walk that
 * arrives by touring the entire grid satisfies every one of them. That blind
 * spot is what shipped a flake: against the default catalogue the web domain
 * paints 33 categories, `focusSkill` pressed Tab before it ever looked at the
 * screen, and its target sat in the FIRST category — the one already focused
 * on entry. So the cheapest success cost a full 33-press lap back to where it
 * started, against a fixed 50-press budget, leaving room for one lap and no
 * more. On a contended runner a single repaint observed late let the walk pass
 * its own target unseen, and the second lap it then needed did not fit. CI run
 * 32338714325 is the failure; the re-run passed the same commit on its retry.
 *
 * Both halves of the repair are pinned here, and neither means much alone:
 * the walk must not travel when it is already standing on the answer, and when
 * the answer is nowhere it must stop after ONE lap having observed every
 * category exactly once — rather than pressing a fixed budget of keys and
 * reporting how many it pressed.
 */
describe("build step — what focusSkill spends", () => {
  let wizard: EditWizard | undefined;
  let tempHOME: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempHOME) await cleanupTempDir(tempHOME);
    tempHOME = undefined;
  });

  /**
   * The default catalogue, deliberately: the E2E source paints a handful of
   * categories, where a walk that tours everything is indistinguishable from
   * one that does not move. Thirty-three categories is what makes the cost
   * observable, and it is the configuration the flake lives in.
   */
  const launchAgainstDefaultCatalogue = async (): Promise<EditWizard> => {
    const project = await ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
      agents: ["web-developer"],
      domains: ["web"],
    });
    tempHOME = await createTempDir();
    return EditWizard.launch({
      projectDir: project.dir,
      cols: 120,
      rows: 40,
      env: { HOME: tempHOME },
    });
  };

  const tabsPressed = (keys: readonly string[]): readonly string[] =>
    keys.filter((key) => key === KEYS.TAB);

  it("presses no Tab at all when the target category is the focused one", async () => {
    wizard = await launchAgainstDefaultCatalogue();

    const before = wizard.build.keystrokes().length;
    // Framework is category 1 of 33 and holds this cell, so the grid opens
    // with it focused — the walk has nowhere to travel.
    await wizard.build.focusSkill(E2E_SKILL.react.display);
    const spent = wizard.build.keystrokes().slice(before);

    expect(
      tabsPressed(spent),
      "focusSkill must look at the screen before it presses Tab: the target " +
        "category is already focused, so a single press starts a lap it then " +
        "has to finish",
    ).toStrictEqual([]);
  });

  it("stops after one lap and names every category it observed", async () => {
    wizard = await launchAgainstDefaultCatalogue();

    const absent = `${E2E_SKILL.react.display} That No Category Holds`;
    const before = wizard.build.keystrokes().length;

    const error = await wizard.build
      .focusSkill(absent)
      .then(() => undefined)
      .catch((thrown: unknown) => thrown);
    const spent = wizard.build.keystrokes().slice(before);

    expect(error).toBeInstanceOf(CategoryWalkError);
    const walked = (error as CategoryWalkError).categoriesWalked;

    // One confirmed Tab per category, plus the harness's own re-press budget
    // for keystrokes the PTY swallows — bounded rather than exact, because a
    // re-press is a legitimate outcome under load and pinning equality here
    // would rebuild the flake this file exists to remove. Still far under a
    // fixed budget's spend, which is the behaviour being ruled out.
    expect(
      tabsPressed(spent).length,
      `one lap of ${walked.length} categories, not a fixed budget of presses`,
    ).toBeLessThanOrEqual(walked.length + INTERNAL_RETRIES.MAX_ATTEMPTS);
    expect(tabsPressed(spent).length).toBeGreaterThanOrEqual(walked.length);
    expect(
      new Set(walked).size,
      `every category observed exactly once, walked: ${walked.join(", ")}`,
    ).toBe(walked.length);
    expect((error as CategoryWalkError).message).toContain(absent);
  });
});
