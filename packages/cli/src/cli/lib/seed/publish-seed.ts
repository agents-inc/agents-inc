import { STATUS_CODES } from "node:http";

import { z } from "zod";

import { SEED_API_URL, SEED_USER_AGENT } from "./fetch-seed.js";
import { CLI_INVOKE_COMMAND } from "../../consts.js";
import { truncateText } from "../../utils/string.js";

import type { SeedPayload } from "@workspace/matrix/seed";

/**
 * The store answers a stored configuration with its content-addressed id and nothing else.
 * Revalidated rather than read off the response type, because that type describes the worker this
 * CLI was built against and what answers is whatever is deployed.
 */
const mintedSchema = z.object({ id: z.string().min(1) });

/**
 * The envelope a refused POST arrives in.
 *
 * `apps/server` registers no `defaultHook` and its own hook narrows only the seed-version case,
 * so every other refused body falls through to `@hono/zod-validator`, which answers
 * `c.json(result, 400)` — the whole `safeParse` result. A `ZodError` has no own enumerable fields
 * beyond `name` and `message`, so `{ success: false, error: { name, message } }` is what crosses
 * the wire. Only that string is read here; everything else is shape to match against.
 */
const refusalSchema = z.object({ error: z.object({ message: z.string() }) });

/**
 * What that string really is, which is the part worth knowing: Zod renders its ISSUES into
 * `message` as a JSON document, so the field named `message` is not something to show a person.
 * The sentences the store's own schema wrote are one level further in, and reading them back out
 * is the whole difference between a bare `HTTP 400` and a refusal that names what is wrong.
 */
const refusedIssuesSchema = z
  .array(
    z.object({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string().min(1),
    }),
  )
  .min(1);

/**
 * How much of the store's account of a refusal to quote back.
 *
 * The refusal it really writes is one sentence naming a skill and a sub-agent — around 150
 * characters — so this holds that whole, and a second beside it. Past that a body has stopped
 * being an explanation, and a store replaced by a proxy, a captive portal or something worse must
 * not get to paint the terminal. The same reasoning as `EXCERPT` in `read-piped-payload.ts`, at
 * the length this quote needs: that one bounds unreadable bytes shown so a user recognises them,
 * where this one bounds prose the user has to be able to finish reading.
 *
 * ONE budget for both shapes this route answers in, rather than one apiece, because a budget is a
 * measurement of a ROUTE and both are `POST /configs`. The plain-text refusals it writes are far
 * shorter than a list of schema issues — the longest is `Could not store this config` — so the
 * number sized on the longer shape holds the shorter one with room to spare. `fetch-seed.ts` sets
 * 120 for its own route and neither number travels between them; see the 2026-09-01 finding on
 * quoting a refusal's body.
 */
const EXPLANATION_BUDGET = 300;

/** The content type the store's own sentences arrive as — the only one worth reading as prose. */
const QUOTABLE_TYPE = "text/plain";

/** The status the store spends on a payload naming a version of the contract it does not serve. */
const CONTRACT_MISMATCH = 409;

/**
 * What a 409 means from a terminal, said in the CLI's own words rather than the store's.
 *
 * This is the one refusal whose entire purpose is naming a remedy, and the store's body names one
 * a terminal cannot carry out: `refuseAnotherSeedVersion` in `apps/server/src/index.ts` answers
 * `Reload the page: ...`, written for the caller that refusal was designed around — a browser tab
 * minting from a bundle older than the last deploy, for which one reload really is the whole fix.
 * There is no page here. Quoting it would be worse than the bare status it replaced, because the
 * bare status at least does not send the reader somewhere that does not exist.
 *
 * The fact underneath is the same one, and from a terminal it is actionable: `SEED_VERSION` is a
 * `z.literal` imported from `@workspace/matrix/seed` and bundled into this binary, so the version
 * written here travels INSIDE the CLI. Nothing about the configuration, the directory it was read
 * from or the pipe it arrived on can change it, and a newer CLI is the only thing that can.
 *
 * It cannot be the payload's fault by either door: `read-piped-payload.ts` validates a piped
 * configuration against `installableSeedPayloadSchema` before this runs, and `config-to-seed.ts`
 * writes `SEED_VERSION` into one it builds — so a `v` this CLI does not itself name never reaches
 * the wire, and a 409 can only be the two ends disagreeing.
 *
 * It names no sub-command, which is deliberate twice over. `publishSeedConfig` is called by both
 * `share` and `edit --ui`, so there is no one command to re-run; and an invocation written after
 * `@latest` is invisible to `handed-out-invocations.ts`, whose reader matches
 * `${CLI_INVOKE_COMMAND}` followed by a SPACE — so naming one here would hand out a command the
 * gate that runs every handed-out command could not see.
 */
