import { INTERNAL_RETRIES } from "./constants.js";

/**
 * Closed-loop Space retry, and the reason it is a separate primitive from
 * `retryEnterUntil` in `retry-enter.ts` rather than a second caller of it.
 *
 * The race is the same one: Ink registers a component's `useInput` handler in
 * an effect, so a keystroke that arrives between the render commit and the
 * effect flush is discarded with nothing on any surface to say so. The build
 * grid remounts on every domain change (`CategoryGrid key={activeDomain}` in
 * `step-build.tsx`), which is why `use-category-grid-input.ts` carries a
 * comment ending "causing the first space press to be silently lost".
 *
 * What differs is the retry's safety, and it is the whole design:
 *
 * - **Enter and Tab are monotonic.** "Did the next step paint" and "did focus
 *   move" cannot be un-answered by pressing again, so those loops confirm that
 *   SOMETHING happened and re-press when it did not.
 * - **Space is a toggle.** A re-press of a press that DID land turns the
 *   selection back off, converting a dropped keystroke into a double
 *   keystroke — a worse defect than the one being fixed, and one no other
 *   assertion in the suite can see, because a skill toggled twice reads
 *   exactly like a skill never toggled.
 *
 * So `confirmToggled` must observe the TARGET STATE of a NAMED subject — "is
 * this skill's cell now rendering the other way round" — never "did the frame
 * change". That distinction is the caller's to keep, and the caller that keeps
 * it is `BuildStep.selectSkill`, which knows which skill it is toggling.
 * `BuildStep.toggleFocusedSkill` deliberately does NOT use this loop: cell
 * focus has no text signal under `NO_COLOR`, so it cannot name its own
 * subject.
 *
 * `attempt` is handed to the confirmation because the FIRST press is the only
 * one with no earlier press still in flight behind it, and is therefore the
 * only one a confirmation may accept the moment it reads the target state. A
 * loop that could not tell attempt 0 from attempt 3 would have to pay the
 * re-read on every toggle in the suite, or never pay it at all.
 */
export async function retrySpaceUntilToggled(
  press: () => Promise<void>,
  confirmToggled: (attempt: number) => Promise<void>,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < INTERNAL_RETRIES.MAX_ATTEMPTS; attempt++) {
    await press();
    try {
      await confirmToggled(attempt);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
