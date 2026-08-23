import { render } from "ink-testing-library";
import { Text } from "ink";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackSelection } from "./stack-selection";
import { WizardLayout } from "./wizard-layout";
import { hydrateWizardStore, useWizardStore } from "../../stores/wizard-store";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import {
  REACT_HONO_FRAMEWORK_API_MATRIX,
  REACT_HONO_ONE_STACK_MATRIX,
  STACK_CLAIMING_ABSENT_SKILL_MATRIX,
} from "../../lib/__tests__/mock-data/mock-matrices";
import { buildSkillConfigs } from "../../lib/__tests__/helpers/wizard-simulation";
import {
  ARROW_DOWN,
  ENTER,
  RENDER_DELAY_MS,
  SELECT_NAV_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";
import { CLI_INVOKE_COMMAND } from "../../consts";
import { disableBuffering, drainBuffer, enableBuffering } from "../../utils/logger";
import type { SkillId } from "../../types";

/**
 * THE STATE THIS FILE IS ABOUT, and it has to be built rather than waited for: a global config
 * naming a skill the loaded marketplace does not carry.
 *
 * `REACT_HONO_ONE_STACK_MATRIX` carries React and Hono and one stack that claims no skills of
 * its own, so every id below reaches `populateFromSkillIds` from the global preselections
 * alone, and a preselection naming anything else cannot resolve. Both rows of the stack step
 * then merge those preselections while the wizard is mounted and Ink owns the terminal — which
 * is the whole difference from the startup case, where the same warning is buffered into the
 * band before the first frame.
 */
const ABSENT_FROM_SOURCE: SkillId = "web-styling-tailwind";
const ALSO_ABSENT_FROM_SOURCE: SkillId = "web-state-zustand";
const CARRIED_BY_SOURCE: SkillId = "web-framework-react";

/**
 * The toast strings verbatim, mirrored rather than imported for the reason the sibling
 * `wizard-layout.test.tsx` mirrors its subtitle: an assertion that imports the very string the
 * product renders cannot fail when that string changes.
 */
const ONE_SKILL_TOAST = "1 skill was left out — this source cannot place it";
const TWO_SKILLS_TOAST = "2 skills were left out — this source cannot place them";

/** The scratch row sits below the source's single stack, so one press reaches it. */
async function focusScratchRow(stdin: { write: (data: string) => void }): Promise<void> {
  stdin.write(ARROW_DOWN);
  await delay(SELECT_NAV_DELAY_MS);
}

/**
 * Seats global preselections and opens the stack step over them.
 *
 * **This is not a shape `init` produces**, and the describe below says why at length: `init`'s
 * wizard is reached only once no installation was found, so it hydrates with
 * `isEditingFromGlobalScope` alone and `globalPreselections` is null on every path that reaches
 * the stack step. Said here as well as there because this helper is read first, and a helper
 * claiming to open the wizard "the way `init` does" makes the five cases under it read as
 * coverage of a production route. What they cover is the STORE contract `showWarningsAsToast`
 * is built on — every warning a mid-session population raises reaches the toast channel and
 * not stderr — which is worth holding on its own and is a different claim.
 */
function hydrateWithGlobalPreselections(skillIds: readonly SkillId[]): void {
  hydrateWizardStore({
    installedSkillConfigs: buildSkillConfigs(skillIds, { scope: "global" }),
  });
}

describe("StackSelection with a global preselection this source cannot place", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(REACT_HONO_ONE_STACK_MATRIX);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("raises the warning the startup band would have carried before the mount", () => {
    hydrateWithGlobalPreselections([ABSENT_FROM_SOURCE]);

    // Nothing has resolved it yet: hydration stores the preselections for the stack step to
    // merge, so the population that warns has not run at this point.
    expect(useWizardStore.getState().unresolvableSkillIds).toStrictEqual([]);

    useWizardStore.getState().startFromScratch();

    expect(
      useWizardStore.getState().unresolvableSkillIds,
      "the preselection must be the skill the source cannot place",
    ).toStrictEqual([ABSENT_FROM_SOURCE]);
  });

  it("shows a toast when the stack row merges a preselection the source does not carry", async () => {
    hydrateWithGlobalPreselections([ABSENT_FROM_SOURCE]);

    const { stdin, unmount } = render(<StackSelection />);
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    stdin.write(ENTER);
    await delay(SELECT_NAV_DELAY_MS);

    const { toastMessage, step } = useWizardStore.getState();
    expect(toastMessage, "a warning raised mid-session belongs on the toast channel").toBe(
      ONE_SKILL_TOAST,
    );
    // The choice still went through — the toast reports, it does not refuse.
    expect(step).toBe("domains");
  });

  it("shows a toast when the scratch row applies a preselection the source does not carry", async () => {
    hydrateWithGlobalPreselections([ABSENT_FROM_SOURCE]);

    const { stdin, unmount } = render(<StackSelection />);
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    await focusScratchRow(stdin);
    stdin.write(ENTER);
    await delay(SELECT_NAV_DELAY_MS);

    const { toastMessage, approach } = useWizardStore.getState();
    expect(toastMessage).toBe(ONE_SKILL_TOAST);
    expect(approach).toBe("scratch");
  });

  it("counts every preselection the source could not place", async () => {
    hydrateWithGlobalPreselections([ABSENT_FROM_SOURCE, ALSO_ABSENT_FROM_SOURCE]);

    const { stdin, unmount } = render(<StackSelection />);
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    stdin.write(ENTER);
    await delay(SELECT_NAV_DELAY_MS);

    expect(useWizardStore.getState().toastMessage).toBe(TWO_SKILLS_TOAST);
  });

  /**
   * The control. Without it, a toast that fired on every stack choice would satisfy every
   * assertion above and nothing would say the routing is scoped to a warning at all.
   */
  it("shows no toast when every preselection resolves against the source", async () => {
    hydrateWithGlobalPreselections([CARRIED_BY_SOURCE]);

    const { stdin, unmount } = render(<StackSelection />);
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    stdin.write(ENTER);
    await delay(SELECT_NAV_DELAY_MS);

    const { toastMessage, unresolvableSkillIds, step } = useWizardStore.getState();
    expect(toastMessage, "a resolvable preselection is not news").toBeNull();
    expect(unresolvableSkillIds).toStrictEqual([]);
    expect(step).toBe("domains");
  });

  /**
   * The half the toast exists for. `warn()` writes to stderr, and a line written to stderr
   * under a mounted wizard is one the next frame pushes off the top of the screen — the defect
   * `assertWizardScreenIsWhollyVisible` in `e2e/pages/base-step.ts` fails the interactive suite
   * on. So the routing has to take the message OFF stderr, not merely copy it to the toast.
   */
  it("writes nothing to stderr, where a painted frame would push the line off the screen", async () => {
    const stderrWrite = vi.spyOn(console, "warn").mockImplementation(() => {});
    hydrateWithGlobalPreselections([ABSENT_FROM_SOURCE]);

    const { stdin, unmount } = render(<StackSelection />);
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    stdin.write(ENTER);
    await delay(SELECT_NAV_DELAY_MS);

    expect(
      stderrWrite,
      "the frame is painted, so stderr is where a message goes to be lost",
    ).not.toHaveBeenCalled();
    expect(useWizardStore.getState().toastMessage).toBe(ONE_SKILL_TOAST);
    stderrWrite.mockRestore();
  });
});

