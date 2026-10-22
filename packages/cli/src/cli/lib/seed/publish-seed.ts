import { STATUS_CODES } from "node:http";

import { retryAfterSeconds } from "@workspace/api";
import { z } from "zod";

import { arrivedAsText, jsonBodyOrUndefined, SEED_API_URL, SEED_USER_AGENT } from "./fetch-seed.js";
import { CLI_INVOKE_COMMAND } from "../../consts.js";
import { plural, truncateText } from "../../utils/string.js";

import type { SeedPayload } from "@workspace/matrix/seed";

/** Revalidated: the deployed worker may not match the one this CLI was built against. */
const mintedSchema = z.object({ id: z.string().min(1) });

/** `@hono/zod-validator` sends the `safeParse` result; its error crosses as `{ name, message }`. */
const refusalSchema = z.object({ error: z.object({ message: z.string() }) });

/** Zod renders its issues into `message` as JSON; the readable sentences are inside. */
const refusedIssuesSchema = z
  .array(
    z.object({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string().min(1),
    }),
  )
  .min(1);

/** Holds about two of the store's refusal sentences; a longer body must not paint the terminal. */
const EXPLANATION_BUDGET = 300;

const CONTRACT_MISMATCH = 409;

const RATE_LIMITED = 429;

/** The editor's `limitReachedNote` wording, so both front doors say it alike. */
const LIMIT_REACHED = "rate limit reached — try again in";

const SECONDS_PER_MINUTE = 60;

/**
 * The store's 409 body says "Reload the page", which a terminal cannot do. The seed version is
 * bundled into the CLI, so only a newer CLI fixes it.
 */
const OUT_OF_DATE_AGAINST_STORE =
  `This CLI is out of date against the configuration store: it writes a version of the sharing ` +
  `contract the store does not serve, and that version travels inside the CLI rather than with ` +
  `the configuration. Re-run this command through '${CLI_INVOKE_COMMAND}@latest'.`;

export type PublishSeedResult = { ok: true; id: string } | { ok: false; error: string };

/** Every failure is a message rather than a throw. */
export async function publishSeedConfig(payload: SeedPayload): Promise<PublishSeedResult> {
  const response = await postToStore(payload);
  if (response === null) {
    return { ok: false, error: `Could not reach ${SEED_API_URL} — check your connection.` };
  }

  if (!response.ok) return { ok: false, error: await refusalMessage(response) };

  return mintedIdIn(await jsonBodyOrUndefined(response));
}

/** Null where the store could not be reached at all. */
async function postToStore(payload: SeedPayload): Promise<Response | null> {
  try {
    return await fetch(`${SEED_API_URL}/configs`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        // Tells the store the configuration came from the CLI rather than a browser.
        "user-agent": SEED_USER_AGENT,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return null;
  }
}

function mintedIdIn(body: unknown): PublishSeedResult {
  if (body === undefined) {
    return { ok: false, error: "The configuration store returned something that is not JSON." };
  }

  const minted = mintedSchema.safeParse(body);
  if (!minted.success) {
    return { ok: false, error: "The configuration store did not return an id for this share." };
  }

  return { ok: true, id: minted.data.id };
}

/** Always names the status, and quotes the store's own explanation when it gives one. */
async function refusalMessage(response: Response): Promise<string> {
  const failed = `Sharing this configuration failed (HTTP ${response.status})`;
  const refused = `${failed}.`;

  if (response.status === CONTRACT_MISMATCH) return `${refused} ${OUT_OF_DATE_AGAINST_STORE}`;

  const window = rateLimitWindow(response);
  if (window !== null) return `${failed}: ${LIMIT_REACHED} ${waitOf(window)}.`;

  const explanation = explanationOf(response, await refusalBody(response));

  return explanation === undefined ? refused : `${refused} The store said: ${explanation}`;
}

/** Seconds to wait out, or `null` where this is no 429 or its window is unreadable. */
function rateLimitWindow(response: Response): number | null {
  return response.status === RATE_LIMITED ? retryAfterSeconds(response) : null;
}

/** Minutes round up, so nobody is sent back early. */
function waitOf(seconds: number): string {
  return seconds < SECONDS_PER_MINUTE
    ? plural(seconds, "second")
    : plural(Math.ceil(seconds / SECONDS_PER_MINUTE), "minute");
}

/** Not gated on content type: this route refuses as JSON and as plain text. */
async function refusalBody(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function explanationOf(response: Response, body: string | undefined): string | undefined {
  if (body === undefined) return undefined;

  const said = schemaIssuesIn(body) ?? quotableProseIn(response, body);

  return said === undefined ? undefined : truncateText(said, EXPLANATION_BUDGET);
}

function schemaIssuesIn(body: string): string | undefined {
  const refusal = refusalSchema.safeParse(jsonOf(body));
  if (!refusal.success) return undefined;

  const issues = refusedIssuesSchema.safeParse(jsonOf(refusal.data.error.message));
  if (!issues.success) return undefined;

  return issues.data.map(sentenceOf).join("; ");
}

/** Quoted only when it adds something to the status printed beside it. */
function quotableProseIn(response: Response, body: string): string | undefined {
  if (!arrivedAsText(response)) return undefined;

  const said = body.trim();
  if (said === "") return undefined;
  if (restatesItsOwnStatus(said, response.status)) return undefined;

  return said;
}

/** Case-insensitive: the worker writes sentence case where the reason phrase is title case. */
function restatesItsOwnStatus(said: string, status: number): boolean {
  const reason = STATUS_CODES[status];

  return reason !== undefined && said.toLowerCase() === reason.toLowerCase();
}

type RefusedIssue = z.infer<typeof refusedIssuesSchema>[number];

/** Renders like `formatZodIssue`, which cannot take a plain object read off the wire. */
function sentenceOf(issue: RefusedIssue): string {
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}
