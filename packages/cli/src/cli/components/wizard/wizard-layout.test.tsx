import { Text } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WizardLayout } from "./wizard-layout";
import { LOGO_MIN_TERMINAL_ROWS, MIN_TERMINAL_SIZE } from "../../consts";
import { useWizardStore } from "../../stores/wizard-store";
import type { StartupMessage } from "../../utils/logger";
import { sourceUnreachableUsingCache } from "../../utils/messages";
import { formatTerminalTooSmallMessage } from "../../utils/terminal";
import { RENDER_DELAY_MS, delay } from "../../lib/__tests__/test-constants";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { REACT_HONO_FRAMEWORK_API_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";

/** Text only the wizard's own children paint, so its absence proves they were replaced. */
const CHILD_MARKER = "STEP BODY";
/** Wizard chrome WizardLayout itself paints: a step tab and the footer hotkey hint. */
const TAB_LABEL = "Stack";
const FOOTER_LABEL = "select";
/** Stands in for `ASCII_LOGO`: the layout takes the art as an opaque string. */
const LOGO_MARKER = "ASCII LOGO ART";

/**
 * The subtitle the layout heads the sources step with, mirrored as a literal for the same
 * reason `e2e/pages/constants.ts` mirrors it: an assertion that imports the very constant
 * the component renders cannot fail when that constant changes.
 */
const SOURCES_STEP_SUBTITLE = "Customize skill sources";

const VERSION = "9.9.9";

const TOO_NARROW = { columns: MIN_TERMINAL_SIZE.COLS - 1, rows: MIN_TERMINAL_SIZE.ROWS + 10 };
const TOO_SHORT = { columns: MIN_TERMINAL_SIZE.COLS + 20, rows: MIN_TERMINAL_SIZE.ROWS - 1 };
/** Exactly the gate — the geometry `TERMINAL_SIZE.SHORT` drives the E2E suite at. */
const AT_MINIMUM = { columns: MIN_TERMINAL_SIZE.COLS, rows: MIN_TERMINAL_SIZE.ROWS };
const ROOMY = { columns: MIN_TERMINAL_SIZE.COLS + 20, rows: MIN_TERMINAL_SIZE.ROWS + 20 };
/** Exactly the logo threshold, and one row under it — the two sides of the boundary. */
const AT_LOGO_MINIMUM = { columns: MIN_TERMINAL_SIZE.COLS, rows: LOGO_MIN_TERMINAL_ROWS };
const BELOW_LOGO_MINIMUM = { columns: MIN_TERMINAL_SIZE.COLS, rows: LOGO_MIN_TERMINAL_ROWS - 1 };
/** Comfortably over the logo threshold, so height cannot be why a logo is missing. */
const ABOVE_LOGO_MINIMUM = { columns: MIN_TERMINAL_SIZE.COLS, rows: LOGO_MIN_TERMINAL_ROWS + 10 };

type TestStdout = ReturnType<typeof render>["stdout"];

/**
 * Restate the terminal geometry the way a real resize does — `useTerminalDimensions`
 * re-reads `stdout.columns`/`stdout.rows` on the `resize` event. `columns` is a
 * prototype getter on the ink-testing-library stub, so it takes an own property
 * to shadow it; `rows` is absent there entirely.
 */
function resizeTo(stdout: TestStdout, { columns, rows }: { columns: number; rows: number }): void {
  Object.defineProperty(stdout, "columns", { value: columns, configurable: true });
  Object.defineProperty(stdout, "rows", { value: rows, configurable: true });
  stdout.emit("resize");
}

/**
 * Ink drives a concurrent React root, so effects have NOT flushed when
 * `render()` returns — resizing before the first paint settles emits into a
 * stdout nothing is listening on yet, and the frame never changes.
 */
const mountLayout = async (logo?: string) => {
  const instance = render(
    <WizardLayout version={VERSION} logo={logo}>
      <Text>{CHILD_MARKER}</Text>
    </WizardLayout>,
  );
  await delay(RENDER_DELAY_MS);
  return instance;
};

/** Same mount, carrying what the load buffered before the wizard took the terminal. */
const mountLayoutWithMessages = async (startupMessages: StartupMessage[]) => {
  const instance = render(
    <WizardLayout version={VERSION} startupMessages={startupMessages}>
      <Text>{CHILD_MARKER}</Text>
    </WizardLayout>,
  );
  await delay(RENDER_DELAY_MS);
  return instance;
};

// The store is a module singleton, so the step one test sets would otherwise leak
// into the next; the layout branches on it for the logo.
beforeEach(() => {
  useWizardStore.setState({ step: "stack" });
});

describe("WizardLayout terminal-size guard", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("renders the wizard when the terminal has room", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout();
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(CHILD_MARKER);
    expect(output).toContain(TAB_LABEL);
    expect(output).toContain(FOOTER_LABEL);
    expect(output).not.toContain("Please resize");
  });

  it("renders the wizard at exactly the minimum size", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout();
    cleanup = unmount;

    resizeTo(stdout, AT_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(CHILD_MARKER);
    expect(output).toContain(FOOTER_LABEL);
    expect(output).not.toContain("Please resize");
  });

  it("replaces the wizard with the resize prompt when the terminal is too short", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout();
    cleanup = unmount;

    resizeTo(stdout, TOO_SHORT);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(formatTerminalTooSmallMessage(TOO_SHORT.columns));
    expect(output).not.toContain(CHILD_MARKER);
    expect(output).not.toContain(TAB_LABEL);
    expect(output).not.toContain(FOOTER_LABEL);
  });

  it("replaces the wizard with the resize prompt when the terminal is too narrow", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout();
    cleanup = unmount;

    resizeTo(stdout, TOO_NARROW);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(formatTerminalTooSmallMessage(TOO_NARROW.columns));
    expect(output).not.toContain(CHILD_MARKER);
    expect(output).not.toContain(TAB_LABEL);
    expect(output).not.toContain(FOOTER_LABEL);
  });

  it("brings the wizard back when the terminal grows again", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout();
    cleanup = unmount;

    resizeTo(stdout, TOO_SHORT);
    await delay(RENDER_DELAY_MS);
    expect(lastFrame()).not.toContain(CHILD_MARKER);

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(CHILD_MARKER);
    expect(output).toContain(TAB_LABEL);
    expect(output).toContain(FOOTER_LABEL);
    expect(output).not.toContain("Please resize");
  });
});

