import type { TerminalSession } from "../helpers/terminal-session.js";
import { delay } from "../helpers/test-utils.js";
import { INTERNAL_DELAYS, INTERNAL_RETRIES, STEP_TEXT, TIMEOUTS } from "./constants.js";
import { retryEnterUntil } from "./retry-enter.js";
import { TerminalScreen } from "./terminal-screen.js";

export abstract class BaseStep {
  protected readonly screen: TerminalScreen;
  protected readonly defaultTimeout: number;

  constructor(
    protected readonly session: TerminalSession,
    protected readonly projectDir: string,
  ) {
    this.screen = new TerminalScreen(session);
    this.defaultTimeout = TIMEOUTS.WIZARD_LOAD;
  }

  protected async pressEnter(): Promise<void> {
    this.session.enter();
    await delay(INTERNAL_DELAYS.STEP_TRANSITION);
  }

  protected async pressSpace(): Promise<void> {
    this.session.space();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  protected async pressKey(key: string): Promise<void> {
    this.session.write(key);
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  protected async pressEscape(): Promise<void> {
    this.session.escape();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  protected async pressArrowDown(): Promise<void> {
    this.session.arrowDown();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  protected async pressArrowUp(): Promise<void> {
    this.session.arrowUp();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  protected async pressArrowRight(): Promise<void> {
    this.session.arrowRight();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  protected async pressCtrlC(): Promise<void> {
    this.session.ctrlC();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  /** Wait for an item to be visible on screen. Scrolls down looking for it, throws if not found. */
  protected async waitForItemVisible(label: string, maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const screen = this.screen.getFullOutput();
      if (screen.includes(label)) {
        // Found the label on screen. Now we need to check if the cursor is on it.
        // We can't easily determine cursor position, so we use a strategy:
        // look at the screen, and if the label appears, press down until we find
        // a line where the cursor indicator (>) is on the same line as the label.
        // For simplicity, since items are rendered with highlight, check if the
        // current screen shows the label — if so, it is accessible.
        return;
      }
      await this.waitForWizardFooter();
      await this.pressArrowDown();
    }
    throw new Error(
      `waitForItemVisible: could not find "${label}" after ${maxAttempts} attempts.\n` +
        `Screen:\n${this.screen.getScreen()}`,
    );
  }

  /**
   * Navigate the cursor to a specific item by label.
   * Unlike waitForItemVisible (which just checks visibility), this method
   * moves the cursor until the focused line (marked with ❯) contains the label.
   */
  protected async navigateCursorToItem(label: string, maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const output = this.screen.getFullOutput();
      const lines = output.split("\n");
      const focusedLine = lines.find((l) => l.includes("❯"));
      if (focusedLine && focusedLine.includes(label)) {
        return;
      }
      await this.waitForWizardFooter();
      await this.pressArrowDown();
    }
    throw new Error(
      `navigateCursorToItem: could not focus "${label}" after ${maxAttempts} attempts.\n` +
        `Screen:\n${this.screen.getScreen()}`,
    );
  }

  /** Wait for a specific step to be visible. */
  protected async waitForStep(stepText: string, timeout?: number): Promise<void> {
    await this.screen.waitForText(stepText, timeout ?? this.defaultTimeout);
  }

  /**
   * Cursor-anchored version of waitForStep. Waits for `stepText` to appear
   * in raw output AFTER `cursor`. Use when a previous wizard step may have
   * left identical text in scrollback (e.g. "API" or "Methodology" tab
   * labels rendered in the build step header for every domain).
   */
  protected async waitForStepAfter(
    stepText: string,
    cursor: number,
    timeout?: number,
  ): Promise<void> {
    await this.screen.waitForTextAfter(stepText, cursor, timeout ?? this.defaultTimeout);
  }

  /**
   * Wait for the wizard footer ("select") to paint. ONLY valid on screens
   * rendered by WizardLayout — which every BaseStep subclass is. Non-wizard
   * page objects (the dashboard, plain SelectList menus) must NOT use this;
   * the sentinel never appears there and the wait burns the full timeout.
   */
  protected async waitForWizardFooter(timeout?: number): Promise<void> {
    await this.screen.waitForWizardFooter(timeout ?? this.defaultTimeout);
  }

  /**
   * Cursor-anchored version of waitForWizardFooter. Waits for the footer
   * sentinel "select" to appear in raw output AFTER `cursor`. The footer
   * is present in every wizard step, so the non-anchored variant returns
   * instantly on scrollback residue.
   */
  protected async waitForWizardFooterAfter(cursor: number, timeout?: number): Promise<void> {
    await this.screen.waitForWizardFooterAfter(cursor, timeout ?? this.defaultTimeout);
  }

  /** Capture raw-output cursor for use with waitForStepAfter / waitForWizardFooterAfter. */
  protected getRawCursor(): number {
    return this.screen.getRawCursor();
  }

  /**
   * Press Enter (with closed-loop retry, see retryEnterUntil) and wait for
   * `nextStepText` to appear AFTER the snapshot cursor.
   *
   * IMPORTANT: the sentinel must be text that is ONLY printed by the next
   * step's first frame — not text that also appears in the current step's
   * footer or tabs. Otherwise this helper returns prematurely on the Enter's
   * own repaint.
   */
  protected async pressEnterAndWaitFor(nextStepText: string): Promise<void> {
    await this.waitForWizardFooter();
    await retryEnterUntil(this.session, this.screen, (cursor) =>
      this.screen.waitForTextAfter(nextStepText, cursor, INTERNAL_RETRIES.INTERVAL_MS),
    );
  }

  /**
   * Shrink the terminal below the wizard's minimum size and wait for the resize
   * prompt to REPLACE the wizard. Waits on the dimension-independent tail of
   * the message, so either a too-narrow or a too-short target settles here.
   *
   * Cursor-anchored: the prompt text survives in scrollback once a session has
   * shrunk before, so a plain `waitForText` would return on residue instead of
   * on this shrink's own repaint.
   */
  async resizeBelowMinimum(cols: number, rows: number): Promise<void> {
    const cursor = this.getRawCursor();
    this.session.resize(cols, rows);
    await this.screen.waitForTextAfter(STEP_TEXT.RESIZE_PROMPT, cursor, this.defaultTimeout);
  }

  /**
   * Resize back to a geometry that clears the minimum and wait for the wizard to
   * repaint. Anchored on the footer sentinel emitted after the resize, not on
   * the copy already in scrollback from before the shrink.
   */
  async resizeAboveMinimum(cols: number, rows: number): Promise<void> {
    const cursor = this.getRawCursor();
    this.session.resize(cols, rows);
    await this.waitForWizardFooterAfter(cursor);
  }

  /** Get the full output including scrollback (for test assertions). */
  getOutput(): string {
    return this.screen.getFullOutput();
  }

  /** Get the visible screen only (for test assertions). */
  getScreen(): string {
    return this.screen.getScreen();
  }

  /**
   * Extract change-summary diff entries for the given display name from the
   * currently-rendered SkillAgentSummary panel. Works for both the confirm
   * step and the build-step info-panel overlay — both render the same
   * component, so the scraped output shape is identical.
   *
   * Each entry pairs the prefix token (`+` new, `-` removed, `~` install mode
   * changed, `•` unchanged) with the scope subsection (`Project` or `Global`)
   * the row appeared under. Callers assert on the (scope, prefix) pairs rather
   * than raw substrings so a P→G toggle can be verified as BOTH
   * `{scope:"Project", prefix:"-"}` AND `{scope:"Global", prefix:"+"}`.
   *
   * The Skills and Agents columns share vertical space, so each ScopeLabel
   * line ("Project" or "Global") applies to both columns simultaneously and
   * columns always render in Project-before-Global order. Tracking the most
   * recent ScopeLabel is therefore correct for either column, provided the
   * caller uses a display name unique to one column — skill display names
   * never collide with agent names in the E2E source.
   */
  async getSummaryDiffEntries(
    displayName: string,
  ): Promise<Array<{ prefix: "+" | "-" | "~" | "\u2022"; scope: "Project" | "Global" }>> {
    await this.waitForWizardFooter();
    const output = this.getOutput();
    const lines = output.split("\n");

    const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const diffRowPattern = new RegExp(`([+\\-~\\u2022])\\s+${escapedName}(?:\\s|$)`);

    const entries: Array<{ prefix: "+" | "-" | "~" | "\u2022"; scope: "Project" | "Global" }> = [];

    // Each line may carry both a Skills-column segment and an Agents-column
    // segment separated by a `│` divider (from SkillAgentSummary's
    // borderRight) and wrapped by outer `│` borders from the enclosing
    // <Box borderStyle="single" />. Split on `│` and treat each column
    // (segment index) independently: a Project / Global sublabel in column
    // N only applies to rows that appear in column N on subsequent lines.
    // This matters because Skills and Agents transition to Global at
    // different vertical positions — a shared tracker would mis-attribute
    // the Skills-column scope after the Agents column's own transition.
    const scopeLabelPattern = /^(Project|Global)$/;
    const scopeByColumn = new Map<number, "Project" | "Global">();

    for (const line of lines) {
      for (const [colIdx, segment] of line.split(/[│┃]/).entries()) {
        const trimmed = segment.trim();
        if (!trimmed) continue;
        const scopeMatch = trimmed.match(scopeLabelPattern);
        if (scopeMatch) {
          scopeByColumn.set(colIdx, scopeMatch[1] as "Project" | "Global");
          continue;
        }

        const match = segment.match(diffRowPattern);
        if (!match) continue;
        const scope = scopeByColumn.get(colIdx);
        if (!scope) continue;
        entries.push({
          prefix: match[1] as "+" | "-" | "~" | "\u2022",
          scope,
        });
      }
    }

    return entries;
  }

  /** Abort the wizard with Ctrl+C. */
  async abort(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressCtrlC();
  }

  /** Navigate down one item (arrow down). */
  async navigateDown(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressArrowDown();
  }

  /** Navigate up one item (arrow up). */
  async navigateUp(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressArrowUp();
  }

  /** Navigate right one item (arrow right). */
  async navigateRight(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressArrowRight();
  }
}
