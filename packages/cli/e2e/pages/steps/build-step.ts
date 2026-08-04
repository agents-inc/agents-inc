import { delay } from "../../helpers/test-utils.js";
import { BaseStep } from "../base-step.js";
import {
  INTERNAL_DELAYS,
  INTERNAL_RETRIES,
  STEP_TEXT,
  TIMEOUTS,
  type WizardType,
} from "../constants.js";
import { retryEnterUntil } from "../retry-enter.js";
import type { WizardResult } from "../wizard-result.js";
import { SearchModal } from "./search-modal.js";
import { SourcesStep } from "./sources-step.js";

const BOX_DRAWING_CHARS = ["│", "┌", "└", "┐", "┘", "─"];

/**
 * Bound on the closed-loop Tab-walk in focusSkill. Tab wraps, so one full
 * cycle visits every category; 30 covers any realistic per-domain category
 * count (real-marketplace domains included) plus swallowed-keystroke retries.
 */
const MAX_FOCUS_ATTEMPTS = 30;

/** One visible category section parsed from the current viewport. */
type VisibleCategory = {
  /** Leading-space count of the header line — the focused header paints one deeper. */
  indent: number;
  /** Cell texts in option order; the flat index IS the grid column. */
  cells: string[];
};

/**
 * Trailing compatibility annotation SkillTag appends after the label
 * (category-grid.tsx getCompatibilityLabel): "(requires X and Y)",
 * "(required by X)", "(incompatible)", "(recommended)", "(discouraged)".
 * Anchored to the end of the cell and greedy, so requirement names that
 * themselves contain parentheses stay inside the match. Real display names
 * ("Gel (EdgeDB)") keep their parentheses because they never open with one
 * of these annotation keywords.
 */
const CELL_ANNOTATION = /\s*\((?:requires|required by|incompatible|recommended|discouraged)\b.*\)$/;

/**
 * Leading markers a rendered cell can paint before the label: single-letter
 * P/G scope badges (SkillTag) and +/-/check/eject diff glyphs. Each token
 * must be followed by whitespace, so display names beginning with a capital
 * P/G word ("Pinia", "GraphQL") are never clipped.
 */
const CELL_LEADING_MARKERS = /^(?:(?:[PG]|[+\-✓✗⏏])\s+)+/;

/**
 * The EXACT rendered skill label of a │-delimited grid cell: scope badges,
 * diff markers, and compatibility annotations stripped, whitespace trimmed.
 * Matching labels via this (instead of `cell.includes(label)`) keeps labels
 * that are substrings of other labels unambiguous — "React" must never match
 * a "React Query" cell, nor "Vite" a "Vitest" cell.
 */
function cellLabel(cell: string): string {
  return cell.trim().replace(CELL_LEADING_MARKERS, "").replace(CELL_ANNOTATION, "").trim();
}

/**
 * Category headers are non-empty text lines without box-drawing chars,
 * immediately followed by a `┌` line. This pattern only matches skill
 * category headers — step tabs, domain tabs, and info panels don't have
 * text headers before their `┌` borders.
 */
function isCategoryHeaderLine(line: string, nextLine: string | undefined): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    BOX_DRAWING_CHARS.every((char) => !trimmed.includes(char)) &&
    (nextLine?.trimStart().startsWith("┌") ?? false)
  );
}

export class BuildStep extends BaseStep {
  /**
   * Tracked grid column — a best-effort HINT consulted ONLY by the
   * single-category fallback in focusSkill, where cell focus has no
   * text-observable signal to close the loop on. Reset on domain change
   * (the store seeds focus to (0,0)) and on Tab (the grid resets col to 0).
   */
  private gridCol = 0;

  /** Advance current domain without changes (Enter). */
  async advanceDomain(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressEnterWaitNewFrame();
    this.gridCol = 0;
  }

