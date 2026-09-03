import { installableSeedPayloadSchema, type SeedPayload } from "@workspace/matrix/seed";

import { formatZodErrors } from "../schema-validator.js";
import { getErrorMessage } from "../../utils/errors.js";
import { stripTerminalControls, truncateText } from "../../utils/string.js";

/** A payload read from a pipe, or the reason it could not be. */
export type PipedPayload =
  | { readonly ok: true; readonly payload: SeedPayload }
  | { readonly ok: false; readonly error: string };

export const NOTHING_PIPED =
  "--stdin expects a configuration on standard input and none arrived. Pipe one in, as 'cat proposal.json | agents-inc share --stdin'.";

export const STDIN_IS_A_TERMINAL =
  "--stdin expects a configuration on standard input, but standard input is a terminal. Pipe one in rather than typing it.";

/**
 * How much of a body to quote back when it is not JSON, so a refusal names what it read.
 *
 * A CHARACTER bound, because what it clips is arbitrary bytes a producer piped by mistake: any
 * cut is as good as any other, and the point is only that the caller recognises what they sent.
 */
const EXCERPT = 80;

/**
 * How many problems to name before the rest are counted instead.
 *
 * The scope rule raises one issue per (skill, sub-agent) PAIR rather than one per payload, and
 * each renders at roughly 150 characters — the same sentence every time, with two names changed.
 * A repository scan is 20-40 skills across 3-6 sub-agents, so an unbounded list is 60-240 of them
 * and hundreds of lines: the refusal becomes the wall of text it is complaining about.
 *
 * Four, so the whole message lands near twice the 300-character `EXPLANATION_BUDGET` in
 * `publish-seed.ts`, which bounds the store's account of this same refusal arriving over the
 * wire. Twice, because that one quotes back a remote explanation of a payload already sent, where
 * these are the caller's own pairs and each name is somewhere they have to go and edit — and four
 * of them is enough to show the mistake is a pattern rather than a one-off.
 *
 * A COUNT rather than a `truncateText` over the joined list, which is the one place this file's
 * two bounds differ. A character cut lands mid-sentence, and mid-sentence here means a half-named
 * skill or sub-agent — worse than one left out and counted, because it reads as a name.
 */
const PROBLEMS_NAMED = 4;

/**
 * Everything that can fail locally, failing before the caller spends a write.
 *
 * The store's free tier allows a thousand writes a day against a hundred times that in reads, so
 * a write is the scarce half — and one spent on a payload the decoder cannot read buys a dead
 * link. Each of the three refusals below is a different mistake and says which: nothing arrived,
 * what arrived is not JSON, or it is JSON the contract does not accept.
 *
 * `installableSeedPayloadSchema` rather than a shape written here, and that is the point of
 * publishing from the CLI at all. `SEED_VERSION` is a `z.literal`, so a producer that hardcodes
 * the wire format emits payloads the store refuses the day it moves; the schema travels with the
 * code that posts.
 *
 * THE *INSTALLABLE* SCHEMA, AND THE DIFFERENCE IS THE WHOLE BUG THIS CLOSED. The worker validates
 * a POST with `installableSeedPayloadSchema` and a GET with the base `seedPayloadSchema` — write
 * strict, read lenient, deliberately, so links already in the wild stay repairable in the editor.
 * This gate read the BASE schema, so the one rule the two differ by — a project-scoped skill
 * assigned to a sub-agent resting at global, which has nowhere to be written — was the single
 * payload that passed locally and failed at the edge. It arrived as a bare `HTTP 400`.
 *
 * That was not an exotic shape. `agents` is sparse and an absent entry rests on the shared default
 * of `global`, so "assign a skill and say nothing else" is already the unwritable pair;
 * `meta-config-stack-detect` emitted it on every run. Reading the same schema the store writes
 * with is what makes this file's promise — everything that can fail locally, failing before the
 * caller spends a write — true rather than nearly true.
 */
export function readPipedPayload(body: string): PipedPayload {
  if (body.trim() === "") return { ok: false, error: NOTHING_PIPED };

  const read = readJson(body);
  if (!read.parsed) return { ok: false, error: notJsonMessage(body, read.reason) };

  const result = installableSeedPayloadSchema.safeParse(read.value);
  if (!result.success) {
    return { ok: false, error: refusedByContract(formatZodErrors(result.error)) };
  }

  return { ok: true, payload: result.data };
}

/** Whether a body is JSON at all, separated from whether it is a payload. */
type JsonRead =
  | { readonly parsed: true; readonly value: unknown }
  | { readonly parsed: false; readonly reason: string };

/**
 * `JSON.parse` behind a verdict, so the caller reads as three guards rather than as a `let`
 * assigned inside a `try`. The same shape `readYaml` takes in `lib/skills/skill-metadata.ts`,
 * for the same reason: the failure is one of several a reader has to tell apart, and a thrown
 * exception is the one form that cannot sit beside the others.
 */
function readJson(body: string): JsonRead {
  try {
    return { parsed: true, value: JSON.parse(body) };
  } catch (error) {
    return { parsed: false, reason: getErrorMessage(error) };
  }
}

/**
 * Two quotes of the same untrusted body, and both have to be made inert.
 *
 * The excerpt is the obvious one. The REASON is not, and it is the one that got through: V8 writes
 * `Unexpected token 'h', "here is..." is not valid JSON`, quoting the offending input verbatim, so
 * a parser's own account of a failure carries whatever caused it. `truncateText` covers the
 * excerpt; nothing covered the reason, because nothing looked like it came from outside.
 */
function notJsonMessage(body: string, reason: string): string {
  const opening = truncateText(body.trim(), EXCERPT);
  const said = stripTerminalControls(reason);
  return `What arrived on standard input is not JSON: ${said}. It began: ${opening}`;
}

function refusedByContract(problems: string[]): string {
  return `The configuration on standard input is not one this store accepts: ${namedProblems(problems)}`;
}

/**
 * The first few problems in full, and a count of however many were left out.
 *
 * The count is what keeps a clipped list honest. Without it a caller who fixed the pairs named
 * here and ran again would have no way to tell this from a complete list — so the second refusal
 * would read as a new fault rather than as the rest of the one they were already fixing.
 */
function namedProblems(problems: string[]): string {
  const named = problems.slice(0, PROBLEMS_NAMED).join("; ");
  const elided = problems.length - PROBLEMS_NAMED;
  return elided > 0 ? `${named} (and ${elided} more)` : named;
}
