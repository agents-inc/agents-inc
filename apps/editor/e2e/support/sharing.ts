import {
  ACME_SKILL_ID,
  CONFIGS_URL,
  DEAD_LINK_ID,
  DRIFTED_IMPORT_ID,
  DRIFTED_MARKETPLACE_PAYLOAD,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  OUT_OF_DATE,
  OUT_OF_SCOPE_IMPORT_ID,
  OUT_OF_SCOPE_PAYLOAD,
  PRIVATE_IMPORT_ID,
  PRIVATE_MARKETPLACE_PAYLOAD,
  RETIRED_SKILL_ID,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_UNAVAILABLE,
  configHandlers,
  configRefusedHandlerFor,
  configUnreachableHandler,
  missingConfigHandlerFor,
  storedConfigHandlerFor,
} from "@workspace/api-mocks"
import { getResponse, http } from "msw"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"
import type { JsonBodyType, PathParams } from "msw"

// The sharing worker is the app's second network dependency (after GitHub
// search). The specs mock it at the browser boundary: what these test is the
// app's half of the round trip, not KV — apps/server has its own suite.
//
// The handlers and the payloads are `@workspace/api-mocks`', the same ones the
// Vitest suite runs; `stubWith` supplies only the interception a real browser
// needs, so a change to the contract cannot land in one suite and not the
// other. Nothing below decides what the worker SAYS — only which of its
// answers a spec is standing in front of.

// Re-exported so a spec still reaches the whole seam through one import.
export {
  ACME_SKILL_ID,
  DEAD_LINK_ID,
  DRIFTED_IMPORT_ID,
  DRIFTED_MARKETPLACE_PAYLOAD,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  OUT_OF_DATE,
  OUT_OF_SCOPE_IMPORT_ID,
  OUT_OF_SCOPE_PAYLOAD,
  PRIVATE_IMPORT_ID,
  PRIVATE_MARKETPLACE_PAYLOAD,
  RETIRED_SKILL_ID,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_UNAVAILABLE,
}

/**
 * The store answering as it does when nothing has gone wrong: the POST mints
 * the content address, and the GET holds one payload and knows no other id.
 */
export const stubCreateConfig = (page: Page) => stubWith(page, configHandlers)

// The same stub, keeping what was sent. The POST body *is* the contract with
// the CLI, so a spec asserting on the wire needs the request rather than the
// id the worker answers with. Appended in order: minting happens once per
// install-dialog open, so a spec comparing two configurations reads the
// entries it added around each one.
//
// A SPY AND NOTHING ELSE, which is what it was not for as long as it existed
// (CLI-861). It answered `mintedConfig()` unconditionally while sitting AHEAD
// of the validating handlers it re-passes, so the third `POST /configs` double
// in this repository was still minting 201 for a body the route refuses — and
// since it is the resting answer every spec that captures a POST stands in
// front of (`grep -rn captureCreateConfig e2e/specs`), its permissiveness was
// the one that counted. A double looser than the route it stands in for cannot
// fail, and one that cannot fail is not a test of whatever posts to it: the
// editor's pre-POST guard (CLI-851) could have been deleted in full with every
// spec built on this stub still green.
export const captureCreateConfig = (page: Page) => {
  const posted: Record<string, unknown>[] = []

  stubWith(page, [
    http.post<PathParams, Record<string, unknown>>(
      CONFIGS_URL,
      async ({ request }) => {
        // A body can be consumed once, and both steps below want it — so one
        // of them reads a clone. It is the CLONE that gets forwarded rather
        // than recorded, because `request.json()` is the half msw has typed:
        // reading the clone instead would hand `posted` an `any`.
        const forwarded = request.clone()

        // Kept as it arrived rather than parsed with `seedPayloadSchema`: the
        // schema strips keys it does not know, and what these specs check is
        // precisely that `model` and `effort` are *absent* from a skill.
        // Parsing would make that assertion pass for free.
        //
        // Recorded whatever the answer turns out to be. This log says what was
        // SENT, so a body the store refuses still lands in it — which is the
        // whole of what `expect(posted).toStrictEqual([])` claims in
        // scope-reach.spec.ts. Recording only what was accepted would leave
        // that assertion satisfied by an app posting the very payload the guard
        // in front of it exists to stop.
        posted.push(await request.json())

        // The worker's own answer rather than one written out here, so a spy
        // over the request says nothing about the response — and now that means
        // the VALIDATION too, not just the status. `configHandlers`' own POST
        // asks `installableSeedPayloadSchema` exactly as the route does, so
        // resolving through it leaves this file restating no rule of its own,
        // which is what the note at the top of it promises.
        return getResponse(configHandlers, forwarded)
      }
    ),
    ...configHandlers,
  ])

  return posted
}

/**
 * What the store answers a body handed straight to it, with no app in between.
 *
 * There is no route through the EDITOR to a body the write contract refuses:
 * `createSharedConfig` asks `installableSeedPayloadSchema` before the POST
 * (CLI-851), so nothing the app can be driven into sends one, and Share and
 * Install are disabled in front of it besides. A spec whose subject is what the
 * DOUBLE says therefore has to be the sender.
 *
 * Sent from the PAGE rather than from Node, because the page is where the
 * interception is: `@msw/playwright` routes the browser's requests back through
 * the handlers, and a `fetch` issued in Node would reach nothing at all.
 */
export const postToConfigStore = (page: Page, seed: unknown) =>
  page.evaluate(
    async ({ url, body }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

      const answered: unknown = await response.json()
      return { status: response.status, body: answered }
    },
    { url: CONFIGS_URL, body: seed }
  )

/**
 * The store holding one named id.
 *
 * The payload defaults to the public-catalogue one, so every spec written
 * before marketplaces existed reads exactly as it did — and it is JSON rather
 * than a `SeedPayload` because one spec serves back a body it captured off its
 * own POST, unparsed on purpose.
 */
export const stubGetConfig = (
  page: Page,
  id: string,
  payload: JsonBodyType = STORED_PAYLOAD
) => stubWith(page, [storedConfigHandlerFor(id, payload), ...configHandlers])

/** The store having never heard of one named id. */
export const stubGetConfigMissing = (page: Page, id: string) =>
  stubWith(page, [missingConfigHandlerFor(id), ...configHandlers])

/**
 * The POST refusing, named by the status it refuses with.
 *
 * The one route and no more, so a spec that already said what the GET holds
 * keeps saying it: anything this stub does not claim falls through to whatever
 * was installed before it.
 */
export const stubCreateConfigRefusal = (page: Page, status: number) =>
  stubWith(page, [configRefusedHandlerFor(status)])

/**
 * The POST never getting an answer at all, which is a different ending from
 * any refusal above — the worker never saw it, so there is no status to read.
 */
export const stubCreateConfigUnreachable = (page: Page) =>
  stubWith(page, [configUnreachableHandler])
