import React from "react";
import { render } from "../render.js";

export type ConfirmHandlers = {
  onConfirm: () => void;
  onCancel: () => void;
};

export type PromptValueOptions<T> = {
  /** Value resolved when the Ink app exits before any callback fires (Ctrl+C / render failure). */
  onExit: T;
  /** Call instance.clear() before unmount — repaints a clean terminal (used by the dashboard). */
  clearOnResolve?: boolean;
};

/**
 * Renders an Ink prompt and resolves with the value produced by its callbacks.
 * First-wins: the first resolve (a callback or the app-exit fallback) settles the
 * promise; later resolves are ignored. The element is unmounted at the resolution
 * site (optionally cleared first). Callers own exit policy (exit codes, logging).
 */
export async function promptValue<T>(
  build: (resolve: (value: T) => void) => React.ReactElement,
  options: PromptValueOptions<T>,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const instance = render(
      build((value) => {
        if (options.clearOnResolve) instance.clear();
        instance.unmount();
        resolve(value);
      }),
    );
    // App exit without a callback (e.g. Ctrl+C) or a render failure counts as the
    // fallback; resolve is first-wins, so a prior callback value is unaffected.
    instance.waitUntilExit().then(
      () => resolve(options.onExit),
      () => resolve(options.onExit),
    );
  });
}

/**
 * Renders a confirm UI and resolves with the user's choice. The element is
 * unmounted as soon as either handler fires; a clean exit or render failure
 * without a choice resolves as "cancelled". Callers own exit policy.
 */
export async function promptConfirm(
  build: (handlers: ConfirmHandlers) => React.ReactElement,
): Promise<"confirmed" | "cancelled"> {
  return promptValue<"confirmed" | "cancelled">(
    (resolve) =>
      build({ onConfirm: () => resolve("confirmed"), onCancel: () => resolve("cancelled") }),
    { onExit: "cancelled" },
  );
}
