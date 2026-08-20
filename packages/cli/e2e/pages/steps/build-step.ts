import { delay, E2E_SKILL_TITLES } from "../../helpers/test-utils.js";
import { BaseStep } from "../base-step.js";
import {
  INTERNAL_DELAYS,
  INTERNAL_RETRIES,
  KEYS,
  STEP_TEXT,
  TIMEOUTS,
  type WizardType,
} from "../constants.js";
import { retryEnterUntil } from "../retry-enter.js";
import type { WizardResult } from "../wizard-result.js";
import { SourcesStep } from "./sources-step.js";

const BOX_DRAWING_CHARS = ["│", "┌", "└", "┐", "┘", "─"];

/**
 * Raised when a lap of the grid observed every category and none held the
 * wanted cell. Carries what it walked rather than how many keys it pressed:
 * a press count says the helper gave up, the category list says what the
 * helper actually looked at, which is the difference between "the label is
 * wrong" and "the walk never saw the row".
 */
export class CategoryWalkError extends Error {
  constructor(
    message: string,
    readonly categoriesWalked: readonly string[],
  ) {
    super(message);
    this.name = "CategoryWalkError";
  }
}

/** One visible category section parsed from the current viewport. */
type VisibleCategory = {
  /**
   * The header's own text. The walk's identity for a category: "focus moved"
   * is this changing, which is the only thing that distinguishes a Tab that
   * landed from a repaint that has not arrived yet.
   */
  label: string;
  /** Leading-space count of the header line — the focused header paints one deeper. */
  indent: number;
  /** Cell texts in option order; the flat index IS the grid column. */
  cells: string[];
};

/**
 * Trailing compatibility annotation SkillTag appends after the label
 * (category-grid.tsx getCompatibilityLabel): "(requires X and Y)",
 * "(required by X)", "(incompatible)", "(discouraged)".
 * Anchored to the end of the cell and greedy, so requirement names that
 * themselves contain parentheses stay inside the match. Real display names
 * ("Gel (EdgeDB)") keep their parentheses because they never open with one
 * of these annotation keywords.
 */
const CELL_ANNOTATION = /\s*\((?:requires|required by|incompatible|discouraged)\b.*\)$/;

/**
 * Leading markers a rendered cell can paint before the label: single-letter
 * P/G scope badges (SkillTag) and +/-/check/eject diff glyphs. Each token
 * must be followed by whitespace, so display names beginning with a capital
 * P/G word ("Pinia", "GraphQL") are never clipped.
 */
const CELL_LEADING_MARKERS = /^(?:(?:[PG]|[+\-✓✗⏏])\s+)+/;

/** Accepts whichever category reads as focused — the walk's "just tell me where I am". */
const ANY_FOCUSED_CATEGORY = (): boolean => true;

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

/**
 * The one category on screen when the grid holds nothing else — a scroll
 * affordance in either direction means the grid has more, so a lone visible
 * header is a window rather than the whole thing. Returns it, because every
 * caller wants the category and not the verdict.
 */
