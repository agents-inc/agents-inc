import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT } from "../pages/constants.js";
import { cleanupFixture, ensureBinaryExists } from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";

/**
 * The build grid must render a category's skills in a deterministic,
 * machine-independent order (alphabetical by displayName), not in matrix
 * readdir/insertion order. In the E2E source the web-framework category holds two
 * skills whose titles sort react before Vue ("E2E React" < "Vue Composition Api"),
 * so react must render first in the row.
 */
describe("build step — deterministic category ordering", () => {
  let source: E2ESource;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  });

  afterAll(async () => {
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it("renders web-framework options alphabetically by displayName (react before Vue)", async () => {
    wizard = await InitWizard.launch({
      source,
    });

    const domain = await wizard.stack.selectFirstStack();
    const build = await domain.acceptDefaults();

    // acceptDefaults() anchors on the build step's first frame, so the web
    // domain's web-framework row is already painted here.
    expect(build.getOutput()).toContain(STEP_TEXT.BUILD);

    const output = build.getOutput();
    const vueIndex = output.indexOf(E2E_SKILL["vue-composition-api"].display);
    const reactIndex = output.indexOf(E2E_SKILL.react.display);

    expect(
      vueIndex,
      `"${E2E_SKILL["vue-composition-api"].display}" must render in the web-framework row`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      reactIndex,
      `"${E2E_SKILL.react.display}" must render in the web-framework row`,
    ).toBeGreaterThanOrEqual(0);
    expect(reactIndex).toBeLessThan(vueIndex);
  });
});
