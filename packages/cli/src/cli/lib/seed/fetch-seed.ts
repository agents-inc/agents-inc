import { createApiClient } from "@workspace/api";
import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix/seed";

import { truncateText } from "../../utils/string.js";

/** The config store behind agentsinc.sh. Overridable so tests never touch the network. */
export const SEED_API_URL = process.env.AGENTS_INC_API_URL ?? "https://api.agentsinc.sh";

/**
 * Identifies this fetch as the CLI rather than a browser.
 *
 * `GET /configs/:id` is the only place either side can observe a config being *installed* rather
 * than merely built, and the worker can only separate that from someone opening a share link if
 * we say so. Without this the conversion signal does not exist.
 */
export const SEED_USER_AGENT = "agents-inc-cli";

/**
 * The worker's routes, typed from the worker itself, configured for a terminal.
 *
 * `credentials: "omit"` is named rather than left to the shared default. The default is `include`
 * because the editor's session is a cookie the browser holds; a terminal holds no cookie jar at
 * all, so inheriting that default would claim a session that cannot exist.
 *
 * Built once at module scope, like `SEED_API_URL` above and for the same reason — the base URL is
 * read from the environment once at import, so there is nothing per-call for a client to pick up.
 */
const store = createApiClient({
  baseUrl: SEED_API_URL,
  headers: { accept: "application/json", "user-agent": SEED_USER_AGENT },
  credentials: "omit",
});

/**
 * How much of the store's account of a refused read to quote back.
 *
 * Sized on what this route really says, which is one short line per refusal: `Stored config is
 * unreadable` and `Could not read this config` are both under thirty characters. This holds the
 * longer of them four times over — room for that sentence to grow into a real one, and none for
 * anything that has stopped being a sentence.
 *
 * Far short of the 300-character `EXPLANATION_BUDGET` in `publish-seed.ts`, and for the reason
 * that one gives for its own size rather than in spite of it: a budget is sized on what the store
 * really writes there, and what it writes there is a list of schema issues naming a skill and a
 * sub-agent apiece. Neither number is a policy about terminals; each is a measurement of one
 * route.
 */
const EXPLANATION_BUDGET = 120;

/** The content type the store's own refusals arrive as, and the only one worth reading. */
const QUOTABLE_TYPE = "text/plain";

/** The status the store spends on an id it has never held, which is the one it is asked for. */
const NO_SUCH_CONFIG = 404;

export type FetchSeedResult = { ok: true; payload: SeedPayload } | { ok: false; error: string };

/**
 * Fetches and validates a shared configuration.
 *
 * Every failure is a message rather than a throw: this runs before anything has been written, so
 * there is nothing to roll back and the caller's job is to explain rather than recover.
 */
export async function fetchSeedConfig(id: string): Promise<FetchSeedResult> {
  let response: Response;
  try {
    // Escaped here rather than by the client: hono's `replaceUrlParam` substitutes a path
    // parameter verbatim, so an id carrying a `/` or a `?` would silently address another route.
    response = await store.configs[":id"].$get({ param: { id: encodeURIComponent(id) } });
  } catch {
    return { ok: false, error: `Could not reach ${SEED_API_URL} — check your connection.` };
  }

  // Ahead of the quoting arm below, and the only status held out of it. The store answers this
  // one `No config under this id`, which says strictly less than the sentence here does — it does
  // not name the id the caller typed, and that is the whole of what a person needs to see.
  if (response.status === NO_SUCH_CONFIG) {
    return { ok: false, error: `No configuration found for id '${id}'.` };
  }
  if (!response.ok) {
    return { ok: false, error: await refusalMessage(response) };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "The configuration store returned something that is not JSON." };
  }

  const parsed = seedPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Names the remedy rather than a cause it cannot observe. The payload was validated by the
    // store on the way IN, so a stored payload that no longer parses means the contract moved
    // underneath it — and every way that happens lands in this one `safeParse`: an id minted
    // before a version bump, an id minted after one, and a body that is simply broken. The CLI
    // cannot tell them apart, and the one thing true of all three is that re-sharing fixes it,
    // because the store content-addresses an id and a fresh share mints one under this version.
    return {
      ok: false,
      error: `Configuration '${id}' is not in a format this version of the CLI can install. Shared ids are never migrated — re-share the configuration to mint a current one, or update the CLI if that id came from a newer version.`,
    };
  }

  return { ok: true, payload: parsed.data };
}

/**
 * A refusal, carrying the store's own account of it wherever there is one to have.
 *
 * The same posture `refusalMessage` in `publish-seed.ts` takes on the write side, and deliberately
 * NOT the same mechanism. That route's 400 arrives as a `@hono/zod-validator` envelope with the
 * refused issues rendered inside it; `getConfig` writes every one of its refusals with `c.text`,
 * so there is no envelope here to parse and a copy of that parser would find nothing in any body
 * this route can produce.
 *
 * The status is never given up. It is what separates a store that is present and holding bytes it
 * can no longer read (500) from one that would not answer at all (503) — and what the body then
 * adds is the store saying which of its own failures this was, in words the status has no room
 * for.
 */
async function refusalMessage(response: Response): Promise<string> {
  const refused = `Fetching configuration failed (HTTP ${response.status}).`;
  const explanation = explanationOf(await refusalBody(response));

  return explanation === undefined ? refused : `${refused} The store said: ${explanation}`;
}

/**
 * Whatever the store sent, as far as it can be read — and only where it was the store that sent it.
 *
 * Nothing below this line is worth failing over: the message being assembled is already a failure,
 * and a body that cannot be read is one more thing the status will have to cover on its own.
 * Draining the stream can throw in its own right — a connection dropped mid-body — which is why
 * the `try` is around the read.
 */
async function refusalBody(response: Response): Promise<string | undefined> {
  if (!arrivedAsText(response)) return undefined;

  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

/**
 * Whether what arrived is the store speaking, as far as the wire says it is.
 *
 * `getConfig` writes every refusal with `c.text(...)`, so `text/plain` is the shape the store's
 * own words take on this route. What arrives as anything else did not come from it: a proxy, a
 * WAF, a captive portal or a gateway answering in its place — and their answer is markup rather
 * than prose, which quoted into a terminal is a screenful of tags that explains nothing and buries
 * the status that does.
 *
 * This is the plain-text half of what `refusalSchema` does for `publish-seed.ts`. That side has a
 * SHAPE a foreign body fails to be; a sentence has no shape, so the wire's own statement of what
 * it sent is the only discriminator there is. It is not proof — a hostile answer may claim any
 * type it likes — which is what {@link EXPLANATION_BUDGET} is for, and why what survives both is
 * attributed to the store rather than spoken in the CLI's own voice.
 */
function arrivedAsText(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").startsWith(QUOTABLE_TYPE);
}

/** The store's account of a refusal, where what came back really is one. */
function explanationOf(body: string | undefined): string | undefined {
  if (body === undefined) return undefined;

  const said = body.trim();
  if (said === "") return undefined;

  return truncateText(said, EXPLANATION_BUDGET);
}