function onlyCategoryOfWholeGrid(
  visible: VisibleCategory[],
  screen: string,
): VisibleCategory | null {
  const [only] = visible;
  if (!only || visible.length !== 1) return null;
  const scrolls =
    screen.includes(STEP_TEXT.SCROLL_MORE_ABOVE) || screen.includes(STEP_TEXT.SCROLL_MORE_BELOW);
  return scrolls ? null : only;
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
   * the column to 0 (use-category-grid-input.ts), unlike DOWN. So this method
   * reads the focused header first and Tab-walks only if the target is
   * elsewhere — see {@link walkToCategoryContaining} for why looking before
   * pressing is the difference between a free hit and a lap of the grid — then
   * presses RIGHT to the target column. The RIGHT presses stay open-loop
   * because cell focus is unobservable, but they start from a screen-verified
   * row and a column base the walk states rather than assumes: 0 when it
   * arrived by Tab, the tracked {@link gridCol} when it never moved.
   */
  async focusSkill(skillLabel: string): Promise<void> {
    await this.waitForWizardFooter();

    const visible = await this.waitForVisibleCategories();
    const wholeGrid = onlyCategoryOfWholeGrid(visible, this.getScreen());
    if (wholeGrid) {
      await this.focusColumnInSingleCategory(wholeGrid, skillLabel);
      return;
    }

    const { category, columnBase } = await this.walkToCategoryContaining(skillLabel);
    const targetCol = category.cells.findIndex((cell) => cellLabel(cell) === skillLabel);
    await this.pressRightToColumn(category.cells.length, targetCol, columnBase);
  }

  /**
   * Step the column focus to `targetCol` from a KNOWN base, using the grid's
   * own cyclic-wrap arithmetic (use-focused-list-item.ts). The base is 0 after
   * arriving in a category via Tab, and the tracked {@link gridCol} when the
   * walk never had to move.
   */
  private async pressRightToColumn(
    cellCount: number,
    targetCol: number,
    fromCol: number,
  ): Promise<void> {
    const rights = (targetCol - fromCol + cellCount) % cellCount;
    for (let i = 0; i < rights; i++) {
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
    // Carry each header's own line with its index so the body slice never re-reads it.
    const headers = [...lines.entries()].filter(([i, line]) =>
      isCategoryHeaderLine(line, lines[i + 1]),
    );

    return headers.map(([headerIdx, headerLine], i) => {
      const nextIdx = headers[i + 1]?.[0] ?? lines.length;
      return {
        label: headerLine.trim(),
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
    const [onlyVisible, ...restVisible] = categories;
    if (!onlyVisible) return null;
    if (restVisible.length === 0) return onlyVisible;

    const minIndent = Math.min(...categories.map((category) => category.indent));
    const [onlyDeeper, ...restDeeper] = categories.filter(
      (category) => category.indent === minIndent + 1,
    );
    return onlyDeeper && restDeeper.length === 0 ? onlyDeeper : null;
  }

  /**
   * Find the category holding `skillLabel` and report the column base focus
   * arrives on, LOOKING before it presses anything.
   *
   * The order is the whole point. A walk that presses first steps off a target
   * that is already focused and then owes itself a full lap of the grid to get
   * back — 33 categories against the default catalogue, where the first
   * category is also the likeliest target. Reading the screen first makes that
   * case free, and it is the case the flake lived in.
   *
   * Every advance is CONFIRMED: {@link advanceCategoryFocus} does not return
   * until the screen shows a different category focused, so no category can be
   * walked past while its repaint is still in flight. That is what makes one
   * lap sufficient, and it is why this terminates on having seen a category
   * twice rather than on a press budget — a budget cannot tell "the label is
   * not here" from "I blinked as I went by it", and it reports the number it
   * gave up at either way.
   */
  private async walkToCategoryContaining(
    skillLabel: string,
  ): Promise<{ category: VisibleCategory; columnBase: number }> {
    const holdsTarget = (category: VisibleCategory): boolean =>
      category.cells.some((cell) => cellLabel(cell) === skillLabel);

    let current = await this.waitForFocusedCategory();
    if (holdsTarget(current)) return { category: current, columnBase: this.gridCol };

    const walked = new Set([current.label]);
    for (;;) {
      current = await this.advanceCategoryFocus(current.label);
      if (holdsTarget(current)) return { category: current, columnBase: 0 };
      if (walked.has(current.label)) {
        throw this.noCategoryHolds(skillLabel, [...walked], current.label);
      }
      walked.add(current.label);
    }
  }

  /** Says what a lap of the grid looked at, so a miss reads as a fact not a budget. */
  private noCategoryHolds(
    skillLabel: string,
    walked: string[],
    cameBackTo: string,
  ): CategoryWalkError {
    return new CategoryWalkError(
      `focusSkill: no category holds a cell labelled "${skillLabel}". Walked all ` +
        `${walked.length} categories once and came back to "${cameBackTo}": ${walked.join(", ")}` +
        `\nScreen:\n${this.getScreen()}`,
      walked,
    );
  }

  /** Poll the viewport until exactly one category reads as focused. */
  private async waitForFocusedCategory(): Promise<VisibleCategory> {
    const focused = await this.pollForFocusedCategory(ANY_FOCUSED_CATEGORY);
    if (focused) return focused;
    throw new Error(
      `focusSkill: no category reads as focused on screen.\nScreen:\n${this.getScreen()}`,
    );
  }

  /**
   * Press Tab until the screen SHOWS focus somewhere else. A press that
   * produced no visible move is re-pressed rather than assumed: under load the
   * repaint can arrive after the poll, and a walk that assumes the move looks
   * at the category it just left while standing on the next one — passing its
   * own target unseen.
   */
  private async advanceCategoryFocus(from: string): Promise<VisibleCategory> {
    for (let press = 0; press < INTERNAL_RETRIES.MAX_ATTEMPTS; press++) {
      await this.waitForWizardFooter();
      await this.pressKey(KEYS.TAB);
      const moved = await this.pollForFocusedCategory((category) => category.label !== from);
      if (moved) return moved;
    }
    throw new CategoryWalkError(
      `focusSkill: category focus never left "${from}" across ` +
        `${INTERNAL_RETRIES.MAX_ATTEMPTS} Tab presses.\nScreen:\n${this.getScreen()}`,
      [from],
    );
  }

  /**
   * Re-read the viewport until the focused category satisfies `accept`, or the
   * retry interval runs out. Null means the screen never said so — the caller
   * decides whether that is a re-press or a failure.
   */
  private async pollForFocusedCategory(
    accept: (category: VisibleCategory) => boolean,
  ): Promise<VisibleCategory | null> {
    const deadline = Date.now() + INTERNAL_RETRIES.INTERVAL_MS;
    for (;;) {
      const focused = this.findFocusedCategory(this.parseVisibleCategories());
      if (focused && accept(focused)) return focused;
      if (Date.now() >= deadline) return null;
      await delay(INTERNAL_DELAYS.KEYSTROKE);
    }
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
    await this.pressRightToColumn(category.cells.length, targetCol, this.gridCol);
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
   * Toasts render in an absolutely-positioned row that Ink rewrites in place, so
   * xterm's processed buffer (`getOutput()` / `getScreen()`) has already lost the
   * text by the time a test reads it — a `toContain` on that surface fails even
   * though the process did write the toast. Raw output IS append-only, so the
   * toast survives there.
   *
   * Anchoring on a pre-press cursor is required for two reasons: the footer
   * sentinel is re-emitted on every frame (so `waitForWizardFooterAfter` can fire
   * on a repaint that precedes the toast), and an earlier frame's residue would
   * satisfy a non-anchored raw match.
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
    // Web domain — select the react framework, focused explicitly rather than
    // relying on where the grid opens. The label is the TITLE the E2E fixture gives
    // that skill, read from the fixture's own map — not the namespaced id it
    // publishes the skill under, and not a literal that would have to be edited in
    // step with it.
    await this.screen.waitForText(STEP_TEXT.DOMAIN_WEB, TIMEOUTS.WIZARD_LOAD);
    await this.focusSkill(E2E_SKILL_TITLES.react);
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

  /**
   * Press "f", which the build step no longer binds to anything — incompatible-skill
   * filtering was withdrawn. Kept so a spec can assert the key is inert rather than
   * assume it.
   */
  async pressFilterIncompatibleHotkey(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("f");
    await this.waitForWizardFooter();
  }

  /**
   * Toggle the build-step info-panel overlay (press "i"). The overlay replaces
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
    for (const line of [...lines].reverse()) {
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
    for (const line of [...lines].reverse()) {
      const [, selectedCount] = line.match(pattern) ?? [];
      if (selectedCount !== undefined) return Number(selectedCount);
    }
    throw new Error(
      `getExclusiveCategorySelectedCount: no "(N of M)" counter for category ` +
        `"${categoryDisplayName}" found on screen.\nOutput:\n${output}`,
    );
  }
}