  /**
   * Press Enter (with closed-loop retry, see retryEnterUntil) and wait for the
   * NEXT frame's footer to paint AFTER the cursor snapshot.
   *
   * Used for build-step domain → domain transitions, where both the current
   * and next frame render the same tab labels ("Web | API | Methodology") in
   * scrollback — so scrollback-matched waits fire instantly on stale residue.
   * The footer "select" IS re-emitted on every fresh paint, so anchoring on
   * raw-output position after the cursor snapshot correctly detects a new
   * frame without depending on domain-specific text.
   */
  private async pressEnterWaitNewFrame(): Promise<void> {
    await this.waitForWizardFooter();
    await retryEnterUntil(this.session, this.screen, (cursor) =>
      this.waitForWizardFooterAfter(cursor, INTERNAL_RETRIES.INTERVAL_MS),
    );
  }

  /**
   * Navigate focus to a skill by label in the grid (without pressing Space).
   * Use before `toggleScopeOnFocusedSkill()` or `toggleFocusedSkill()` when
   * you need to act on a specific skill.
   *
   * `skillLabel` must be the EXACT rendered display title of the skill (see
   * cellLabel) — substring matching is deliberately not supported, because a
   * label like "React" would stop the walk on a "React Query" cell in an
   * earlier category.
   *
   * CLOSED-LOOP: never dead-reckons rows and never assumes arrow-DOWN resets
   * the column (the real grid PRESERVES/CLAMPS it — use-focused-list-item.ts),
   * which made a second focusSkill in the same domain land on the wrong cell.
   * Under NO_COLOR the focused CELL has no text signal (only border colors
   * distinguish it, and those are stripped), but the focused CATEGORY header
   * does: it paints with one extra leading space (the padding of its
   * background highlight). Tab moves focus to the next category AND resets
   * the column to 0 (use-category-grid-input.ts), unlike DOWN. So this
   * method Tab-walks the category focus — re-reading the rendered screen
   * after every press until the header of the category containing the target
   * skill is the focused one — then presses RIGHT from the guaranteed col-0
   * base to the target column. The RIGHT presses stay open-loop because cell
   * focus is unobservable, but they start from a screen-verified (row, 0).
   */
  async focusSkill(skillLabel: string): Promise<void> {
    await this.waitForWizardFooter();

    const visible = await this.waitForVisibleCategories();
    const screen = this.getScreen();
    const isSingleCategoryGrid =
      visible.length === 1 &&
      !screen.includes(STEP_TEXT.SCROLL_MORE_ABOVE) &&
      !screen.includes(STEP_TEXT.SCROLL_MORE_BELOW);

    if (isSingleCategoryGrid) {
      await this.focusColumnInSingleCategory(visible[0], skillLabel);
      return;
    }

    const focused = await this.tabToCategoryContaining(skillLabel);
    const targetCol = focused.cells.findIndex((cell) => cellLabel(cell) === skillLabel);
    // Arriving via Tab reset the column to 0 — walk right to the target.
    for (let i = 0; i < targetCol; i++) {
      await this.waitForWizardFooter();
      await this.pressArrowRight();
    }
    this.gridCol = targetCol;
  }

  /**
   * Parse the CURRENT viewport (not scrollback — stale frames repeat the same
   * headers) into category sections. Category headers are matched by
   * isCategoryHeaderLine; each section's cells are the │-delimited segments
   * of the lines up to the next header, flattened in option order.
   */
  private parseVisibleCategories(): VisibleCategory[] {
    const lines = this.getScreen().split("\n");
    const headerIdxs = lines
      .map((line, i) => (isCategoryHeaderLine(line, lines[i + 1]) ? i : -1))
      .filter((i) => i !== -1);

    return headerIdxs.map((headerIdx, i) => {
      const nextIdx = headerIdxs[i + 1] ?? lines.length;
      const headerLine = lines[headerIdx];
      return {
        indent: headerLine.length - headerLine.trimStart().length,
        cells: lines
          .slice(headerIdx + 1, nextIdx)
          .filter((line) => line.includes("│"))
          .flatMap((line) => line.split("│").filter((segment) => segment.trim().length > 0)),
      };
    });
  }