const OUT_OF_DATE_AGAINST_STORE =
  `This CLI is out of date against the configuration store: it writes a version of the sharing ` +
  `contract the store does not serve, and that version travels inside the CLI rather than with ` +
  `the configuration. Re-run this command through '${CLI_INVOKE_COMMAND}@latest'.`;

export type PublishSeedResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Stores a configuration and returns the id it was given.
 *
 * The outbound half of the boundary `fetchSeedConfig` in `fetch-seed.ts` owns the inbound half
 * of, and it keeps the same posture: every failure is a message rather than a throw.
 * Nothing local has been written by the time this runs, so there is nothing to roll back and the
 * caller's only job is to explain.
 *
 * The id is the payload's own hash, so re-sharing an unchanged configuration returns the id it
 * had — the store spends no write, and a caller can share as often as it likes.
 */
export async function publishSeedConfig(payload: SeedPayload): Promise<PublishSeedResult> {
  const url = `${SEED_API_URL}/configs`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        // The same signal the fetch half sends: it is the only thing that tells the store a
        // configuration came from the CLI rather than from a browser.
        "user-agent": SEED_USER_AGENT,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: `Could not reach ${SEED_API_URL} — check your connection.` };
  }

  if (!response.ok) return { ok: false, error: await refusalMessage(response) };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "The configuration store returned something that is not JSON." };
  }

  const minted = mintedSchema.safeParse(body);
  if (!minted.success) {
    // Reporting success here would print an id nobody can install and tell the user to use it.
    return { ok: false, error: "The configuration store did not return an id for this share." };
  }

  return { ok: true, id: minted.data.id };
}

/**
 * A refusal, carrying the store's own account of it wherever there is one to have.
 *
 * The status is never given up, because it is the only thing that separates a bad payload (400)
 * from a stale contract (409), a body over the cap (413), a rate limit (429) and a store that
 * refused the write (503). What it cannot do is say WHY a payload was bad, and the store already
 * knows: a refused POST answers with the issues its own schema raised, in plain English, naming
 * the skill and the sub-agent. Discarding that cost a real user a debugging session for a fault
 * the store had already described.
 *
 * Read for every status rather than for 400 alone — except the one status whose body is answering
 * somebody else. Which statuses carry which shape is the deployed worker's business, so both
 * shapes are tried against every body, and one that is neither degrades to the status anyway.
 */
async function refusalMessage(response: Response): Promise<string> {
  const refused = `Sharing this configuration failed (HTTP ${response.status}).`;

  // Branched on the status rather than on the body, because the status is the whole of the fact:
  // what a 409 says is that the two ends name different contract versions, and no body the store
  // could send makes that any more actionable from a terminal than the sentence above does.
  if (response.status === CONTRACT_MISMATCH) return `${refused} ${OUT_OF_DATE_AGAINST_STORE}`;

  const explanation = explanationOf(response, await refusalBody(response));

  return explanation === undefined ? refused : `${refused} The store said: ${explanation}`;
}

/**
 * Whatever the store sent, as text and unjudged.
 *
 * Deliberately NOT gated on the content type the way the function of this name in `fetch-seed.ts`
 * is, and the difference is the routes rather than a disagreement: that one answers every refusal
 * with `c.text`, where this one answers in two shapes under two types — the validator's envelope
 * as `application/json`, the worker's own sentences as `text/plain`. A gate here would throw one
 * of them away. It belongs on the prose arm alone, which is where {@link arrivedAsText} is.
 *
 * Nothing below this line is worth failing over: the message being assembled is already a
 * failure, and a body that cannot be read is one more thing the status will have to cover on its
 * own. Draining the stream can throw in its own right — a connection dropped mid-body — which is
 * why this is a `try` around the read.
 */
