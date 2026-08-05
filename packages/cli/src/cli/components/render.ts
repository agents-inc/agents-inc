import { render as inkRender, type Instance, type RenderOptions } from "ink";
import type { ReactNode } from "react";

/**
 * Every Ink render in the CLI goes through here, for one rule: a real terminal
 * is not a guess.
 *
 * Ink decides whether it is interactive by consulting CI environment variables
 * (`is-in-ci`) before it looks at the stream it was handed, and under CI it
 * buffers every frame and writes only at exit. For a spinner that is cosmetic;
 * for anything awaiting input it is fatal — the screen the user must answer is
 * never painted. That exact failure ran one CI suite for 49 minutes, because
 * the e2e harness hands the child a genuine pseudo-terminal while the runner's
 * environment says CI.
 *
 * So: when the destination stream is a TTY, say `interactive: true` out loud
 * and the CI guess never happens. When it is not — piped output, redirected
 * logs, genuine CI without a terminal — pass nothing and Ink's own detection
 * keeps its non-interactive behaviour. An explicit `interactive` from a caller
 * always wins; the spread order is what guarantees it.
 */
export function render(node: ReactNode, options?: RenderOptions): Instance {
  const stdout = options?.stdout ?? process.stdout;
  return inkRender(node, {
    ...(stdout.isTTY && { interactive: true }),
    ...options,
  });
}