  /** Poll the viewport until at least one category header is painted. */
  private async waitForVisibleCategories(): Promise<VisibleCategory[]> {
    const deadline = Date.now() + INTERNAL_RETRIES.INTERVAL_MS;
    for (;;) {
      const visible = this.parseVisibleCategories();
      if (visible.length > 0) return visible;
      if (Date.now() >= deadline) {
        throw new Error(
          `focusSkill: no category headers found on screen.\nScreen:\n${this.getScreen()}`,
        );
      }
      await delay(INTERNAL_DELAYS.KEYSTROKE);
    }
  }

  /**
   * Identify the focused category among the visible ones. The focused header
   * renders as a single background-highlighted text with a leading padding
   * space, so it sits exactly one column deeper than unfocused headers.
   * A single visible header must be the focused one (section scroll always
   * keeps the focused section in view). Returns null when the frame is
   * ambiguous (e.g. mid-repaint) so the caller can re-read.
   */
  private findFocusedCategory(categories: VisibleCategory[]): VisibleCategory | null {
    if (categories.length === 0) return null;
    if (categories.length === 1) return categories[0];
    const minIndent = Math.min(...categories.map((category) => category.indent));
    const deeper = categories.filter((category) => category.indent === minIndent + 1);
    return deeper.length === 1 ? deeper[0] : null;
  }

  /**
   * Tab-walk the category focus until the focused category has a cell whose
   * exact label (cellLabel) is `skillLabel`, verifying the focused header
   * from the rendered screen after every press. Swallowed keystrokes and slow repaints self-correct: a press
   * that produced no fresh frame within the retry interval is simply followed
   * by a re-read, and Tab wraps, so the walk revisits every category each
   * cycle. Always presses Tab at least once — entering the category via Tab
   * is what guarantees the column reset to 0, even when the target category
   * was already focused with a stale column from an earlier focusSkill.
   */
  private async tabToCategoryContaining(skillLabel: string): Promise<VisibleCategory> {
    for (let attempt = 0; attempt < MAX_FOCUS_ATTEMPTS; attempt++) {
      await this.waitForWizardFooter();
      const cursor = this.getRawCursor();
      await this.pressKey("\t");
      try {
        await this.waitForWizardFooterAfter(cursor, INTERNAL_RETRIES.INTERVAL_MS);
      } catch {
        // No fresh frame — the Tab may have been swallowed under load, or the
        // repaint is slow. The re-read below decides; the next iteration
        // presses again if focus did not move.
      }
      const focused = this.findFocusedCategory(this.parseVisibleCategories());
      if (focused?.cells.some((cell) => cellLabel(cell) === skillLabel)) {
        return focused;
      }
    }
    throw new Error(
      `focusSkill: category containing "${skillLabel}" was not focused after ` +
        `${MAX_FOCUS_ATTEMPTS} Tab presses.\nScreen:\n${this.getScreen()}`,
    );
  }

  /**
   * Focus a column when the grid has a single category. Tab is a guarded
   * no-op there (use-category-grid-input.ts skips setFocused when the next
   * section equals the current), so the Tab-walk cannot reset the column.
   * A single-cell category needs no navigation — the grid clamps the column
   * to 0. Multi-cell categories fall back to the tracked column with the
   * grid's real cyclic-wrap arithmetic; this is the one spot with no
   * text-observable signal to close the loop on (single-category domains
   * in the standard E2E source are all single-cell, so the fallback is
   * effectively unreachable there).
   */
  private async focusColumnInSingleCategory(
    category: VisibleCategory,
    skillLabel: string,
  ): Promise<void> {
    const targetCol = category.cells.findIndex((cell) => cellLabel(cell) === skillLabel);
    if (targetCol === -1) {
      throw new Error(
        `focusSkill: "${skillLabel}" not found in the only visible category.\n` +
          `Screen:\n${this.getScreen()}`,
      );
    }
    if (category.cells.length === 1) {
      this.gridCol = 0;
      return;
    }
    const rights = (targetCol - this.gridCol + category.cells.length) % category.cells.length;
    for (let i = 0; i < rights; i++) {
      await this.waitForWizardFooter();
      await this.pressArrowRight();
    }
    this.gridCol = targetCol;
  }

