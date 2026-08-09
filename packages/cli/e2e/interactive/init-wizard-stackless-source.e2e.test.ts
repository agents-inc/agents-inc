import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BUILT_IN_STACK_DISPLAY, E2E_STACK_DISPLAY } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import {
  STEP_TEXT,
  TIMEOUTS,
  WIZARD_TAB_LABELS_WITHOUT_STACK,
  WIZARD_TAB_STACK,
} from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import "../matchers/setup.js";

/**
 * The built-in stack catalogue belongs to the default public marketplace and to
 * nothing else. A custom `--source` marketplace offers the stacks it ships or
 * none at all — and a marketplace that ships none leaves the wizard's stack step
 * with nothing to choose between, so the wizard opens past it rather than
 * offering a catalogue the user never named.
 */
describe("init wizard — stacks belong to the marketplace that ships them", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("custom marketplace that ships no stacks", () => {
    let stacklessSource: E2ESource;

    beforeAll(async () => {
      stacklessSource = await createE2ESource({ withoutStacks: true });
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupTempDir(stacklessSource.tempDir);
    });

    it("opens on domain selection, never painting a stack step, and carries on", async () => {
      const launched = await InitWizard.launchOnDomainsInProject({ source: stacklessSource });
      wizard = launched.wizard;

      // Raw PTY output is append-only, so a stack step that painted for even one
      // frame is still in it: absence here is absence, not an overpaint. The
      // built-in stack name is the substitution this rule forbids, named
      // separately from the step's own two strings.
      const raw = wizard.getRawOutput();
      expect(raw).toContain(STEP_TEXT.DOMAINS);
      expect(raw).not.toContain(STEP_TEXT.STACK);
      expect(raw).not.toContain(STEP_TEXT.START_FROM_SCRATCH);
      expect(raw).not.toContain(BUILT_IN_STACK_DISPLAY);

      const build = await launched.domain.acceptDefaults();

      expect(build.getOutput()).toContain(STEP_TEXT.BUILD);
    });

    it("paints a tab bar with no Stack tab on it", async () => {
      const launched = await InitWizard.launchOnDomainsInProject({ source: stacklessSource });
      wizard = launched.wizard;

      // The other five tabs assert the bar was painted at all, so the missing
      // sixth reads as a dropped step rather than a missing frame. Absence is
      // claimed over the append-only raw output: a Stack tab drawn for one
      // frame — dimmed, completed or otherwise — is still in it.
      const raw = wizard.getRawOutput();
      for (const tabLabel of WIZARD_TAB_LABELS_WITHOUT_STACK) {
        expect(raw).toContain(tabLabel);
      }
      expect(raw).not.toContain(WIZARD_TAB_STACK);
    });
  });

  describe("custom marketplace that ships its own stacks", () => {
    let source: E2ESource;

    beforeAll(async () => {
      source = await createE2ESource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupTempDir(source.tempDir);
    });

    it("offers those stacks and none of the built-ins", async () => {
      wizard = await InitWizard.launch({ source });

      const output = wizard.stack.getOutput();
      expect(output).toContain(E2E_STACK_DISPLAY);
      expect(output).toContain(STEP_TEXT.START_FROM_SCRATCH);
      expect(output).not.toContain(BUILT_IN_STACK_DISPLAY);
    });
  });

  describe("the default public marketplace", () => {
    it("offers the built-in stacks", async () => {
      wizard = await InitWizard.launch({ noSource: true, env: { CC_SOURCE: undefined } });

      const output = wizard.stack.getOutput();
      expect(output).toContain(BUILT_IN_STACK_DISPLAY);
      expect(output).toContain(STEP_TEXT.START_FROM_SCRATCH);
    });
  });
});
