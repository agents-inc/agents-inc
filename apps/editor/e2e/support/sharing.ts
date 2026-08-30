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
  mintedConfig,
  missingConfigHandlerFor,
  storedConfigHandlerFor,
} from "@workspace/api-mocks"
import { http } from "msw"

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
export const captureCreateConfig = (page: Page) => {
  const posted: Record<string, unknown>[] = []

  stubWith(page, [
    http.post<PathParams, Record<string, unknown>>(
      CONFIGS_URL,
      async ({ request }) => {
        // Kept as it arrived rather than parsed with `seedPayloadSchema`: the
        // schema strips keys it does not know, and what these specs check is
        // precisely that `model` and `effort` are *absent* from a skill.
        // Parsing would make that assertion pass for free.
        posted.push(await request.json())

        // The worker's own answer rather than one written out here, so a spy
        // over the request says nothing about the response.
        return mintedConfig()
      }
    ),
    ...configHandlers,
  ])

  return posted
}

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