  /**
   * Navigate to a skill by label in the grid and press Space to toggle selection.
   */
  async selectSkill(skillLabel: string): Promise<void> {
    await this.focusSkill(skillLabel);
    await this.waitForWizardFooter();
    await this.pressSpace();
  }

  /** Toggle the currently focused skill selection (Space). */
  async toggleFocusedSkill(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressSpace();
  }

  /**
   * Press Space on the focused skill and wait for `sentinel` in RAW PTY output
   * emitted after the press.
   *
   * Use instead of `toggleFocusedSkill()` whenever the assertion is on a TOAST.
   * See `toggleFilterIncompatibleAwaiting` for why the processed buffer is the
   * wrong surface for a toast and why anchoring on a pre-press cursor is
   * required rather than a bare raw match.
   */
  async toggleFocusedSkillAwaiting(sentinel: string): Promise<void> {
    await this.waitForWizardFooter();
    const cursor = this.getRawCursor();
    await this.pressSpace();
    await this.screen.waitForTextAfter(sentinel, cursor, this.defaultTimeout);
  }

  /**
   * Navigate to a skill by label, press Space, and wait for `sentinel` in RAW
   * PTY output emitted after the press. Toast-asserting counterpart of
   * `selectSkill` — the navigation keystrokes happen BEFORE the cursor
   * snapshot, so only the Space press's own output is anchored.
   */
  async selectSkillAwaiting(skillLabel: string, sentinel: string): Promise<void> {
    await this.focusSkill(skillLabel);
    await this.toggleFocusedSkillAwaiting(sentinel);
  }

  /**
   * Toggle scope on the currently focused skill (press "s").
   *
   * `focusedSkillId` is seeded synchronously by the wizard store at build-step
   * entry and on every domain change (`seedFocusedSkillForActiveDomain`), so the
   * `s` handler in `wizard.tsx`'s HOTKEY_SCOPE branch resolves the visually-
   * focused skill as soon as the frame paints — no post-mount effect to await.
   */
  async toggleScopeOnFocusedSkill(): Promise<void> {
    await this.waitForWizardFooter();
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
    await this.waitForWizardFooter();

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
    await this.waitForWizardFooter();
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
    // Web domain — select the react framework. Options render alphabetically by
    // displayName, so the first-focused cell is Vue, not react; focus react
    // explicitly (its E2E display title is the id "web-framework-react").
    await this.screen.waitForText(STEP_TEXT.DOMAIN_WEB, TIMEOUTS.WIZARD_LOAD);
    await this.focusSkill("web-framework-react");
    await this.pressSpace();
    await this.pressEnterWaitNewFrame();

    // API domain — select required skill.
    await this.waitForWizardFooter();
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
    await this.waitForWizardFooter();

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
    await this.waitForWizardFooter();
    await this.pressEnterWaitNewFrame();
    return new SourcesStep(this.session, this.projectDir);
  }

  /**
   * Run the DEFAULT remaining flow from a single-domain build step through to
   * install: Build -> Sources -> Agents -> Confirm -> confirm().
   *
   * ONLY valid where the sources step is passed through WITHOUT mutation and
   * the agents step is accepted with defaults. Sites that call setAllLocal /
   * setAllPlugin / moveSourceColumnRight / selectFocusedSourceCell on the
   * sources step, or navigate/toggle scope on the agents step, or that stop
   * at the confirm screen instead of confirming, MUST keep the explicit
   * step-by-step sequence — this method would silently skip their mutation.
   */
  async saveFromBuild(wizardType: WizardType): Promise<WizardResult> {
    const sources = await this.advanceToSources();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults(wizardType);
    return confirm.confirm();
  }

