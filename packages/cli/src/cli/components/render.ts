import { render as inkRender, type Instance, type RenderOptions } from "ink";
import type { ReactNode } from "react";

/**
 * Ink checks CI env vars before the stream and, under CI, paints nothing until exit — fatal for a
 * prompt on a real TTY. A TTY therefore forces `interactive: true`; a caller's value still wins.
 */
export function render(node: ReactNode, options?: RenderOptions): Instance {
  const stdout = options?.stdout ?? process.stdout;
  return inkRender(node, {
    ...(stdout.isTTY && { interactive: true }),
    ...options,
  });
}
