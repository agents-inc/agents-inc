import { createApiClient } from "@workspace/api";
import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix/seed";

import { SEED_API_URL } from "../../consts.js";
import { truncateText } from "../../utils/string.js";

/** Lets the worker tell an install from someone opening a share link. */
export const SEED_USER_AGENT = "agents-inc-cli";

// `credentials: "omit"`: the shared default `include` is for the editor's cookie session.
const store = createApiClient({
  baseUrl: SEED_API_URL,
  headers: { accept: "application/json", "user-agent": SEED_USER_AGENT },
  credentials: "omit",
});

/** This route's refusals are one short line each; this holds the longest four times over. */
const EXPLANATION_BUDGET = 120;

const QUOTABLE_TYPE = "text/plain";

const NO_SUCH_CONFIG = 404;

export type FetchSeedResult = { ok: true; payload: SeedPayload } | { ok: false; error: string };

export async function fetchSeedConfig(id: string): Promise<FetchSeedResult> {
  const response = await requestFromStore(id);
  if (response === null) {
    return { ok: false, error: `Could not reach ${SEED_API_URL} — check your connection.` };
  }

  // Not quoted: the store's 404 text does not name the id the caller typed.
  if (response.status === NO_SUCH_CONFIG) {
    return { ok: false, error: `No configuration found for id '${id}'.` };
  }
  if (!response.ok) {
    return { ok: false, error: await refusalMessage(response) };
  }

  return payloadIn(await jsonBodyOrUndefined(response), id);
}

/** Null where the store could not be reached at all. */
async function requestFromStore(id: string): Promise<Response | null> {
  try {
    // hono substitutes path params verbatim, so a `/` or `?` in an id would address another route.
    return await store.configs[":id"].$get({ param: { id: encodeURIComponent(id) } });
  } catch {
    return null;
  }
}

/** Undefined where the body is not JSON, which no JSON document parses to. */
export async function jsonBodyOrUndefined(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function payloadIn(body: unknown, id: string): FetchSeedResult {
  if (body === undefined) {
    return { ok: false, error: "The configuration store returned something that is not JSON." };
  }

  const parsed = seedPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // The store validated it on the way in, so the contract moved; the causes are indistinguishable
    // here and re-sharing fixes all of them.
    return {
      ok: false,
      error: `Configuration '${id}' is not in a format this version of the CLI can install. Shared ids are never migrated — re-share the configuration to mint a current one, or update the CLI if that id came from a newer version.`,
    };
  }

  return { ok: true, payload: parsed.data };
}

/** This route refuses with plain `c.text`, so unlike `publish-seed.ts` there is no envelope to parse. */
async function refusalMessage(response: Response): Promise<string> {
  const refused = `Fetching configuration failed (HTTP ${response.status}).`;
  const explanation = explanationOf(await refusalBody(response));

  return explanation === undefined ? refused : `${refused} The store said: ${explanation}`;
}

/** Never throws: draining can fail mid-body, and the status then stands alone. */
async function refusalBody(response: Response): Promise<string | undefined> {
  if (!arrivedAsText(response)) return undefined;

  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

/** Anything not `text/plain` came from a proxy or gateway in the store's place, not the store. */
export function arrivedAsText(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").startsWith(QUOTABLE_TYPE);
}

function explanationOf(body: string | undefined): string | undefined {
  if (body === undefined) return undefined;

  const said = body.trim();
  if (said === "") return undefined;

  return truncateText(said, EXPLANATION_BUDGET);
}