/** The tabs a flow with no stack step still paints, spelled as the bar prints them. */
const TABS_WITHOUT_STACK = ["Domains", "Skills", "Sources", "Agents", "Confirm"] as const;

describe("WizardLayout tab bar", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    // The matrix is a module singleton and the tab bar is drawn from it, so the
    // stackless one below would otherwise decide every later render.
    initializeMatrix(BUILT_IN_MATRIX);
  });

  it("paints a Stack tab when the source ships stacks", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout();
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(TAB_LABEL);
    for (const label of TABS_WITHOUT_STACK) {
      expect(output).toContain(label);
    }
  });

  it("paints no Stack tab when the source ships no stacks", async () => {
    initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);
    // Where such a source opens the wizard — there is no stack step to be on.
    useWizardStore.setState({ step: "domains" });

    const { stdout, lastFrame, unmount } = await mountLayout();
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    // The five remaining tabs prove the bar painted, so the sixth's absence is
    // a dropped step rather than a missing frame.
    for (const label of TABS_WITHOUT_STACK) {
      expect(output).toContain(label);
    }
    expect(output).not.toContain(TAB_LABEL);
  });
});

/**
 * A source short enough that the warning it produces fits one line at every
 * geometry these tests mount at — the assertion is about the message reaching
 * the frame, not about how a terminal too narrow for it would break it up.
 */
const UNREACHABLE_SOURCE = "org/repo";
const CACHED_COPY_WARNING = sourceUnreachableUsingCache(UNREACHABLE_SOURCE);

