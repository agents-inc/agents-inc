import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  E2E_AGENT,
  E2E_AGENTS,
  E2E_SKILL,
  E2E_STACK_DISPLAY,
} from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import type { ConfirmStep } from "../pages/steps/confirm-step.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import "../matchers/setup.js";

/**
 * Confirm step must render the same panel as the info panel (F-4 in
 * todo/wizard-ui-findings.md).
 *
 * `step-confirm.tsx` and `info-panel.tsx` already render the same
 * `<SkillAgentSummary />` inside the same copy-pasted scroll machinery. What the
 * confirm step lacks is the info panel's HEADER BLOCK: a `Marketplace <sources>`
 * row and a `Stack <name | none>` row above a dimmed divider. `sourceNames`
 * resolves through `formatSourceDisplayName` over the enabled sources, falling
 * back to `DEFAULT_PUBLIC_SOURCE_NAME` ("agents-inc" -> "Agents Inc");
 * `stackName` resolves through `findStack`, falling back to the literal "none".
 *
 * RED today — the two header tests. Both drive a real `cc init` to the confirm
 * step and assert the resolved header VALUES, not just that the words appear.
 * The stack path and the from-scratch path are both covered because they take
 * the two different branches of the Stack row (resolved name vs "none").
 *
 * GREEN today — the two scroll/input tests, the regression guard on "the confirm
 * step must still scroll correctly" and on its own `Enter`. The refactor moves
 * both: the extracted panel takes over the arrow keys while `StepConfirm` keeps
 * a `useInput` of its own for `Enter` / `Esc`.
 *
 * Deliberately NOT duplicated, because existing specs pin them: `Esc` returning
 * to the agents step (init-wizard-navigation and edit-wizard-completion both
 * have an "ESC on confirm returns to agents" case) and a plain `Enter`
 * completing the install with config and filesystem both verified
 * (init-wizard-stack, "should produce SkillConfig[] with id, scope, and source
 * in config"). What no spec covers, and what the two-`useInput` split newly
 * risks, is `Enter` still completing AFTER the panel's scroll handler ran.
 *
 * `expectCleanUninstall(dir, { removeConfig: true })` serves as the
 * nothing-was-written assertion for the read-only runs: no installed skills, no
 * compiled-agents dir, no `.claude-src/`.
 */

/** Skills the E2E stack selects by default — every source skill except vue and pinia. */
const STACK_SKILL_IDS = [
  E2E_SKILL.react.id,
  E2E_SKILL.vitest.id,
  E2E_SKILL.zustand.id,
  E2E_SKILL.hono.id,
  E2E_SKILL["research-methodology"].id,
  E2E_SKILL.reviewing.id,
  E2E_SKILL["cli-reviewing"].id,
] as const;

/** Arrow presses used to run the confirm viewport from one end of its scroll range to the other. */
const SCROLL_ATTEMPTS = 30;

const MARKETPLACE_ROW = `${STEP_TEXT.PANEL_MARKETPLACE} ${STEP_TEXT.SOURCE_DISPLAY_DEFAULT}`;
const STACK_ROW = `${STEP_TEXT.PANEL_STACK} ${E2E_STACK_DISPLAY}`;
const NO_STACK_ROW = `${STEP_TEXT.PANEL_STACK} ${STEP_TEXT.PANEL_STACK_NONE}`;