async function refusalBody(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

/** `JSON.parse` as a value rather than a throw, since a body that is not JSON is expected here. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The store's account of a refusal, in whichever of the two shapes this route answers in.
 *
 * The envelope is read first because it is the more specific of the two, and the order costs
 * nothing either way: an envelope arrives as JSON and could never satisfy the prose arm's
 * content-type gate, and prose has no shape for `refusalSchema` to match.
 *
 * The budget is spent here rather than inside either arm, so that whatever leaves this module is
 * bounded once, by one number belonging to one route.
 *
 * The body travels beside the response it came from rather than being taken off it, because by
 * the time this runs the stream has been drained and a second read would answer nothing.
 */
function explanationOf(response: Response, body: string | undefined): string | undefined {
  if (body === undefined) return undefined;

  const said = schemaIssuesIn(body) ?? quotableProseIn(response, body);

  return said === undefined ? undefined : truncateText(said, EXPLANATION_BUDGET);
}

/** The sentences the store's own schema wrote, read back out of the validator's envelope. */
function schemaIssuesIn(body: string): string | undefined {
  const refusal = refusalSchema.safeParse(jsonOf(body));
  if (!refusal.success) return undefined;

  const issues = refusedIssuesSchema.safeParse(jsonOf(refusal.data.error.message));
  if (!issues.success) return undefined;

  return issues.data.map(sentenceOf).join("; ");
}

/**
 * The store's own words, where the wire says the store wrote them and they say something.
 *
 * The three refusals this route writes with `c.text` — 413, 429 and 503 — reach a terminal by no
 * other arm, and before this they reached it by none at all. Two of the three are then discarded
 * again by {@link restatesItsOwnStatus}, which is the whole shape of the rule: what earns a quote
 * is not a body, it is a body that adds something to the status printed beside it.
 */
function quotableProseIn(response: Response, body: string): string | undefined {
  if (!arrivedAsText(response)) return undefined;

  const said = body.trim();
  if (said === "") return undefined;
  if (restatesItsOwnStatus(said, response.status)) return undefined;

  return said;
}

/**
 * Whether what arrived is the store speaking, as far as the wire says it is.
 *
 * `c.text(...)` is how this route writes every refusal that is not the validator's, so `text/plain`
 * is the shape the store's own words take. What arrives as anything else did not come from it: a
 * proxy, a WAF, a captive portal or a gateway answering in its place — and their answer is markup
 * rather than prose, which quoted into a terminal is a screenful of tags that explains nothing and
 * buries the status that does.
 *
 * A sentence has no shape to validate, so the wire's own statement of what it sent is the only
 * discriminator prose has — where the envelope beside it has `refusalSchema`, a shape a foreign
 * body fails to be. It is not proof, since a hostile answer may claim any type it likes, which is
 * what {@link EXPLANATION_BUDGET} is for and why what survives both is attributed to the store
 * rather than spoken in the CLI's own voice.
 */
function arrivedAsText(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").startsWith(QUOTABLE_TYPE);
}

/**
 * Whether the body says only what the status line printed beside it has already said.
 *
 * `node:http`'s `STATUS_CODES` is the registry of reason phrases a status line carries, so holding
 * a body against it is a rule about the whole class rather than a list of the statuses it happens
 * to catch today. It catches two: `Too many requests` is 429's `Too Many Requests` re-cased and
 * `Payload too large` is 413's, so neither is named here and a fourth refusal written the same way
 * is suppressed the day it ships. `Could not store this config` is not `Service Unavailable`, which
 * is why the one refusal on this route that names a cause is the one that survives.
 *
 * Compared case-insensitively, and against the trimmed body, because the worker writes sentence
 * case where the registry writes title case and that is not a difference in meaning.
 */
function restatesItsOwnStatus(said: string, status: number): boolean {
  const reason = STATUS_CODES[status];

  return reason !== undefined && said.toLowerCase() === reason.toLowerCase();
}

/** One issue as it arrives, read off the schema above so the two cannot drift apart. */
type RefusedIssue = z.infer<typeof refusedIssuesSchema>[number];

/**
 * One issue, path first — the same rendering `formatZodIssue` in `lib/schema-validator.ts` gives
 * a local one, and deliberately the same sentence a user sees from `share --stdin`.
 *
 * It cannot call that function: this issue was read off a wire and is a plain object, where
 * `formatZodIssue` takes a `z.ZodIssue`, a discriminated union nothing arriving over HTTP can be
 * narrowed to without a cast. The path is what the sentence itself cannot carry — the store's
 * message names the sub-agent and the path names the skill.
 */
function sentenceOf(issue: RefusedIssue): string {
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}
