import React from "react";
import { render } from "ink";

export type ConfirmHandlers = {
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Renders a confirm UI and resolves with the user's choice. The element is
 * unmounted as soon as either handler fires; a render failure resolves as
 * "cancelled". Callers own exit policy (exit codes, follow-up logging).
 */
export async function promptConfirm(
  build: (handlers: ConfirmHandlers) => React.ReactElement,
): Promise<"confirmed" | "cancelled"> {
  return new Promise((resolve) => {
    const instance = render(
      build({
        onConfirm: () => {
          instance.unmount();
          resolve("confirmed");
        },
        onCancel: () => {
          instance.unmount();
          resolve("cancelled");
        },
      }),
    );
    instance.waitUntilExit().catch(() => resolve("cancelled"));
  });
}