/** One of each level, since the load buffers all three and drops none. */
const EVERY_LEVEL = [
  { level: "info", text: "Loaded 9 skills (marketplace)" },
  { level: "warn", text: CACHED_COPY_WARNING },
  { level: "error", text: "Could not read one skill's metadata" },
] as const satisfies readonly StartupMessage[];

/** More warnings than the band paints, so the rest can only be reported as a count. */
const PAINTED_WARNINGS = [
  { level: "warn", text: "Skipping 'alpha': missing SKILL.md" },
  { level: "warn", text: "Skipping 'bravo': missing SKILL.md" },
  { level: "warn", text: "Skipping 'charlie': missing SKILL.md" },
] as const satisfies readonly StartupMessage[];
const COUNTED_WARNINGS = [
  { level: "warn", text: "Skipping 'delta': missing SKILL.md" },
  { level: "warn", text: "Skipping 'echo': missing SKILL.md" },
] as const satisfies readonly StartupMessage[];

describe("WizardLayout startup messages", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("paints a warning buffered before the wizard mounted, alongside the step", async () => {
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([
      { level: "warn", text: CACHED_COPY_WARNING },
    ]);
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(CACHED_COPY_WARNING);
    // The step and the footer prove the band did not replace the wizard.
    expect(output).toContain(CHILD_MARKER);
    expect(output).toContain(FOOTER_LABEL);
  });

  it("paints every buffered level", async () => {
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([...EVERY_LEVEL]);
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    for (const message of EVERY_LEVEL) {
      expect(output).toContain(message.text);
    }
  });

  it("bounds the band and counts the messages it did not paint", async () => {
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([
      ...PAINTED_WARNINGS,
      ...COUNTED_WARNINGS,
    ]);
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    for (const message of PAINTED_WARNINGS) {
      expect(output).toContain(message.text);
    }
    for (const message of COUNTED_WARNINGS) {
      expect(output).not.toContain(message.text);
    }
    expect(output).toContain(`and ${COUNTED_WARNINGS.length} more`);
  });

  it("paints one message and counts the rest where the step has no rows to spare", async () => {
    const [first, ...rest] = PAINTED_WARNINGS;
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([...PAINTED_WARNINGS]);
    cleanup = unmount;

    resizeTo(stdout, AT_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(first.text);
    for (const message of rest) {
      expect(output).not.toContain(message.text);
    }
    expect(output).toContain(`and ${rest.length} more`);
    // The footer proves the step still has its chrome under the shortened band.
    expect(output).toContain(FOOTER_LABEL);
  });

  it("paints no band when the load buffered nothing", async () => {
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([]);
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(CHILD_MARKER);
    expect(output).not.toContain("more");
  });
});

/**
 * The two INFO lines `edit` buffers before anything else can speak: the load's own count, then
 * the installation's. They are why the band's ordering matters at all — they are raised FIRST,
 * so a band that paints in arrival order spends its whole cramped budget on them and shows the
 * user no warning whatsoever, and spends two of its three roomy rows on them.
 */
const EDIT_INFO_LINES = [
  { level: "info", text: "Loaded 9 skills (marketplace)" },
  { level: "info", text: "Found 4 installed skills" },
] as const satisfies readonly StartupMessage[];

/**
 * Warnings in the order they were raised, all short enough to survive one line at 80 columns —
 * a wrapped line is one `toContain` cannot see, which would pass or fail for the wrong reason.
 */
const RAISED_WARNINGS = [
  { level: "warn", text: "Skipping 'alpha': missing SKILL.md" },
  { level: "warn", text: "Skipping 'bravo': missing SKILL.md" },
  { level: "warn", text: "Skipping 'charlie': missing SKILL.md" },
  { level: "warn", text: "Skipping 'delta': missing SKILL.md" },
  { level: "warn", text: "Skipping 'echo': missing SKILL.md" },
] as const satisfies readonly StartupMessage[];

const RAISED_ERROR = { level: "error", text: "Could not read 'foxtrot'" } as const;

