import { seedPayloadSchema, type SeedPayload } from "./seed-schema.js";

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

export type FetchSeedResult =
  | { ok: true; payload: SeedPayload }
  | { ok: false; error: string };

/**
 * Fetches and validates a shared configuration.
 *
 * Every failure is a message rather than a throw: this runs before anything has been written, so
 * there is nothing to roll back and the caller's job is to explain rather than recover.
 */
export async function fetchSeedConfig(id: string): Promise<FetchSeedResult> {
  const url = `${SEED_API_URL}/configs/${encodeURIComponent(id)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": SEED_USER_AGENT },
    });
  } catch {
    return { ok: false, error: `Could not reach ${SEED_API_URL} — check your connection.` };
  }

  if (response.status === 404) {
    return { ok: false, error: `No configuration found for id '${id}'.` };
  }
  if (!response.ok) {
    return { ok: false, error: `Fetching configuration failed (HTTP ${response.status}).` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "The configuration store returned something that is not JSON." };
  }

  const parsed = seedPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Validated on the way in, so a stored payload that no longer parses means the contract moved
    // underneath it — worth saying plainly rather than reporting a generic failure.
    return {
      ok: false,
      error: `Configuration '${id}' does not match the expected format — it may have been created by a newer version.`,
    };
  }

  return { ok: true, payload: parsed.data };
}