/**
 * The route that can actually happen in production today, and it is not the global-preselection
 * one above. `init` hydrates with `isEditingFromGlobalScope` alone — it never passes
 * `installedSkillConfigs`, because it is only reached once no installation was found — so
 * `globalPreselections` is null on every path that reaches the stack step, and the merge in
 * `applyStack` contributes nothing. What DOES reach it is the stack's own `allSkillIds`:
 * `convertStackToResolvedStack` copies them through unvalidated, so a source whose stack names a
 * skill its catalogue dropped warns here, from a painted frame, on the first Enter.
 */
describe("a stack whose own skills the catalogue does not carry", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(STACK_CLAIMING_ABSENT_SKILL_MATRIX);
    hydrateWizardStore({});
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("toasts when the stack is chosen, with no global preselection involved", async () => {
    expect(
      useWizardStore.getState().globalPreselections,
      "this route must not depend on the preselections init never sets",
    ).toBeNull();

    const { stdin, unmount } = render(<StackSelection />);
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    stdin.write(ENTER);
    await delay(SELECT_NAV_DELAY_MS);

    const { toastMessage, unresolvableSkillIds } = useWizardStore.getState();
    expect(toastMessage).toBe(ONE_SKILL_TOAST);
    expect(unresolvableSkillIds).toStrictEqual([ABSENT_FROM_SOURCE]);
    // The skill the catalogue does carry still made it into the selection.
    expect(useWizardStore.getState().skillConfigs.map((config) => config.id)).toStrictEqual([
      CARRIED_BY_SOURCE,
    ]);
  });
});