/**
 * Distinct one-line messages per level, so a frame can be asked about each one by name. Short
 * enough to survive 80 columns unwrapped, because `toContain` cannot see a line Ink has folded.
 */
const warningAt = (index: number): StartupMessage => ({
  level: "warn",
  text: `Skipping 'skill-${index}': missing SKILL.md`,
});
const infoAt = (index: number): StartupMessage => ({
  level: "info",
  text: `Loaded ${index} skills (marketplace)`,
});

const countUp = (total: number, build: (index: number) => StartupMessage): StartupMessage[] =>
  Array.from({ length: total }, (_unused, index) => build(index));

/**
 * THE ORDERING INVARIANT, stated for every mix rather than for one message list.
 *
 * The recurrence this exists to stop is a producer adding another unconditional info line —
 * exactly what `edit`'s pair of them did — and silently retaking the row a warning needs. A test
 * naming today's message list cannot see that; a table over the shapes can, because the expected
 * painted counts are written out rather than derived, so a new info line moves a number here
 * before it moves anything a user sees.
 *
 * Read a row as: given this many warnings and this many info lines at this geometry, these are
 * the ones with a row and this is what the counter stands for.
 */
const BAND_SHAPES = [
  {
    label: "roomy, info only",
    geometry: ROOMY,
    warnings: 0,
    infos: 3,
    paintedWarnings: 0,
    paintedInfos: 3,
    counted: 0,
  },
  {
    label: "roomy, one warning under two info",
    geometry: ROOMY,
    warnings: 1,
    infos: 3,
    paintedWarnings: 1,
    paintedInfos: 2,
    counted: 1,
  },
  {
    label: "roomy, warnings fill two of three rows",
    geometry: ROOMY,
    warnings: 2,
    infos: 2,
    paintedWarnings: 2,
    paintedInfos: 1,
    counted: 1,
  },
  {
    label: "roomy, warnings fill the budget exactly",
    geometry: ROOMY,
    warnings: 3,
    infos: 2,
    paintedWarnings: 3,
    paintedInfos: 0,
    counted: 2,
  },
  {
    label: "roomy, warnings overrun the budget",
    geometry: ROOMY,
    warnings: 5,
    infos: 2,
    paintedWarnings: 3,
    paintedInfos: 0,
    counted: 4,
  },
  {
    label: "cramped, info only",
    geometry: AT_MINIMUM,
    warnings: 0,
    infos: 2,
    paintedWarnings: 0,
    paintedInfos: 1,
    counted: 1,
  },
  {
    label: "cramped, one warning takes the only row",
    geometry: AT_MINIMUM,
    warnings: 1,
    infos: 2,
    paintedWarnings: 1,
    paintedInfos: 0,
    counted: 2,
  },
  {
    label: "cramped, warnings overrun the only row",
    geometry: AT_MINIMUM,
    warnings: 2,
    infos: 2,
    paintedWarnings: 1,
    paintedInfos: 0,
    counted: 3,
  },
] as const;

/**
 * A warning must be legible, and the band is fixed-height, so the two claims meet as an
 * eviction: warnings and errors take the rows first and the info lines collapse into the
 * counter. The band does NOT grow to fit them — `assertWizardScreenIsWhollyVisible` in
 * `e2e/pages/base-step.ts` fails the moment the frame stops fitting the terminal, and a band
 * that grew with the warning count is exactly how a wizard paints itself off the top of the
 * screen. So warnings get first claim on the rows that exist rather than unlimited rows, and
 * where the warnings alone overrun them they collapse too — last, after every info line.
 */