describe("confirm step — info-panel parity", () => {
  let source: E2ESource;
  let wizard: InitWizard | undefined;
  let tempDir: string | undefined;
  let fakeHome: string | undefined;
  let projectDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
    fakeHome = undefined;
    projectDir = undefined;
  });

  /** Launch `cc init` against a throwaway project plus its own fake HOME. */
  async function launchInit(size: { rows: number; cols: number }): Promise<InitWizard> {
    const env = await createTestEnvironment();
    tempDir = env.tempDir;
    fakeHome = env.fakeHome;
    projectDir = env.projectDir;

    return InitWizard.launch({
      projectDir: env.projectDir,
      source,
      env: { HOME: env.fakeHome },
      ...size,
    });
  }

  /**
   * Stack path: select the E2E stack, accept every default, land on confirm.
   *
   * passThroughAllDomainsGeneric, not passThroughAllDomains, because one helper
   * drives both geometries: at TERMINAL_SIZE.SHORT the domain -> build
   * transition can land on the second domain (DomainStep.acceptDefaults waits
   * for the first category label, which the squeezed build frame does not always
   * paint, so its closed-loop retry presses Enter again). The generic variant
   * advances until Sources actually appears and is right either way; every press
   * is a plain Enter, so the summary is the stack's default set.
   *
   * `localSources` switches the install to eject mode; without it the wizard
   * installs as plugins, which needs the Claude CLI and copies nothing into
   * `.claude/skills/`.
   */
  async function driveStackPathToConfirm(
    wiz: InitWizard,
    options?: { localSources: boolean },
  ): Promise<ConfirmStep> {
    const domain = await wiz.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    const sources = await build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    if (options?.localSources) await sources.setAllLocal();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("init");
    await confirm.waitForReady();
    return confirm;
  }

  /**
   * Abort before the confirm `Enter` — the point of no return — and prove the
   * session left both the project and its HOME untouched.
   */
  async function abortAndProveNothingInstalled(): Promise<void> {
    wizard!.abort();
    await wizard!.waitForExit(TIMEOUTS.EXIT_WAIT);

    await expectCleanUninstall(projectDir!, { removeConfig: true });
    await expectCleanUninstall(fakeHome!, { removeConfig: true });
  }

  it(
    "renders the marketplace and the selected stack above the summary",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await launchInit(TERMINAL_SIZE.TALL);
      const confirm = await driveStackPathToConfirm(wizard);

      // Capture while the frame is on screen — getScreen() is a repainted
      // buffer, so every assertion below reads this one snapshot. Each failure
      // prints that snapshot as the received value, so the messages stay short.
      const screen = confirm.getScreen();

      // Green guards: this really is the confirm step, and it really is
      // rendering the skill/agent summary the header has to sit above.
      expect(screen).toContain(STEP_TEXT.READY_TO_INSTALL);
      expect(screen, "confirm step must render the stack's skills").toContain(
        `+ ${E2E_SKILL.react.display}`,
      );
      expect(screen, "confirm step must render the stack's agents").toContain(
        `+ ${E2E_AGENT["web-developer"].name}`,
      );

      await abortAndProveNothingInstalled();

      // The header block the info panel paints and the confirm step does not.
      expect(screen, "confirm step must name the marketplace its skills come from").toContain(
        MARKETPLACE_ROW,
      );
      expect(screen, "confirm step must name the selected stack").toContain(STACK_ROW);
    },
  );

  it(
    "renders the marketplace and a stack of none on a from-scratch run",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await launchInit(TERMINAL_SIZE.TALL);

      // From-scratch: no stack is ever selected, so `selectedStackId` stays null
      // and the Stack row must fall back to the literal "none".
      const domain = await wizard.stack.selectScratch();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughScratchDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");
      await confirm.waitForReady();

      const screen = confirm.getScreen();

      expect(screen).toContain(STEP_TEXT.READY_TO_INSTALL);
      expect(screen, "confirm step must render the hand-picked skills").toContain(
        `+ ${E2E_SKILL.react.display}`,
      );
      expect(screen, "confirm step must render the preselected agents").toContain(
        `+ ${E2E_AGENT["web-developer"].name}`,
      );
      // The dropdown says "Ready to install your custom stack" on this path, so
      // no stack name is available anywhere in the frame to satisfy the row by
      // accident.
      expect(screen).not.toContain(E2E_STACK_DISPLAY);

      await abortAndProveNothingInstalled();

      expect(screen, "confirm step must name the marketplace its skills come from").toContain(
        MARKETPLACE_ROW,
      );
      expect(screen, 'confirm step must render "none" when no stack was selected').toContain(
        NO_STACK_ROW,
      );
    },
  );

  it(
    "clips its summary and scrolls both ways with the arrow keys at a short terminal height",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      wizard = await launchInit(TERMINAL_SIZE.SHORT);
      const confirm = await driveStackPathToConfirm(wizard);

      // Top of the range: content is clipped below, nothing is hidden above.
      const atTop = confirm.getScreen();
      expect(atTop, "confirm step must signal clipped content below the fold").toContain(
        STEP_TEXT.SCROLL_MORE_BELOW,
      );
      expect(atTop, "an unscrolled confirm step hides nothing above").not.toContain(
        STEP_TEXT.SCROLL_MORE_ABOVE,
      );

      for (let i = 0; i < SCROLL_ATTEMPTS; i++) {
        await confirm.navigateDown();
      }

      // Bottom of the range: the whole summary has passed through the viewport.
      const atBottom = confirm.getScreen();
      expect(atBottom, "arrowing down must scroll the confirm summary").toContain(
        STEP_TEXT.SCROLL_MORE_ABOVE,
      );
      expect(atBottom, "arrowing down must reach the end of the summary").not.toContain(
        STEP_TEXT.SCROLL_MORE_BELOW,
      );

      // The counters above only prove the panel's own bookkeeping moved. This
      // proves the content moved with it: the viewport is five rows, filled
      // entirely by the marketplace/stack header at offset 0, so a summary row
      // on screen here is one that arrowing down revealed.
      expect(atBottom, "arrowing down must reveal summary rows the header hid").toContain(
        `+ ${E2E_AGENT["web-developer"].name}`,
      );

      for (let i = 0; i < SCROLL_ATTEMPTS; i++) {
        await confirm.navigateUp();
      }

      const backAtTop = confirm.getScreen();
      expect(backAtTop, "arrowing up must scroll the confirm summary back").toContain(
        STEP_TEXT.SCROLL_MORE_BELOW,
      );
      expect(backAtTop, "arrowing up must return the summary to its top").not.toContain(
        STEP_TEXT.SCROLL_MORE_ABOVE,
      );

      await abortAndProveNothingInstalled();
    },
  );

  it(
    "still installs on Enter after the summary has been scrolled",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      // launchInProject exposes the global HOME the default-scope install writes
      // to, so the filesystem half of the verification has somewhere to look.
      wizard = await InitWizard.launchInProject({ source, ...TERMINAL_SIZE.SHORT });
      const confirm = await driveStackPathToConfirm(wizard, { localSources: true });

      // Drive the panel's own scroll handler before handing it the Enter that
      // the step itself must handle.
      for (let i = 0; i < SCROLL_ATTEMPTS; i++) {
        await confirm.navigateDown();
      }

      const result = await confirm.confirm();

      await expect(result.project).toHaveConfig({
        skillIds: STACK_SKILL_IDS,
        agents: E2E_AGENTS.WEB_AND_API,
        source: "eject",
      });
      await expectPhaseSuccess(
        { project: { dir: wizard.globalHome }, exitCode: result.exitCode },
        { compiledAgents: E2E_AGENTS.WEB_AND_API, copiedSkills: STACK_SKILL_IDS },
      );

      await result.destroy();
    },
  );
});
