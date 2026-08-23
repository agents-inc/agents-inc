/**
 * The reader for the invocations `src/cli/` hands its users, and the list of what it finds.
 *
 * `compile`'s no-skills refusal told the reader to run `agents-inc add <skill>` for as long as
 * the message existed. There has never been an `add` command, so the one instruction a stuck
 * user was given exited 127. Specs covered that message, `reference/commands/index.md` quoted it
 * faithfully, and every one of them was correct about what the CLI printed — none asked whether
 * the thing it named exists.
 *
 * Nothing static can answer that: a message is a string and the command roster is a directory,
 * and `scripts/check-enumeration-drift.ts` binds a file to a symbol rather than to directory
 * membership. So the question is split in two. This module reads the messages and says what they
 * hand out; `handed-out-invocations.test.ts` holds that reading against
 * {@link HANDED_OUT_INVOCATIONS}, and an E2E spec runs every entry of that list against the real
 * binary. Neither half is worth anything alone — a hand-written list of commands to run proves
 * nothing about what the messages say, and a scan that nobody executes proves nothing about what
 * the CLI answers.
 */

import { elementAt } from "./element-at.js";

/** One invocation as argv, so nothing downstream has to split a sentence to run it. */
export type Invocation = readonly string[];

/**
 * Every invocation the CLI's guidance currently hands out, sorted.
 *
 * The list is stated rather than derived at the point of use, because it is what the E2E spec
 * runs: a scan feeding itself would run whatever the messages happen to say and report success
 * for a message naming nothing. A message that names something new fails the reading gate here
 * first, with the new invocation in the diff — and adding it to this list is then a decision to
 * have the binary answer for it.
 */
export const HANDED_OUT_INVOCATIONS: readonly Invocation[] = [
  ["build", "marketplace"],
  ["build", "plugins"],
  ["compile"],
  ["doctor"],
  ["edit"],
  ["init"],
  ["uninstall"],
  ["update"],
];

/**
 * The interpolation every user-facing invocation in `src/cli/` is written through, followed by
 * the words that name a command.
 *
 * A command word is lowercase, so the capture ends at the first thing that is not one — a
 * closing quote or backtick, a `--flag`, a `${…}` argument, an angle-bracket placeholder. That
 * is what separates the topic-plus-command form (`build marketplace`) from a command with
 * arguments (`init --from <id>`, `search ${skillId}`) without knowing either roster.
 *
 * A message that writes its invocation UNQUOTED and follows it with lowercase prose reads as a
 * longer command here — deliberately. It reads that way to a person too, and the gate naming it
 * is the right place to find that out.
 */
const HANDS_OUT = /\$\{CLI_INVOKE_COMMAND\}((?: [a-z][a-z0-9-]*)+)/g;

/** Every invocation `source` hands the reader, deduplicated and sorted. */
export function invocationsIn(source: string): Invocation[] {
  const named = [...source.matchAll(HANDS_OUT)].map((match) => elementAt(match, 1).trim());
  return [...new Set(named)].sort().map((invocation) => invocation.split(" "));
}