describe("WizardLayout startup band priority", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("paints the warnings ahead of the info lines that were buffered before them", async () => {
    const [alpha, bravo] = RAISED_WARNINGS;
    const [loaded, found] = EDIT_INFO_LINES;
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([
      ...EDIT_INFO_LINES,
      alpha,
      bravo,
    ]);
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output, "every warning must be legible in the band").toContain(alpha.text);
    expect(output, "every warning must be legible in the band").toContain(bravo.text);
    // The third row is left for the first info line: warnings take precedence, not the band.
    expect(output).toContain(loaded.text);
    expect(output, "an info line is what collapses when the band runs out of rows").not.toContain(
      found.text,
    );
    expect(output).toContain("and 1 more");
  });

  it("paints the warning rather than the info lines where one row is spare", async () => {
    const [alpha] = RAISED_WARNINGS;
    const [loaded, found] = EDIT_INFO_LINES;
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([
      ...EDIT_INFO_LINES,
      alpha,
    ]);
    cleanup = unmount;

    resizeTo(stdout, AT_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output, "the one row a short terminal spares belongs to the warning").toContain(
      alpha.text,
    );
    expect(output).not.toContain(loaded.text);
    expect(output).not.toContain(found.text);
    expect(output).toContain("and 2 more");
    // The footer proves the step kept its chrome under the reordered band.
    expect(output).toContain(FOOTER_LABEL);
  });

  it("gives an error the same claim on the band as a warning", async () => {
    const [loaded, found] = EDIT_INFO_LINES;
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([
      ...EDIT_INFO_LINES,
      RAISED_ERROR,
    ]);
    cleanup = unmount;

    resizeTo(stdout, AT_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output, "an error outranks an info line exactly as a warning does").toContain(
      RAISED_ERROR.text,
    );
    expect(output).not.toContain(loaded.text);
    expect(output).not.toContain(found.text);
    expect(output).toContain("and 2 more");
  });

  it("collapses warnings only once every info line has already collapsed", async () => {
    const [alpha, bravo, charlie, delta, echo] = RAISED_WARNINGS;
    const [loaded, found] = EDIT_INFO_LINES;
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([
      ...EDIT_INFO_LINES,
      ...RAISED_WARNINGS,
    ]);
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    // Three rows, five warnings: the band holds its size and the earliest three win it.
    expect(output).toContain(alpha.text);
    expect(output).toContain(bravo.text);
    expect(output).toContain(charlie.text);
    expect(output, "a warning collapses only after every info line has").not.toContain(delta.text);
    expect(output).not.toContain(echo.text);
    expect(output).not.toContain(loaded.text);
    expect(output).not.toContain(found.text);
    expect(output, "the counter must account for all four unpainted messages").toContain(
      "and 4 more",
    );
  });

  it("pins the ordering itself, over every mix of levels at both budgets", async () => {
    for (const shape of BAND_SHAPES) {
      const warnings = countUp(shape.warnings, warningAt);
      const infos = countUp(shape.infos, infoAt);
      // Info FIRST, which is the adversarial order and the one `edit` actually produces.
      const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([...infos, ...warnings]);

      resizeTo(stdout, shape.geometry);
      await delay(RENDER_DELAY_MS);
      const output = lastFrame();

      for (const [index, message] of warnings.entries()) {
        const shouldPaint = index < shape.paintedWarnings;
        expect(
          output?.includes(message.text),
          `${shape.label}: warning ${index} ${shouldPaint ? "must" : "must not"} be painted`,
        ).toBe(shouldPaint);
      }
      for (const [index, message] of infos.entries()) {
        const shouldPaint = index < shape.paintedInfos;
        expect(
          output?.includes(message.text),
          `${shape.label}: info ${index} ${shouldPaint ? "must" : "must not"} be painted`,
        ).toBe(shouldPaint);
      }
      expect(
        output?.includes(`... and ${shape.counted} more`),
        `${shape.label}: the counter must stand for exactly ${shape.counted} messages`,
      ).toBe(shape.counted > 0);

      unmount();
    }
  });

  it("collapses warnings after the info lines where one row is spare", async () => {
    const [alpha, bravo] = RAISED_WARNINGS;
    const [loaded, found] = EDIT_INFO_LINES;
    const { stdout, lastFrame, unmount } = await mountLayoutWithMessages([
      ...EDIT_INFO_LINES,
      alpha,
      bravo,
    ]);
    cleanup = unmount;

    resizeTo(stdout, AT_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(alpha.text);
    expect(output, "the second warning has no row, so it is counted rather than dropped").toContain(
      "and 3 more",
    );
    expect(output).not.toContain(bravo.text);
    expect(output).not.toContain(loaded.text);
    expect(output).not.toContain(found.text);
  });
});

