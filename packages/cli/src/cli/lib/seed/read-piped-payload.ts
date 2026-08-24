import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix/seed";

import { formatZodErrors } from "../schema-validator.js";
import { getErrorMessage } from "../../utils/errors.js";

/** A payload read from a pipe, or the reason it could not be. */
export type PipedPayload =
  | { readonly ok: true; readonly payload: SeedPayload }
  | { readonly ok: false; readonly error: string };

export const NOTHING_PIPED =
  "--stdin expects a configuration on standard input and none arrived. Pipe one in, as 'cat proposal.json | agents-inc share --stdin'.";

export const STDIN_IS_A_TERMINAL =
  "--stdin expects a configuration on standard input, but standard input is a terminal. Pipe one in rather than typing it.";

/** How much of a body to quote back when it is not JSON, so a refusal names what it read. */
const EXCERPT = 80;

/**
 * Everything that can fail locally, failing before the caller spends a write.
 *
 * The store's free tier allows a thousand writes a day against a hundred times that in reads, so
 * a write is the scarce half — and one spent on a payload the decoder cannot read buys a dead
 * link. Each of the three refusals below is a different mistake and says which: nothing arrived,
 * what arrived is not JSON, or it is JSON the contract does not accept.
 *
 * `seedPayloadSchema` rather than a shape written here, and that is the point of publishing from
 * the CLI at all. `SEED_VERSION` is a `z.literal`, so a producer that hardcodes the wire format
 * emits payloads the store refuses the day it moves; the schema travels with the code that posts.
 */
export function readPipedPayload(body: string): PipedPayload {
  if (body.trim() === "") return { ok: false, error: NOTHING_PIPED };

  const read = readJson(body);
  if (!read.parsed) return { ok: false, error: notJsonMessage(body, read.reason) };

  const result = seedPayloadSchema.safeParse(read.value);
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

function notJsonMessage(body: string, reason: string): string {
  return `What arrived on standard input is not JSON: ${reason}. It began: ${excerptOf(body)}`;
}

function refusedByContract(problems: string[]): string {
  return `The configuration on standard input is not one this store accepts: ${problems.join("; ")}`;
}

function excerptOf(body: string): string {
  const opening = body.trim().slice(0, EXCERPT);
  return body.trim().length > EXCERPT ? `${opening}…` : opening;
}