  /** Navigate to the next category within the current domain (Tab). */
  async navigateToNextCategory(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("\t");
    this.gridCol = 0;
    await this.waitForWizardFooter();
  }

  /** Toggle compatibility labels on focused skill (press "d"). */
  async toggleLabels(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("d");
  }

  /** Open the search modal (press "/"). */
  async openSearch(): Promise<SearchModal> {
    await this.waitForWizardFooter();
    await this.pressKey("/");
    return new SearchModal(this.session, this.projectDir);
  }

  /** Toggle filter incompatible skills (press "f"). */
  async toggleFilterIncompatible(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("f");
    await this.waitForWizardFooter();
  }

  /**
   * Press F and wait for `sentinel` in RAW PTY output emitted after the press.
   *
   * Use instead of `toggleFilterIncompatible()` whenever the assertion is on a
   * TOAST. Toasts render in an absolutely-positioned row that Ink rewrites in
   * place, so xterm's processed buffer (`getOutput()` / `getScreen()`) has
   * already lost the text by the time a test reads it — a `toContain` on that
   * surface fails even though the process did write the toast. Raw output IS
   * append-only, so the toast survives there.
   *
   * Anchoring on a pre-press cursor is required for two reasons: the footer
   * sentinel is re-emitted on every frame (so `waitForWizardFooterAfter` can
   * fire on a repaint that precedes the toast), and an earlier frame's residue
   * would satisfy a non-anchored raw match.
   */
  async toggleFilterIncompatibleAwaiting(sentinel: string): Promise<void> {
    await this.waitForWizardFooter();
    const cursor = this.getRawCursor();
    await this.pressKey("f");
    await this.screen.waitForTextAfter(sentinel, cursor, this.defaultTimeout);
  }

  /**
   * Toggle the build-step info-panel overlay (press "i"). Gated by the
   * `FEATURE_FLAGS.INFO_PANEL` runtime flag in the wizard; callers should
   * only invoke this when the flag is on. When shown, the overlay replaces
   * the build-step body and renders a full SkillAgentSummary — callers can
   * then use `getSummaryDiffEntries()` to inspect the live diff.
   */
  async toggleInfoPanel(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("i");
    await this.waitForWizardFooter();
  }

  /** Go back to domain step (Escape). */
  async goBack(): Promise<void> {
    await this.waitForWizardFooter();
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
    await this.waitForWizardFooter();
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
   * Read the live "(selected of total)" selection counter that an EXCLUSIVE
   * category header renders (e.g. `Framework * (1 of 1)`). Returns the selected
   * count — the number the grid currently treats as chosen in that category,
   * derived from the option `selected` flags (NOT from the scope badges).
   *
   * This is the only text-observable signal of a skill's in-grid selected
   * state: the E2E harness runs with NO_COLOR, so the teal/dim color that also
   * distinguishes selected rows is stripped from captured output. The scope
   * badge (` G `/` P `) is a separate element sourced from `skillConfigs.scope`,
   * so it can disagree with this counter when `domainSelections` and
   * `skillConfigs` diverge.
   *
   * Matches the display name only when it heads a `(N of M)` counter, so
   * "Framework" never collides with "Meta-Framework" (the `-` before the inner
   * "Framework" fails the leading word boundary). Walks newest-to-oldest so a
   * re-opened wizard reads the latest frame, not stale scrollback.
   *
   * Requires a stable render — callers should ensure the build step has
   * finished any pending redraws before invoking.
   */
  async getExclusiveCategorySelectedCount(categoryDisplayName: string): Promise<number> {
    await this.waitForWizardFooter();
    const output = this.getOutput();
    const escaped = categoryDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\s)${escaped}\\s*\\*?\\s*\\((\\d+) of (\\d+)\\)`);
    const lines = output.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(pattern);
      if (match) return Number(match[1]);
    }
    throw new Error(
      `getExclusiveCategorySelectedCount: no "(N of M)" counter for category ` +
        `"${categoryDisplayName}" found on screen.\nOutput:\n${output}`,
    );
  }
}
