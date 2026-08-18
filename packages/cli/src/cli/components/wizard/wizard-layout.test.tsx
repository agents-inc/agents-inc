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
 * hangs each wizard spec for the full `TIMEOUTS.WIZARD_LOAD` budget. This test is the
 * fast half of that pair: it goes red in under a second and names the string, which is
 * the signal `STEP_TEXT.SOURCES` has to be moved to match.
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