/**
 * The other side of the routing, and the reason it lives at the call site rather than inside
 * `startFromScratch`. A source shipping no stacks has no stack step to open on, so hydration
 * calls the same action itself — before the mount, with the load's buffer still open. There the
 * startup band IS the right home, and a wrapper pushed down into the action would take the
 * message off the band, reset the buffer the load had already filled, and close the window
 * early. Neither assertion below means anything without the mid-session pair above it: both
 * halves leave the same store field set, and only the channel tells them apart.
 */
describe("the same warning raised before the wizard mounts", () => {
  beforeEach(() => {
    // Ships no stacks, so `hydrateForInit` runs `startFromScratch` itself.
    initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);
  });

  it("goes to the startup band and leaves the toast alone", () => {
    enableBuffering();
    let buffered: string[];
    try {
      hydrateWithGlobalPreselections([ABSENT_FROM_SOURCE]);
      buffered = drainBuffer().map((message) => message.text);
    } finally {
      disableBuffering();
    }

    expect(buffered, "before the mount the band is what carries the warning").toStrictEqual([
      `Installed skill '${ABSENT_FROM_SOURCE}' is not present in the loaded source — it may ` +
        "have been removed or renamed. It is left out of this session's selection. Run " +
        `'${CLI_INVOKE_COMMAND} update' to refresh the marketplace if you expect it to still ` +
        "be carried there.",
    ]);
    expect(
      useWizardStore.getState().toastMessage,
      "a startup message is not a mid-session one, and must not take the transient channel",
    ).toBeNull();
  });
});

/** Text only the layout's children paint, so the frame can be told apart from an empty one. */
const CHILD_MARKER = "STEP BODY";

describe("the frame a mid-session warning reaches the user through", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(REACT_HONO_ONE_STACK_MATRIX);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("paints the toast inside the wizard frame", async () => {
    hydrateWithGlobalPreselections([ABSENT_FROM_SOURCE]);

    const { stdin, lastFrame, unmount } = render(
      <WizardLayout>
        <StackSelection />
        <Text>{CHILD_MARKER}</Text>
      </WizardLayout>,
    );
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    stdin.write(ENTER);
    await delay(SELECT_NAV_DELAY_MS);

    const output = lastFrame();
    expect(output, "the toast is only real if the user can read it in the frame").toContain(
      ONE_SKILL_TOAST,
    );
    // The step body proves the toast was drawn over a live wizard, not instead of one.
    expect(output).toContain(CHILD_MARKER);
  });

  /**
   * The channel pinned from the frame's side, which is the only side that can carry it: the
   * startup band is a prop fixed at mount, so "did the message land in the buffer" is
   * unobservable here — `showWarningsAsToast` closes its own window, and `disableBuffering()`
   * empties it, so an assertion on the drained buffer passes whatever the product does. Asking
   * the FRAME instead is falsifiable: the toast's short line must be readable, and the warning's
   * own long text — the string the band paints, and the one that would wrap into an unreadable
   * block at this width — must appear nowhere.
   */
  it("paints the toast line and not the warning text the band would have carried", async () => {
    hydrateWithGlobalPreselections([ABSENT_FROM_SOURCE]);

    const { stdin, lastFrame, unmount } = render(
      <WizardLayout>
        <StackSelection />
        <Text>{CHILD_MARKER}</Text>
      </WizardLayout>,
    );
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    stdin.write(ENTER);
    await delay(SELECT_NAV_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(ONE_SKILL_TOAST);
    expect(
      output,
      "the band's wording is a startup message's wording and has no business mid-session",
    ).not.toContain(`Installed skill '${ABSENT_FROM_SOURCE}' is not present`);
  });
});
