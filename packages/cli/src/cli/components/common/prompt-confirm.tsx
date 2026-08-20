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
 *
 * A prompt may resolve before `render()` has handed its instance back: Ink flushes
 * mount effects synchronously, so a component that settles on mount reaches the
 * callback first. The teardown is then run the moment the instance exists — one
 * statement later, on the same tick — so callers that resolve from a keypress see
 * exactly the order they always did.
 */
export async function promptValue<T>(
  build: (resolve: (value: T) => void) => React.ReactElement,
  options: PromptValueOptions<T>,
): Promise<T> {
  // The promise's own `resolve`, lifted out so the render can be a plain `const` below
  // rather than a binding the element's callbacks would reach while `render()` is still
  // producing it. The seed is never called: a Promise executor runs synchronously, so the
  // next statement has already replaced it by the time anything can answer.
  const answer: { settle: (value: T) => void } = { settle: () => {} };
  const chosen = new Promise<T>((resolve) => {
    answer.settle = resolve;
  });

  const instance = render(build((value) => answer.settle(value)));

  // App exit without a callback (e.g. Ctrl+C) or a render failure counts as the
  // fallback; the promise is first-wins, so a prior callback value is unaffected.
  instance.waitUntilExit().then(
    () => answer.settle(options.onExit),
    () => answer.settle(options.onExit),
  );

  const value = await chosen;

  // Taken down here rather than at each resolve site: it then happens exactly once,
  // whichever of the three endings settled the promise, and always with an instance in
  // hand — including the ending that arrives before `render()` has returned one.
  if (options.clearOnResolve) instance.clear();
  instance.unmount();

  return value;
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
