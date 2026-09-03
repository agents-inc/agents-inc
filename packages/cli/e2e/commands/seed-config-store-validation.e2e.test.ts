import { installableSeedPayloadSchema } from "@workspace/matrix/seed";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * The store's own POST validation, exercised with a raw `fetch` rather than through a spawned
 * CLI — a spawned CLI's `share`/`share --stdin` already refuses an unwritable payload LOCALLY
 * before any request leaves the process (see `share-stdin.e2e.test.ts`'s "refuses a project skill
 * on a global sub-agent without spending a write"), so nothing routed through the CLI can ever
 * exercise the store's OWN refusal. This file proves the store refuses on its own merits, exactly
 * as the worker would for a caller that is not this CLI (CLI-849).
 *
 * Lives under `commands/` rather than beside `seed-config-store.ts` in `fixtures/` — that
 * directory carries no spec of its own, and `dual-scope-helpers.initGlobalWithEject`'s entry on
 * `user-journeys.md`'s journey 1 is a code-symbol reference using the same `fixtures/` prefix
 * (`RECOGNISED_NON_SPEC_NAMES` in `spec-gates.test.ts`); a real spec there makes `fixtures` a
 * directory `classify()` expects to hold specs, which turns that symbol into a name the gate
 * cannot resolve. `commands/warn-suppression-stops-at-the-harness.e2e.test.ts` is the precedent
 * for a harness-subject spec sitting in `commands/` for exactly this reason.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

async function post(store: SeedConfigStore, payload: unknown): Promise<Response> {
  return fetch(`${store.url}/configs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("the seed config store's own POST validation", () => {
  let store: SeedConfigStore;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterEach(() => {
    store.reset();
  });

  afterAll(async () => {
    await store.close();
  });

  it("mints an id for a payload the write contract accepts", async () => {
    const payload = buildSeedPayload({
      skills: { [E2E_SKILL.react.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }) },
    });

    const response = await post(store, payload);

    expect(response.status).toBe(201);
    expect(store.minted).toHaveLength(1);
  });

  // THE ONE THAT REACHED A USER (see `share-stdin.e2e.test.ts`), posted directly at the store
  // rather than through the CLI's own local gate — proving the double refuses it on its own
  // merits, and not only because the CLI never sends it.
  it("refuses a project skill on a global sub-agent, exactly as the worker does, and mints nothing", async () => {
    const unwritable = buildSeedPayload({
      skills: {
        [E2E_SKILL.react.id]: buildSeedSkill({
          scope: "project",
          assignments: { [WEB_DEV]: "lazy" },
        }),
      },
    });
    const refused = installableSeedPayloadSchema.safeParse(unwritable);
    expect(refused.success, "the fixture must still be one the write contract refuses").toBe(false);

    const response = await post(store, unwritable);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(false);
    expect(store.minted, "an unwritable pair must mint nothing").toStrictEqual([]);
  });
});
