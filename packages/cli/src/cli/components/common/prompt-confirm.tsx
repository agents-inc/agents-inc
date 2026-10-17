import React from "react";
import { render } from "../render.js";

export type ConfirmHandlers = {
  onConfirm: () => void;
  onCancel: () => void;
};

export type PromptValueOptions<T> = {
  /** Resolved when the app exits before any callback fires (Ctrl+C, render failure). */
  onExit: T;
  /** Clear before unmount. */
  clearOnResolve?: boolean;
};

/** First resolve wins, whether a callback or the app-exit fallback; callers own exit policy. */
export async function promptValue<T>(
  build: (resolve: (value: T) => void) => React.ReactElement,
  options: PromptValueOptions<T>,
): Promise<T> {
  // The seed is never called: the executor below replaces it synchronously.
  const answer: { settle: (value: T) => void } = { settle: () => {} };
  const chosen = new Promise<T>((resolve) => {
    answer.settle = resolve;
  });

  const releaseInput = holdInputRaw(process.stdin);
  try {
    const instance = render(build((value) => answer.settle(value)));

    instance.waitUntilExit().then(
      () => answer.settle(options.onExit),
      () => answer.settle(options.onExit),
    );

    const value = await chosen;

    // Here, not at each resolve site: a prompt can answer before `render()` returns the instance.
    if (options.clearOnResolve) instance.clear();
    instance.unmount();

    return value;
  } finally {
    releaseInput();
  }
}

/**
 * Ink sets raw mode only after the first frame, so an early Enter is echoed in cooked mode.
 * Prompts only: under raw mode Ctrl+C could not interrupt a spinner, which reads no input.
 */
function holdInputRaw(input: NodeJS.ReadStream): () => void {
  if (!input.isTTY) return () => {};
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  return () => {
    input.setRawMode(wasRaw);
  };
}

export async function promptConfirm(
  build: (handlers: ConfirmHandlers) => React.ReactElement,
): Promise<"confirmed" | "cancelled"> {
  return promptValue<"confirmed" | "cancelled">(
    (resolve) =>
      build({ onConfirm: () => resolve("confirmed"), onCancel: () => resolve("cancelled") }),
    { onExit: "cancelled" },
  );
}