describe("WizardLayout logo", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("paints the logo on the stack step at exactly the logo threshold", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout(LOGO_MARKER);
    cleanup = unmount;

    resizeTo(stdout, AT_LOGO_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).toContain(LOGO_MARKER);
    expect(output).toContain(CHILD_MARKER);
    expect(output).toContain(FOOTER_LABEL);
  });

  it("drops the logo one row below the threshold and keeps the step body", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout(LOGO_MARKER);
    cleanup = unmount;

    resizeTo(stdout, BELOW_LOGO_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).not.toContain(LOGO_MARKER);
    expect(output).toContain(CHILD_MARKER);
    expect(output).toContain(FOOTER_LABEL);
  });

  it("drops the logo at the smallest terminal the CLI runs in", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout(LOGO_MARKER);
    cleanup = unmount;

    resizeTo(stdout, AT_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).not.toContain(LOGO_MARKER);
    expect(output).toContain(CHILD_MARKER);
    expect(output).toContain(FOOTER_LABEL);
  });

  it("paints no logo off the stack step however tall the terminal", async () => {
    useWizardStore.setState({ step: "domains" });

    const { stdout, lastFrame, unmount } = await mountLayout(LOGO_MARKER);
    cleanup = unmount;

    resizeTo(stdout, ABOVE_LOGO_MINIMUM);
    await delay(RENDER_DELAY_MS);

    const output = lastFrame();
    expect(output).not.toContain(LOGO_MARKER);
    expect(output).toContain(CHILD_MARKER);
    expect(output).toContain(FOOTER_LABEL);
  });

  it("brings the logo back when the terminal grows past the threshold", async () => {
    const { stdout, lastFrame, unmount } = await mountLayout(LOGO_MARKER);
    cleanup = unmount;

    resizeTo(stdout, AT_MINIMUM);
    await delay(RENDER_DELAY_MS);
    expect(lastFrame()).not.toContain(LOGO_MARKER);

    resizeTo(stdout, AT_LOGO_MINIMUM);
    await delay(RENDER_DELAY_MS);

    expect(lastFrame()).toContain(LOGO_MARKER);
  });
});

/**
 * THE SUBTITLE IS A SCREEN SENTINEL. `e2e/pages/constants.ts` `STEP_TEXT.SOURCES`
 * duplicates this exact string and every E2E step page object waits on it to know the
 * screen arrived — so a subtitle that moves without it does not fail an assertion, it
 * hangs each wizard spec for the full `TIMEOUTS.WIZARD_LOAD` budget. This test goes red
 * in under a second and names the string when THE PRODUCT moves; it reads no `e2e/`
 * file, so it cannot see the mirror move, and that half sat drifted while the whole unit
 * suite stayed green. `scripts/check-screen-sentinels.ts` is what compares the two
 * literals to each other — it reads both as source, in both directions.
 *
 * The wording is the step's own subject — where each skill comes from — and NOT the config
 * field the step writes, which is `SkillConfig.origin`. Heading it with that field's noun was
 * proposed and withdrawn by the owner, so the mismatch is deliberate. If it is ever reworded,
 * it moves in exactly two places: here and `STEP_TEXT.SOURCES`.
 */
describe("the step the wizard names its sources on", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("heads the step with the sentinel the E2E page objects wait on", async () => {
    useWizardStore.setState({ step: "sources" });

    const { stdout, lastFrame, unmount } = await mountLayout();
    cleanup = unmount;

    resizeTo(stdout, ROOMY);
    await delay(RENDER_DELAY_MS);

    expect(lastFrame()).toContain(SOURCES_STEP_SUBTITLE);
  });
});
