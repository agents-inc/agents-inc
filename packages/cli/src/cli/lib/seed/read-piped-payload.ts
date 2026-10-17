import { installableSeedPayloadSchema, type SeedPayload } from "@workspace/matrix/seed";

import { formatZodErrors } from "../schema-validator.js";
import { getErrorMessage } from "../../utils/errors.js";
import { stripTerminalControls, truncateText } from "../../utils/string.js";

export type PipedPayload =
  | { readonly ok: true; readonly payload: SeedPayload }
  | { readonly ok: false; readonly error: string };

export const NOTHING_PIPED =
  "--stdin expects a configuration on standard input and none arrived. Pipe one in, as 'cat proposal.json | agents-inc share --stdin'.";

export const STDIN_IS_A_TERMINAL =
  "--stdin expects a configuration on standard input, but standard input is a terminal. Pipe one in rather than typing it.";

/** Characters of a non-JSON body to quote back, enough for the caller to recognise it. */
const EXCERPT = 80;

/**
 * The scope rule raises one issue per (skill, sub-agent) pair, so the list can run to hundreds.
 * A count, not a character cut, so no name is left half-printed.
 */
const PROBLEMS_NAMED = 4;

/**
 * Fails locally before a write is spent. Uses the installable schema the store's POST validates
 * with, not the lenient read schema, so nothing passes here and fails at the edge.
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

type JsonRead =
  | { readonly parsed: true; readonly value: unknown }
  | { readonly parsed: false; readonly reason: string };

function readJson(body: string): JsonRead {
  try {
    return { parsed: true, value: JSON.parse(body) };
  } catch (error) {
    return { parsed: false, reason: getErrorMessage(error) };
  }
}

/** The parse reason is stripped too: V8 quotes the offending input verbatim in it. */
function notJsonMessage(body: string, reason: string): string {
  const opening = truncateText(body.trim(), EXCERPT);
  const said = stripTerminalControls(reason);
  return `What arrived on standard input is not JSON: ${said}. It began: ${opening}`;
}

function refusedByContract(problems: string[]): string {
  return `The configuration on standard input is not one this store accepts: ${namedProblems(problems)}`;
}

/** The count tells a clipped list from a complete one. */
function namedProblems(problems: string[]): string {
  const named = problems.slice(0, PROBLEMS_NAMED).join("; ");
  const elided = problems.length - PROBLEMS_NAMED;
  return elided > 0 ? `${named} (and ${elided} more)` : named;
}
