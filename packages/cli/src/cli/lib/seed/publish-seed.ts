import { z } from "zod";

import { SEED_API_URL, SEED_USER_AGENT } from "./fetch-seed.js";

import type { SeedPayload } from "@workspace/matrix/seed";

/**
 * The store answers a stored configuration with its content-addressed id and nothing else.
 * Revalidated rather than read off the response type, because that type describes the worker this
 * CLI was built against and what answers is whatever is deployed.
 */
const mintedSchema = z.object({ id: z.string().min(1) });

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

  if (!response.ok) {
    return { ok: false, error: `Sharing this configuration failed (HTTP ${response.status}).` };
  }

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
