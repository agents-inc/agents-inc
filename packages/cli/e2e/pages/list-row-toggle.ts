import { delay } from "../helpers/test-utils.js";
import { INTERNAL_DELAYS, INTERNAL_RETRIES } from "./constants.js";
import { retrySpaceUntilToggled } from "./retry-space.js";

/**
 * The glyph every wizard list paints in front of the focused row. Kept module-local rather than
 * added to `constants.ts`: that file's loose exports are enumerated as exhaustive by
 * `standards/e2e/README.md`, and this is framework plumbing no spec ever names.
 */
const FOCUS_MARKER = "❯";

/**
 * The attempt index of the first Space press of a toggle. It is the only one with no earlier
 * press still unaccounted for behind it, and therefore the only one a confirmation may accept
 * the moment it reads the target state.
 */
const FIRST_PRESS = 0;

/** One named row a step is about to press Space on, and the two things only the step can do. */
export type ListRowToggle = {
  /** The page-object method being confirmed, so a failure says whose press went missing. */
  method: string;
  /** The row's label as the wizard paints it. */
  label: string;
  /** The wizard screen as it stands NOW — re-read on every look. */
  readScreen: () => string;
  /** One Space press on the focused row, with the step's own pre-press footer wait. */
  press: () => Promise<void>;
};

/**
 * Press Space on the focused list row until it renders the other way round — the closed-loop
 * form of a toggle on a `[✓]` / `[ ]` list, and the counterpart of `BuildStep.selectSkill` for
 * the two steps whose subject is a ROW rather than a grid cell.
 *
 * `retrySpaceUntilToggled` states why a toggle may not take the blind retry Enter and Tab take:
 * a re-press of a press that DID land turns the selection back off, and a row toggled twice is
 * indistinguishable from a row never toggled on every surface the suite reads. What that
 * primitive demands of its caller is a confirmation that observes the TARGET STATE of a NAMED
 * subject, and this is where the two list steps get one.
 *
 * **The subject is the FOCUSED row, not every row carrying the label.** The caller has just
 * navigated the cursor onto it, so it is the row the press will actually hit — and it is the one
 * reading that cannot be answered by an unfocused twin, which the agents list paints whenever a
 * sub-agent exists at both scopes.
 *
 * **The signal is the whole row rather than the checkbox alone**, for the reason
 * `renderedCellText` gives one layer over: no single element of the row tracks selection on its
 * own. The checkbox is the usual mover, but a dual-scope deselect collapses `[P][G]` to `[G]`
 * while the box stays ticked — a change a checkbox-only test would miss, after which the loop
 * would re-press a toggle that had already landed.
 *
 * The target is read once and held. Re-reading it per attempt would turn "reach the flipped
 * state" into "flip once more", which a late-landing press makes unterminating.
 */
export async function toggleListRowUntilRendered(subject: ListRowToggle): Promise<void> {
  const before = focusedRowOrThrow(subject);

  await retrySpaceUntilToggled(subject.press, (attempt) =>
    confirmRowToggled(subject, before, attempt),
  );
}

/** Wait for the row to move off `before`, then hold every retry to a second look. */
async function confirmRowToggled(
  subject: ListRowToggle,
  before: string,
  attempt: number,
): Promise<void> {
  const toggled = await pollRow(() => rowOtherThan(subject, before));
  if (toggled === null) throw rowNeverToggled(subject, before, attempt);
  if (attempt === FIRST_PRESS) return;

  await confirmRowStayedToggled(subject, before, attempt);
}

/**
 * The one bounded margin in this loop, and it is not a settle delay in disguise: it waits on the
 * single thing no surface can show, which is a press already written to the PTY whose effect has
 * not arrived.
 *
 * {@link FIRST_PRESS} has nothing behind it, so it is accepted on the frame it is observed on and
 * pays nothing. Every press after it has an earlier one unaccounted for, and a toggle that lands
 * twice comes back to where it started — which this sees, and answers with another press rather
 * than a wrong pass.
 */
async function confirmRowStayedToggled(
  subject: ListRowToggle,
  before: string,
  attempt: number,
): Promise<void> {
  await delay(INTERNAL_DELAYS.KEYSTROKE);
  if (rowOtherThan(subject, before) !== null) return;

  throw new Error(
    `${subject.method}: the focused row "${subject.label}" toggled and came straight back to ` +
      `"${before}", so one of the ${attempt + 1} Space presses landed late and undid another.\n` +
      `Screen:\n${subject.readScreen()}`,
  );
}

/** Poll the current screen for the row to change, on the framework's shared interval. */
async function pollRow(read: () => string | null): Promise<string | null> {
  const deadline = Date.now() + INTERNAL_RETRIES.INTERVAL_MS;
  for (;;) {
    const seen = read();
    if (seen !== null) return seen;
    if (Date.now() >= deadline) return null;
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }
}

/** The focused row's rendered text when it is no longer `before`, else null. */
function rowOtherThan(subject: ListRowToggle, before: string): string | null {
  const row = focusedRow(subject);

  return row !== null && row !== before ? row : null;
}

/**
 * The focused row carrying `label`, whitespace flattened, or null when none is painted.
 *
 * Read newest-to-oldest so a re-opened wizard judges the current frame rather than scrollback,
 * and flattened because a neighbouring row gaining or losing a badge shifts this one's padding
 * without changing what it says.
 */
function focusedRow({ readScreen, label }: ListRowToggle): string | null {
  const painted = readScreen()
    .split("\n")
    .filter((line) => line.includes(FOCUS_MARKER) && line.includes(label))
    .at(-1);

  return painted === undefined ? null : painted.trim().replace(/\s+/g, " ");
}

/** {@link focusedRow} where the caller has already navigated the cursor onto it. */
function focusedRowOrThrow(subject: ListRowToggle): string {
  const row = focusedRow(subject);
  if (row !== null) return row;

  throw new Error(
    `${subject.method}: no focused row is labelled "${subject.label}", so its toggle has ` +
      `nothing to be confirmed against.\nScreen:\n${subject.readScreen()}`,
  );
}

/** Says which row refused to move and what it was still rendering. */
function rowNeverToggled(subject: ListRowToggle, before: string, attempt: number): Error {
  return new Error(
    `${subject.method}: the focused row "${subject.label}" still renders "${before}" after ` +
      `${attempt + 1} Space press(es). Either the presses are being swallowed, or the product ` +
      `refused the toggle — a refusal is a toast, so assert it with the Awaiting variant.\n` +
      `Screen:\n${subject.readScreen()}`,
  );
}
