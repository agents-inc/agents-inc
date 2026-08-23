import { BaseStep } from "../base-step.js";
import { STEP_TEXT, TIMEOUTS } from "../constants.js";
import { AgentsStep } from "./agents-step.js";
import { BuildStep } from "./build-step.js";

/**
 * The glyph `SourceGrid` paints in front of the FOCUSED cell, and a blank spacer in front of
 * every other. It is a glyph rather than a colour, so it survives `NO_COLOR` — which is what
 * makes the grid cursor readable from a captured frame at all.
 *
 * Duplicated from `UI_SYMBOLS.CHEVRON` in `src/cli/consts.ts` rather than imported, for the
 * reason `e2e/pages/constants.ts` gives about the diff markers it mirrors: a page object that
 * read the very symbol the product rendered with could not notice that symbol changing.
 */
const FOCUS_MARKER = "\u276F";

/**
 * A bound on the walk below, and nothing the walk's CORRECTNESS depends on.
 *
 * It replaces a fixture-sized `SOURCE_ROW_WALK_LENGTH = 12`, which was an upper bound the
 * walk trusted: a Sources step presenting more focusable rows than that silently walked
 * PART of the grid, left the rest on their previous mode, and passed. The walk is closed-loop
 * now — it stops when the cursor comes back to the row it started on — so this number only
 * has to be larger than any grid a wizard can paint, and a walk that reaches it has hit a
 * loop rather than a large source.
 */
const SOURCE_ROW_WALK_LIMIT = 100;

export class SourcesStep extends BaseStep {
  /** Wait for sources step to be ready. */
  async waitForReady(): Promise<void> {
    await this.screen.waitForText(STEP_TEXT.SOURCES, TIMEOUTS.WIZARD_LOAD);
    await this.waitForWizardFooter();
  }

  /** Accept defaults and advance to agents step. */
  async acceptDefaults(): Promise<AgentsStep> {
    await this.waitForReady();
    await this.pressEnter();
    return new AgentsStep(this.session, this.projectDir);
  }

  /**
   * Set every EDITABLE skill row to install locally.
   *
   * The suite's driver for reaching an all-eject install. It walks the rows (see
   * `commitLocalOnEveryRow`) rather than pressing a bulk key, because the Sources step no longer
   * binds one — `l` and `p` are withdrawn. The walk is therefore strictly narrower than the key
   * it replaces: an inert row (a locked global install, a pending removal) is skipped by `↓` and
   * refused by SPACE, so a project edit's driver can no longer reach the global rows the step
   * renders locked. That containment is the point of the withdrawal, not a limitation of this
   * page object.
   */
  async setAllLocal(): Promise<void> {
    await this.commitLocalOnEveryRow();
  }

  /** Set every EDITABLE skill row to install as a plugin. See `setAllLocal`. */
  async setAllPlugin(): Promise<void> {
    await this.commitPluginOnEveryRow();
  }

  /**
   * Press "l" and "p" as raw keys, without claiming they do anything.
   *
   * Separate from `setAllLocal` / `setAllPlugin` on purpose. Those two are DRIVERS — the way
   * most of the suite reaches an all-eject or all-plugin install — so whatever the Sources step
   * binds, they must keep producing that state; they now walk the rows, and a spec calling them
   * presses neither key. These two are SUBJECTS: a spec whose claim is about the key itself has
   * to keep pressing the key, or it stops testing the thing it names. Same split, and the same
   * reason, as `BuildStep.pressFilterIncompatibleHotkey`.
   *
   * The trailing footer wait settles the frame so a caller can compare a captured screen either
   * side of the press.
   */
  async pressSetAllLocalHotkey(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("l");
    await this.waitForWizardFooter();
  }

  /** Press "p" as a raw key. See `pressSetAllLocalHotkey`. */
  async pressSetAllPluginHotkey(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("p");
    await this.waitForWizardFooter();
  }

