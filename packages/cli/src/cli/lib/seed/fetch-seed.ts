import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix/seed";

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

export type FetchSeedResult = { ok: true; payload: SeedPayload } | { ok: false; error: string };

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
