import { Terminal } from "@xterm/headless";
import { Text, useApp } from "ink";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  promptConfirm,
  promptValue,
  type ConfirmHandlers,
  type PromptValueOptions,
} from "./prompt-confirm.js";
import { standAtTerminal } from "../../lib/__tests__/helpers/terminal-input.js";

const CHOSEN = "chosen";
const NOTHING_CHOSEN = "nothing-chosen";
const EXIT_FAILURE = new Error("the render failed");
const QUESTION = "Apply this configuration?";

const TERMINAL_COLUMNS = 80;
const TERMINAL_ROWS = 24;

/** Exits the app on mount without answering, as Ctrl+C or a render failure does. */
const ExitsUnanswered: React.FC<{ failure: Error | undefined }> = ({ failure }) => {
  const { exit } = useApp();
  useEffect(() => exit(failure), [exit, failure]);
  return null;
};

/** Cancels, then confirms: the first answer is the one that counts. */
const CancelsThenConfirms: React.FC<ConfirmHandlers> = ({ onConfirm, onCancel }) => {
  useEffect(() => {
    onCancel();
    onConfirm();
  }, [onConfirm, onCancel]);
  return null;
};

/** Answers with the mode the input is in while the prompt is open. */
const AnswersTheInputMode: React.FC<{ resolve: (value: string) => void }> = ({ resolve }) => {
  useEffect(() => resolve(process.stdin.isRaw ? "raw" : "cooked"), [resolve]);
  return null;
};

describe("promptValue and the terminal", () => {
  it.each([
    ["cleanly", undefined],
    ["with an error", EXIT_FAILURE],
  ])("answers the exit value when the app exits %s before any answer", async (_how, failure) => {
    const value = await promptValue<string>(() => <ExitsUnanswered failure={failure} />, {
      onExit: NOTHING_CHOSEN,
    });

    expect(value).toBe(NOTHING_CHOSEN);
  });

  it("takes the first answer of a confirm prompt, a cancel included", async () => {
    expect(await promptConfirm((handlers) => <CancelsThenConfirms {...handlers} />)).toBe(
      "cancelled",
    );
  });

  describe("on a terminal's input", () => {
    const terminal = standAtTerminal();

    it.each([
      ["cooked", false],
      ["raw", true],
    ])(
      "holds the input raw while the prompt is open, then restores the %s mode it found",
      async (_found, wasRaw) => {
        terminal.input.isRaw = wasRaw;

        const modeWhileOpen = await promptValue<string>(
          (resolve) => <AnswersTheInputMode resolve={resolve} />,
          { onExit: NOTHING_CHOSEN },
        );

        expect(modeWhileOpen).toBe("raw");
        expect(terminal.input.isRaw).toBe(wasRaw);
      },
    );
  });

  /** stdout is made a TTY, so Ink paints as it does for a person, and fed to a terminal emulator. */
  describe("on a terminal's screen", () => {
    let screen: Terminal;
    let stdoutWasTty: boolean;
    let stdoutColumns: number;
    let stdoutRows: number;

    const painted = () => new Promise<void>((resolve) => screen.write("", resolve));

    const screenRow = (row: number): string => {
      const line = screen.buffer.active.getLine(row);
      if (line === undefined) throw new Error(`the emulator has no row ${row}`);
      return line.translateToString(true);
    };

    beforeEach(() => {
      screen = new Terminal({
        cols: TERMINAL_COLUMNS,
        rows: TERMINAL_ROWS,
        allowProposedApi: true,
      });
      stdoutWasTty = process.stdout.isTTY;
      stdoutColumns = process.stdout.columns;
      stdoutRows = process.stdout.rows;
      process.stdout.isTTY = true;
      process.stdout.columns = TERMINAL_COLUMNS;
      process.stdout.rows = TERMINAL_ROWS;
      vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
        const onWritten = rest.find((argument) => typeof argument === "function");
        screen.write(chunk, () => onWritten?.());
        return true;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      process.stdout.isTTY = stdoutWasTty;
      process.stdout.columns = stdoutColumns;
      process.stdout.rows = stdoutRows;
      screen.dispose();
    });

    /** Shows the question, and answers only once it is on screen. */
    async function answerOnScreen(options: PromptValueOptions<string>): Promise<void> {
      const prompt: { answer: (value: string) => void } = { answer: () => undefined };
      const answered = promptValue<string>((resolve) => {
        prompt.answer = resolve;
        return <Text>{QUESTION}</Text>;
      }, options);

      await painted();
      expect(screenRow(0), "the prompt must be on screen for its removal to mean anything").toBe(
        QUESTION,
      );

      prompt.answer(CHOSEN);
      expect(await answered).toBe(CHOSEN);
      await painted();
    }

    it("leaves an answered prompt on the screen when not asked to erase it", async () => {
      await answerOnScreen({ onExit: NOTHING_CHOSEN });

      expect(screenRow(0)).toBe(QUESTION);
    });

    it("erases an answered prompt when asked to", async () => {
      await answerOnScreen({ onExit: NOTHING_CHOSEN, clearOnResolve: true });

      expect(screenRow(0), "no frame of the prompt may survive its answer").toBe("");
      expect(
        screen.buffer.active.cursorY,
        "the next output must start on the row the prompt started on",
      ).toBe(0);
    });
  });
});
