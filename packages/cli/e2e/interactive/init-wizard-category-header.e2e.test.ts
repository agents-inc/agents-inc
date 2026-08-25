import { afterEach, describe, expect, it } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";

/**
 * What a build-grid category header says about itself.
 *
 * The header is the only place the grid ever states a category's own properties, so it is where
 * a property the product no longer has would still be visible. It carries two things and no
 * others: the category's display name, and — for a pick-one category — the counter saying how
 * many of its one slot are filled.
 *
 * The assertion is POSITIVE on purpose, because the interesting half is an absence and an
 * absence is the hardest thing to assert in a terminal. `getOutput()` reads scrollback as well
 * as the viewport, so `not.toContain` matches anything the session ever drew; and a negative
 * naming the glyph that used to sit between the two halves would name a symbol the product no
 * longer declares, which is an assertion that can never fail again. Matching the name and its
 * counter as one adjacent string says the same thing and keeps saying it: nothing may come
 * between them.
 *
 * The E2E fixture gives `web-framework` two skills and no selection at launch, so the counter
 * reads zero of one and the category is exclusive — the two conditions the string depends on.
 */
describe("build grid category header", () => {
  let wizard: InitWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it("carries the category name and its pick-one counter, with nothing between them", async () => {
    wizard = await InitWizard.launch({ ...TERMINAL_SIZE.TALL });

    const domain = await wizard.stack.selectScratch();
    const build = await domain.acceptDefaults();

    expect(
      build.getOutput(),
      "a header states the category's name and how full it is, and nothing else about it",
    ).toContain(`${STEP_TEXT.CATEGORY_FRAMEWORK} (0 of 1)`);
  });
});