  /**
   * Commit the install-mode cell the grid cursor is currently on (Space).
   *
   * Each row is one skill and carries a two-state control: `Local` at column 0,
   * `Plugin` at column 1. Space commits the focused cell as that skill's mode,
   * leaving every other row untouched — this is how a per-skill mixed install
   * is produced.
   */
  async selectFocusedSourceCell(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressSpace();
  }

  /**
   * Move the grid cursor one cell right within the focused skill's row —
   * `Local` to `Plugin`, and from `Plugin` it wraps back to `Local`.
   */
  async moveSourceColumnRight(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressArrowRight();
  }

  /**
   * Commit `Local` on every focusable row, one row at a time: SPACE on the focused cell, then
   * `↓` to the next row, until the cursor comes back to the row it started on.
   *
   * The per-row equivalent of the bulk `l` key, and the only route to an all-eject install once
   * that key is withdrawn. Four grid facts make the walk correct, and each is load-bearing:
   *
   *  - Focus SEEDS on the first focusable row and `↓` SKIPS inert ones (`firstFocusableRowIndex` /
   *    `skipRow`, both on `isRowInert`), and SPACE returns immediately on an inert row. So a
   *    locked global row or a pending-removal row is never reached and never committed — which is
   *    precisely the containment the bulk key did not have.
   *  - Column focus starts at 0, and column 0 IS the `Local` cell (`INSTALL_MODES` order in
   *    `consts.ts`, captioned by `INSTALL_MODE_CELL_LABELS`).
   *  - `↓` PRESERVES the column (`useFocusedListItem` clamps rather than resets), and every row
   *    has the same two cells, so the walk stays on `Local` without re-selecting the column.
   *  - Focus WRAPS, which is what gives the walk its own stopping condition: the first row is
   *    reached a second time exactly when every focusable row has been visited once.
   *
   * Needs a viewport tall enough that the grid does not overflow: with `hiddenBelow > 0`, `↓` on
   * the last focusable row scrolls the viewport instead of moving focus (`SourceGrid`'s overscroll
   * branch). Use `TERMINAL_SIZE.TALL`. The walk NAMES that case now instead of stalling silently
   * inside it — see {@link commitFocusedColumnOnEveryRow}.
   */
  async commitLocalOnEveryRow(): Promise<void> {
    await this.commitFocusedColumnOnEveryRow();
  }

  /**
   * Commit `Plugin` on every focusable row: the same walk as `commitLocalOnEveryRow`, entered
   * one column to the right.
   *
   * `→` is pressed ONCE, not per row, and that is load-bearing in both directions. `↓` preserves
   * the column (`useFocusedListItem` clamps rather than resets) and every row carries the same
   * two cells, so one move right puts the whole walk on `Plugin`. Pressing it again per row would
   * undo itself: horizontal focus WRAPS modulo the column count, and with two columns `→` from
   * `Plugin` returns to `Local`, so the walk would alternate modes down the grid.
   *
   * Every caveat on `commitLocalOnEveryRow` applies unchanged, including `TERMINAL_SIZE.TALL`.
   */
  async commitPluginOnEveryRow(): Promise<void> {
    await this.moveSourceColumnRight();
    await this.commitFocusedColumnOnEveryRow();
  }

