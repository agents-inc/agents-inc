import { useApp } from "ink";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clearSpy } = vi.hoisted(() => ({ clearSpy: vi.fn() }));

/** The real render, with `clear` watched: whether a resolved prompt erased itself is the subject. */
vi.mock("../render.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../render.js")>();
  return {
    render: (...args: Parameters<typeof actual.render>) => {
      const instance = actual.render(...args);
      const clear = instance.clear;
      return {
        ...instance,
        clear: () => {
          clearSpy();
          clear();
        },
      };
    },
  };
});

import { promptConfirm, promptValue, type ConfirmHandlers } from "./prompt-confirm.js";

const CHOSEN = "chosen";
const NOTHING_CHOSEN = "nothing-chosen";
const EXIT_FAILURE = new Error("the render failed");

/** Answers on mount, so the prompt resolves with no input. */
const AnswersOnMount: React.FC<{ resolve: (value: string) => void }> = ({ resolve }) => {
  useEffect(() => resolve(CHOSEN), [resolve]);
  return null;
};

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

describe("promptValue and the terminal", () => {
  beforeEach(() => {
    clearSpy.mockClear();
  });

  it.each([
    ["cleanly", undefined],
    ["with an error", EXIT_FAILURE],
  ])("answers the exit value when the app exits %s before any answer", async (_how, failure) => {
    const value = await promptValue<string>(() => <ExitsUnanswered failure={failure} />, {
      onExit: NOTHING_CHOSEN,
    });

    expect(value).toBe(NOTHING_CHOSEN);
  });

  it("erases a resolved prompt only when asked to", async () => {
    await promptValue<string>((resolve) => <AnswersOnMount resolve={resolve} />, {
      onExit: NOTHING_CHOSEN,
    });
    expect(clearSpy).not.toHaveBeenCalled();

    await promptValue<string>((resolve) => <AnswersOnMount resolve={resolve} />, {
      onExit: NOTHING_CHOSEN,
      clearOnResolve: true,
    });
    expect(clearSpy).toHaveBeenCalledOnce();
  });

  it("takes the first answer of a confirm prompt, a cancel included", async () => {
    expect(await promptConfirm((handlers) => <CancelsThenConfirms {...handlers} />)).toBe(
      "cancelled",
    );
  });

  describe("on a terminal", () => {
    const stdin = process.stdin;
    let restoreStdin: () => void;

    /** A cooked-mode terminal: a TTY whose raw mode is off and can be switched. */
    const TERMINAL_PROPERTIES = {
      isTTY: { value: true },
      isRaw: { value: false, writable: true },
      setRawMode: { value: vi.fn(() => stdin), writable: true },
    } as const;

    beforeEach(() => {
      const found = Object.keys(TERMINAL_PROPERTIES).map(
        (name) => [name, Object.getOwnPropertyDescriptor(stdin, name)] as const,
      );
      for (const [name, descriptor] of Object.entries(TERMINAL_PROPERTIES)) {
        Object.defineProperty(stdin, name, { ...descriptor, configurable: true });
      }
      restoreStdin = () => {
        for (const [name, descriptor] of found) {
          if (descriptor === undefined) Reflect.deleteProperty(stdin, name);
          else Object.defineProperty(stdin, name, descriptor);
        }
      };
    });

    afterEach(() => {
      restoreStdin();
    });

    it("holds the input raw while the prompt is open, then restores the mode it found", async () => {
      await promptValue<string>((resolve) => <AnswersOnMount resolve={resolve} />, {
        onExit: NOTHING_CHOSEN,
      });

      expect(TERMINAL_PROPERTIES.setRawMode.value.mock.calls).toStrictEqual([[true], [false]]);
    });
  });
});
