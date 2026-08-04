import { Text } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WizardLayout } from "./wizard-layout";
import { LOGO_MIN_TERMINAL_ROWS, MIN_TERMINAL_SIZE } from "../../consts";
import { useWizardStore } from "../../stores/wizard-store";
import { formatTerminalTooSmallMessage } from "../../utils/terminal";
import { RENDER_DELAY_MS, delay } from "../../lib/__tests__/test-constants";

/** Text only the wizard's own children paint, so its absence proves they were replaced. */
const CHILD_MARKER = "STEP BODY";
/** Wizard chrome WizardLayout itself paints: a step tab and the footer hotkey hint. */
const TAB_LABEL = "Stack";
const FOOTER_LABEL = "select";
/** Stands in for `ASCII_LOGO`: the layout takes the art as an opaque string. */
const LOGO_MARKER = "ASCII LOGO ART";

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
