/**
 * The wizard's first frame, against the terminal mode it was painted in.
 *
 * A terminal hands keys over in one of two modes. Cooked — the default — the kernel echoes each
 * key itself and turns Enter into `\n`; raw, it does neither and the byte arrives as sent. Ink
 * switches to raw from `useInput`'s effect, which runs after the frame it belongs to has been
 * written. An Enter pressed on that frame before the effect runs is therefore echoed by the
 * kernel as a line break, which scrolls a frame the height of the terminal up by a line for
 * good, and Ink later reads it as `enter` rather than `return`, which no handler answers. A
 * starved machine widens that gap enough for the e2e harness to land in it, and a quick person
 * can land in it on any machine.
 *
 * So the subject is the moment the frame is written: the terminal must already be raw.
 * `process.stdout` stands in as the terminal's screen, made a TTY for the duration as in
 * `spinner.test.ts`, and `standAtTerminal` its keyboard. The wizard is a stub that paints a footer
 * and answers Enter by leaving, which is all a session needs from it here —
 * `run-wizard-session.test.tsx` covers what it returns.
 *
 * Handing the terminal back is a second subject, because Ink only gives back the raw mode its
 * own `useInput` took. A wizard that throws from its render never reaches that effect, so the
 * only thing that can cook the terminal again is the session's own restore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { standAtTerminal } from "../../lib/__tests__/helpers/terminal-input.js";
import { runWizardSession, type WizardSessionOptions } from "./run-wizard-session.js";

const TERMINAL_COLUMNS = 80;
const TERMINAL_ROWS = 24;
const ENTER = "\r";

/** A session with nothing to hydrate and nothing for the command to say. */
const BARE_SESSION: WizardSessionOptions = {
  hydrate: { isEditingFromGlobalScope: false },
  props: { version: "0.0.0-test" },
  onCancel: () => {},
  clearTerminal: () => {},
};

const WIZARD_FOOTER = vi.hoisted(() => "ENTER  continue");

/** Whether the stubbed wizard paints its footer or throws from its render, set by each test. */
const stubbedWizard = vi.hoisted(() => ({ failsToRender: false }));

vi.mock("./wizard.js", async () => {
  const { Text, useApp, useInput } = await import("ink");

  function AnswersEnter() {
    const { exit } = useApp();
    useInput((_input, key) => {
      if (key.return) exit();
    });
    return <Text>{WIZARD_FOOTER}</Text>;
  }

  function FailsToRender(): never {
    throw new Error("the wizard failed to render");
  }

  return {
    Wizard: () => (stubbedWizard.failsToRender ? <FailsToRender /> : <AnswersEnter />),
  };
});

describe("runWizardSession on a terminal", () => {
  const terminal = standAtTerminal();
  let stdoutWasTty: boolean;
  let stdoutColumns: number;
  let stdoutRows: number;
  /** The input's mode at the first write carrying the footer — unset until that write. */
  let rawWhenFooterWritten: boolean | undefined;

  beforeEach(() => {
    stdoutWasTty = process.stdout.isTTY;
    stdoutColumns = process.stdout.columns;
    stdoutRows = process.stdout.rows;
    process.stdout.isTTY = true;
    process.stdout.columns = TERMINAL_COLUMNS;
    process.stdout.rows = TERMINAL_ROWS;

    stubbedWizard.failsToRender = false;
    rawWhenFooterWritten = undefined;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
      if (rawWhenFooterWritten === undefined && String(chunk).includes(WIZARD_FOOTER)) {
        rawWhenFooterWritten = terminal.input.isRaw;
      }
      const onWritten = rest.find((argument) => typeof argument === "function");
      if (onWritten !== undefined) queueMicrotask(() => onWritten());
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.stdout.isTTY = stdoutWasTty;
    process.stdout.columns = stdoutColumns;
    process.stdout.rows = stdoutRows;
  });

  it("is raw before the first frame is written, and cooked once the wizard is gone", async () => {
    const session = runWizardSession(BARE_SESSION);
    terminal.input.push(ENTER);
    await session;

    expect(
      rawWhenFooterWritten,
      "a key pressed on the first frame must reach the wizard as typed, never echoed by the kernel",
    ).toBe(true);
    expect(
      terminal.input.isRaw,
      "the terminal must be handed back cooked once the wizard is gone",
    ).toBe(false);
  });

  it("is handed back cooked when the wizard fails to render and Ink never took raw mode", async () => {
    stubbedWizard.failsToRender = true;

    await runWizardSession(BARE_SESSION);

    expect(
      terminal.input.isRaw,
      "a wizard that never took input must still leave the terminal cooked",
    ).toBe(false);
  });
});
