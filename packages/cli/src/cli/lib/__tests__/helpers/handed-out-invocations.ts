/** Reads the invocations `src/cli/` messages hand users; an E2E spec runs each one. */

import { elementAt } from "./element-at.js";

export type Invocation = readonly string[];

/** Stated, not derived, because the E2E spec runs it: a new invocation is added deliberately. */
export const HANDED_OUT_INVOCATIONS: readonly Invocation[] = [
  ["build", "marketplace"],
  ["build", "plugins"],
  ["compile"],
  ["doctor"],
  ["edit"],
  ["init"],
  ["new", "marketplace"],
  ["uninstall"],
  ["update"],
];

// Captures lowercase command words after the interpolation, stopping at a quote, `--flag`, `${…}`
// or placeholder. Unquoted invocations followed by lowercase prose over-read, deliberately.
const HANDS_OUT = /\$\{CLI_INVOKE_COMMAND\}((?: [a-z][a-z0-9-]*)+)/g;

/** Deduplicated and sorted. */
export function invocationsIn(source: string): Invocation[] {
  const named = [...source.matchAll(HANDS_OUT)].map((match) => elementAt(match, 1).trim());
  return [...new Set(named)].sort().map((invocation) => invocation.split(" "));
}
