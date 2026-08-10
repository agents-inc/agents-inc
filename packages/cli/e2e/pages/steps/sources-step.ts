import { BaseStep } from "../base-step.js";
import { STEP_TEXT, TIMEOUTS } from "../constants.js";
import { AgentsStep } from "./agents-step.js";
import { BuildStep } from "./build-step.js";

/**
 * How many rows the no-argument drivers (`setAllLocal` / `setAllPlugin`) walk.
 *
 * It only has to be an UPPER BOUND on the focusable rows a Sources step can present, never the
 * exact count: focus wraps, so an over-long walk re-commits a mode a row already carries, and
 * `commitLocalOnEveryRow` documents why that is a no-op. Every spec reaching these drivers runs
 * against a source built by `createE2ESource` (ten skills, which `createE2EPluginSource` rebuilds
 * rather than extends), and `classifySkillSourceRows` emits at most one FOCUSABLE row per skill —
 * a locked global row, a pending-removal row and the locked half of a `[P][G]` pair are all inert,
 * and inert rows are skipped by `↓` and refused by SPACE. Ten plus headroom.
 */
const SOURCE_ROW_WALK_LENGTH = 12;

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
    await this.commitLocalOnEveryRow(SOURCE_ROW_WALK_LENGTH);
  }

  /** Set every EDITABLE skill row to install as a plugin. See `setAllLocal`. */
  async setAllPlugin(): Promise<void> {
    await this.commitPluginOnEveryRow(SOURCE_ROW_WALK_LENGTH);
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
   * `↓` to the next row, `rowCount` times.
   *
   * The per-row equivalent of the bulk `l` key, and the only route to an all-eject install once
   * that key is withdrawn. Four grid facts make the plain walk correct, and each is load-bearing:
   *
   *  - Focus SEEDS on the first focusable row and `↓` SKIPS inert ones (`firstFocusableRowIndex` /
   *    `skipRow`, both on `isRowInert`), and SPACE returns immediately on an inert row. So a
   *    locked global row or a pending-removal row is never reached and never committed — which is
   *    precisely the containment the bulk key did not have.
   *  - Column focus starts at 0, and column 0 IS the `Local` cell (`INSTALL_MODES` order in
   *    `consts.ts`, captioned by `INSTALL_MODE_CELL_LABELS`).
   *  - `↓` PRESERVES the column (`useFocusedListItem` clamps rather than resets), and every row
   *    has the same two cells, so the walk stays on `Local` without re-selecting the column.
   *  - Focus WRAPS, so an over-long walk re-commits `Local` on a row that already has it instead
   *    of running off the end. Overshooting `rowCount` is therefore harmless; undershooting
   *    leaves the remaining rows on their previous mode.
   *
   * Needs a viewport tall enough that the grid does not overflow: with `hiddenBelow > 0`, `↓` on
   * the last focusable row scrolls the viewport instead of moving focus (`SourceGrid`'s overscroll
   * branch) and the walk stalls on that row. Use `TERMINAL_SIZE.TALL`.
   */
  async commitLocalOnEveryRow(rowCount: number): Promise<void> {
    await this.commitFocusedColumnOnEveryRow(rowCount);
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
   * Every caveat on `commitLocalOnEveryRow` applies unchanged, including the `TERMINAL_SIZE.TALL`
   * requirement and the harmlessness of overshooting `rowCount`.
   */
  async commitPluginOnEveryRow(rowCount: number): Promise<void> {
    await this.moveSourceColumnRight();
    await this.commitFocusedColumnOnEveryRow(rowCount);
  }

  /** SPACE on the focused cell, then `↓`, `rowCount` times. The shared body of the two walks. */
  private async commitFocusedColumnOnEveryRow(rowCount: number): Promise<void> {
    for (let index = 0; index < rowCount; index++) {
      await this.waitForWizardFooter();
      await this.pressSpace();
      await this.waitForWizardFooter();
      await this.pressArrowDown();
    }
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