  /**
   * SPACE on the focused cell, then `↓`, until the cursor returns to the row it started on.
   * The shared body of the two walks.
   *
   * Closed-loop on the PAINTED cursor rather than counted: the count it replaced was the
   * fixture's ten skills plus headroom, so a Sources step presenting more focusable rows than
   * that walked part of the grid, left the rest on their previous mode, and passed — the walk's
   * own driver reporting an all-eject install that was not one.
   *
   * **A step with no cursor at all is a real state, and it is the one this walk exists to
   * contain**: `SourceTag` paints the marker only on an EDITABLE cell, so a project edit whose
   * every skill is a locked global install paints none, and there is nothing to commit. Only the
   * FIRST read may answer that — a cursor that vanishes part-way through is the frame going wrong
   * under the walk, and returning quietly there would be the vacuous pass in a new spelling.
   *
   * A `↓` that leaves the cursor where it was is the overscroll case the doc above names, and it
   * is raised rather than walked around: it is a stall, and the old counted walk spent the rest of
   * its budget re-committing that one row.
   */
  private async commitFocusedColumnOnEveryRow(): Promise<void> {
    const firstRow = await this.focusedRow();
    if (firstRow === undefined) return;
    let previousRow = firstRow;

    for (let visited = 0; visited < SOURCE_ROW_WALK_LIMIT; visited++) {
      await this.waitForWizardFooter();
      await this.pressSpace();
      await this.waitForWizardFooter();
      await this.pressArrowDown();

      const row = await this.focusedRow();
      if (row === undefined) {
        throw new Error(
          `The sources walk started on a row and then found no grid cursor at all:\n${firstRow}\n\n` +
            `A step with no editable row paints no cursor from the start; one that loses it ` +
            `part-way means the captured frame is not the grid this walk began on.`,
        );
      }
      if (row === firstRow) return;
      if (row === previousRow) {
        throw new Error(
          `The sources walk pressed \u2193 and the cursor stayed on the same row:\n${row}\n\n` +
            `That is SourceGrid's overscroll branch — the grid is taller than the viewport, so ` +
            `\u2193 scrolls instead of moving focus. Launch the wizard with TERMINAL_SIZE.TALL.`,
        );
      }
      previousRow = row;
    }

    throw new Error(
      `The sources walk visited ${SOURCE_ROW_WALK_LIMIT} rows without returning to the one it ` +
        `started on. Focus wraps, so this is a walk that lost its place rather than a large grid.`,
    );
  }

  /**
   * The whole painted line the grid cursor is on — the row's identity for the walk above.
   *
   * The LINE rather than the skill name, because nothing has to be parsed out of it: SPACE
   * commits a mode by colour and weight alone (`INSTALL_MODE_CELL_LABELS` is the same text
   * either way), and under `NO_COLOR` both are stripped, so a committed row paints exactly the
   * characters it painted before. Only `←`/`→` move the marker within a line, and this
   * walk presses neither.
   *
   * `getScreen()` is scrollback PLUS viewport in general, but `waitForWizardFooter()` has just
   * proved `viewportY` is 0, so here it IS the viewport — the reasoning `BaseStep.getScreen`
   * carries.
   *
   * `undefined` for a step with NO cursor, which is a grid whose every row is inert; the caller
   * decides whether that is legitimate where it found it. More than one line carrying the marker
   * is never legitimate — it would mean the marker is no longer the cursor's alone, and the
   * walk's stopping condition would silently become a coin toss — so that is raised here.
   */
  private async focusedRow(): Promise<string | undefined> {
    await this.waitForWizardFooter();
    const [row, ...surplus] = this.getScreen()
      .split("\n")
      .filter((line) => line.includes(FOCUS_MARKER));

    if (surplus.length > 0) {
      throw new Error(
        `Expected at most one line carrying the grid cursor "${FOCUS_MARKER}" on the Sources ` +
          `step, found ${surplus.length + 1}.`,
      );
    }
    return row;
  }

  /** Go back to build step (Escape). */
  async goBack(): Promise<BuildStep> {
    await this.waitForWizardFooter();
    await this.pressEscape();
    await this.screen.waitForText(STEP_TEXT.BUILD, TIMEOUTS.WIZARD_LOAD);
    return new BuildStep(this.session, this.projectDir);
  }

  /** Advance to agents step (Enter). */
  async advance(): Promise<AgentsStep> {
    await this.waitForWizardFooter();
    await this.pressEnter();
    return new AgentsStep(this.session, this.projectDir);
  }
}
