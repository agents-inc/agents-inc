import { BaseStep } from "../base-step.js";
import { INTERNAL_DELAYS, INTERNAL_RETRIES, STEP_TEXT, TIMEOUTS } from "../constants.js";
import { SearchModal } from "./search-modal.js";
import { SourcesStep } from "./sources-step.js";

export class BuildStep extends BaseStep {
  /** Tracked grid position — row resets on domain change, col resets on Tab/DOWN */
  private gridRow = 0;
  private gridCol = 0;

  /** Advance current domain without changes (Enter). */
  async advanceDomain(): Promise<void> {
    await this.waitForStableRender();
    await this.pressEnterWaitNewFrame();
    this.gridRow = 0;
    this.gridCol = 0;
  }

  /**
   * Press Enter and wait for the NEXT frame's footer to paint AFTER the cursor
   * snapshot. Retries with INTERNAL_RETRIES budget to absorb dropped keystrokes
   * when Ink's useInput handler for the incoming frame is not yet mounted.
   *
   * Used for build-step domain → domain transitions, where both the current
   * and next frame render the same tab labels ("Web | API | Methodology") in
   * scrollback — so scrollback-matched waits fire instantly on stale residue.
   * The footer "select" IS re-emitted on every fresh paint, so anchoring on
   * raw-output position after the cursor snapshot correctly detects a new
   * frame without depending on domain-specific text.
   */
  private async pressEnterWaitNewFrame(): Promise<void> {
    let lastError: unknown;
    for (let i = 0; i < INTERNAL_RETRIES.MAX_ATTEMPTS; i++) {
      const cursor = this.getRawCursor();
      this.session.enter();
      await this.delay(INTERNAL_DELAYS.STEP_TRANSITION);
      try {
        await this.waitForStableRenderAfter(cursor, INTERNAL_RETRIES.INTERVAL_MS);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Navigate focus to a skill by label in the grid (without pressing Space).
   *
   * Parses the screen to find the skill's (row, col) position,
   * navigates DOWN to the target category (which resets col to 0),
   * then RIGHT to the target column. Use before `toggleScopeOnFocusedSkill()`
   * or `toggleFocusedSkill()` when you need to act on a specific skill.
   */
  async focusSkill(skillLabel: string): Promise<void> {
    const { row, col, totalRows } = this.findSkillGridPosition(skillLabel);

    // Navigate DOWN to target row (DOWN always resets col to 0)
    // Normalize gridRow first — it may exceed totalRows after navigateToNextCategory calls
    const currentRow = this.gridRow % totalRows;
    const downs = (row - currentRow + totalRows) % totalRows;
    for (let i = 0; i < downs; i++) {
      await this.pressArrowDown();
    }
    this.gridRow = row;
    this.gridCol = 0;

    // Navigate RIGHT to target column
    for (let i = 0; i < col; i++) {
      await this.pressArrowRight();
    }
    this.gridCol = col;
  }

  /**
   * Navigate to a skill by label in the grid and press Space to toggle selection.
   */
  async selectSkill(skillLabel: string): Promise<void> {
    await this.focusSkill(skillLabel);
    await this.pressSpace();
  }

  /** Toggle the currently focused skill selection (Space). */
  async toggleFocusedSkill(): Promise<void> {
    await this.pressSpace();
  }

  /** Toggle scope on the currently focused skill (press "s"). */
  async toggleScopeOnFocusedSkill(): Promise<void> {
    await this.waitForStableRender();
    await this.pressKey("s");
  }

  /**
   * Pass through all domains one by one, then advance to SourcesStep.
   * Expects Web, API, and Methodology domains (matches the standard E2E source).
   *
   * Uses cursor-anchored waits between each Enter: the build step's tab
   * labels ("Web | API | Methodology") are rendered in every domain frame,
   * so a scrollback-matched waitForText would match stale residue from the
   * previous frame and return before the new domain has actually painted.
   */
  async passThroughAllDomains(): Promise<SourcesStep> {
    // Initial Web frame must be fully painted before we start (guaranteed by
    // the wizard launcher, but re-checked here for robustness).
    await this.screen.waitForText(STEP_TEXT.BUILD, TIMEOUTS.WIZARD_LOAD);
    await this.waitForStableRender();

    // Web -> API
    await this.pressEnterWaitNewFrame();
    // API -> Methodology
    await this.pressEnterWaitNewFrame();
    // Methodology -> Sources step
    await this.pressEnterWaitNewFrame();

    return new SourcesStep(this.session, this.projectDir);
  }

  /**
   * Pass through all domains dynamically — keeps pressing Enter until Sources step appears.
   * Use for non-standard sources (e.g., real marketplace) where domain count is unknown.
   */
  async passThroughAllDomainsGeneric(): Promise<SourcesStep> {
    await this.waitForStableRender();
    for (let i = 0; i < 10; i++) {
      await this.pressEnterWaitNewFrame();
      // The Sources step emits a distinct sentinel that does NOT appear in
      // any build-step frame — safe to check on full output here.
      const output = this.screen.getFullOutput();
      if (output.includes(STEP_TEXT.SOURCES)) {
        return new SourcesStep(this.session, this.projectDir);
      }
    }
    throw new Error(
      "passThroughAllDomainsGeneric: did not reach Sources step after 10 Enter presses",
    );
  }

  /**
   * Pass through scratch domains (Web, API, Mobile) one by one.
   * Web needs a skill selected (Space). API's required skill is auto-selected.
   * Mobile has no E2E source skills ("No categories to display"), just advance.
   */
  async passThroughScratchDomains(): Promise<SourcesStep> {
    // Web domain — select required skill
    await this.screen.waitForText(STEP_TEXT.DOMAIN_WEB, TIMEOUTS.WIZARD_LOAD);
    await this.waitForStableRender();
    await this.pressSpace();
    await this.pressEnterWaitNewFrame();

    // API domain — select required skill. pressEnterWaitNewFrame above
    // already confirmed the new frame painted, so Space is safe to press.
    await this.pressSpace();
    await this.pressEnterWaitNewFrame();

    // Mobile domain — no skills in E2E source, just advance to Sources
    await this.pressEnterWaitNewFrame();

    return new SourcesStep(this.session, this.projectDir);
  }

  /**
   * Pass through Web and Methodology domains (when API is deselected).
   */
  async passThroughWebAndMethodologyDomains(): Promise<SourcesStep> {
    await this.screen.waitForText(STEP_TEXT.BUILD, TIMEOUTS.WIZARD_LOAD);
    await this.waitForStableRender();

    // Web -> Methodology
    await this.pressEnterWaitNewFrame();
    // Methodology -> Sources step
    await this.pressEnterWaitNewFrame();

    return new SourcesStep(this.session, this.projectDir);
  }

  /**
   * Advance through the current domain and go to SourcesStep.
   * Use when the project has only one domain.
   */
  async advanceToSources(): Promise<SourcesStep> {
    await this.waitForStableRender();
    await this.pressEnterWaitNewFrame();
    return new SourcesStep(this.session, this.projectDir);
  }

  /** Navigate to the next category within the current domain (Tab). */
  async navigateToNextCategory(): Promise<void> {
    await this.pressKey("\t");
    this.gridRow++;
    this.gridCol = 0;
    await this.waitForStableRender();
  }

  /** Toggle compatibility labels on focused skill (press "d"). */
  async toggleLabels(): Promise<void> {
    await this.pressKey("d");
  }

  /** Open the search modal (press "/"). */
  async openSearch(): Promise<SearchModal> {
    await this.pressKey("/");
    return new SearchModal(this.session, this.projectDir);
  }

  /** Toggle filter incompatible skills (press "f"). */
  async toggleFilterIncompatible(): Promise<void> {
    await this.pressKey("f");
    await this.waitForStableRender();
  }

  /**
   * Toggle the build-step info-panel overlay (press "i"). Gated by the
   * `FEATURE_FLAGS.INFO_PANEL` runtime flag in the wizard; callers should
   * only invoke this when the flag is on. When shown, the overlay replaces
   * the build-step body and renders a full SkillAgentSummary — callers can
   * then use `getSummaryDiffEntries()` to inspect the live diff.
   */
  async toggleInfoPanel(): Promise<void> {
    await this.waitForStableRender();
    await this.pressKey("i");
    await this.waitForStableRender();
  }

  /** Go back to domain step (Escape). */
  async goBack(): Promise<void> {
    await this.pressEscape();
  }

  /**
   * Extract the rendered scope badges (in display order) for a specific skill
   * in the current build-step grid.
   *
   * A single-scope install renders one badge (" P " or " G "), concatenated
   * directly to a trailing space before the skill name. A dual-scope install
   * (active + excluded tombstone at the other scope) renders BOTH badges
   * back-to-back. Returns ["P"], ["G"], ["P", "G"], ["G", "P"], or [] for
   * an unscoped skill.
   *
   * Scans each │-delimited cell for a "(space)(letter)(space)" token pattern
   * in the prefix before the skill label. The P/G letters are the only single
   * capital letters emitted by SkillTag; category headers and borders never
   * produce them.
   *
   * Requires a stable render — callers should ensure the build step has
   * finished any pending redraws before invoking.
   */
  async getScopeBadgesForSkill(skillLabel: string): Promise<Array<"P" | "G">> {
    await this.waitForStableRender();
    const output = this.getOutput();
    const lines = output.split("\n");
    // Walk newest-to-oldest so re-opened wizards pick up the most recent
    // frame's badges instead of stale scrollback from a previous launch.
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.includes(skillLabel) || !line.includes("│")) continue;
      const segments = line.split("│");
      for (const segment of segments) {
        const nameIdx = segment.indexOf(skillLabel);
        if (nameIdx === -1) continue;
        const prefix = segment.slice(0, nameIdx);
        return Array.from(prefix.matchAll(/\s([PG])\s/g)).map((match) => match[1] as "P" | "G");
      }
    }
    throw new Error(
      `getScopeBadgesForSkill: "${skillLabel}" not found in any │-delimited cell.\n` +
        `Output:\n${output}`,
    );
  }

  /**
   * Parse the screen to find a skill's grid position (row, col).
   *
   * Category headers are non-empty text lines without box-drawing chars,
   * immediately followed by a `┌` line. This pattern only matches skill
   * category headers — step tabs, domain tabs, and info panels don't have
   * text headers before their `┌` borders.
   */
  private findSkillGridPosition(label: string): { row: number; col: number; totalRows: number } {
    const output = this.getOutput();
    const lines = output.split("\n");

    // Find category headers: non-empty text lines without box-drawing chars,
    // immediately followed by a ┌ line.
    const categoryHeaders: number[] = [];
    for (let i = 0; i < lines.length - 1; i++) {
      const trimmed = lines[i].trim();
      if (
        trimmed.length > 0 &&
        !trimmed.includes("│") &&
        !trimmed.includes("┌") &&
        !trimmed.includes("└") &&
        !trimmed.includes("┐") &&
        !trimmed.includes("┘") &&
        !trimmed.includes("─") &&
        lines[i + 1]?.trimStart().startsWith("┌")
      ) {
        categoryHeaders.push(i);
      }
    }

    if (categoryHeaders.length === 0) {
      throw new Error(
        `findSkillGridPosition: no category headers found on screen.\n` +
          `Output:\n${this.getOutput()}`,
      );
    }

    // Find which category contains the label and its column position
    for (let row = 0; row < categoryHeaders.length; row++) {
      const headerIdx = categoryHeaders[row];
      const nextHeaderIdx =
        row + 1 < categoryHeaders.length ? categoryHeaders[row + 1] : lines.length;

      // Collect content lines (│ lines) within this category's range
      let colOffset = 0;
      for (let i = headerIdx + 1; i < nextHeaderIdx; i++) {
        if (!lines[i].includes("│")) continue;

        const segments = lines[i].split("│").filter((s) => s.trim().length > 0);
        const segIdx = segments.findIndex((s) => s.includes(label));
        if (segIdx !== -1) {
          return {
            row,
            col: colOffset + segIdx,
            totalRows: categoryHeaders.length,
          };
        }
        colOffset += segments.length;
      }
    }

    throw new Error(
      `findSkillGridPosition: "${label}" not found in any category.\n` +
        `Output:\n${this.getOutput()}`,
    );
  }
}
