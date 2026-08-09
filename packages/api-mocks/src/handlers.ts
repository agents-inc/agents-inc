import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { http, HttpResponse } from "msw"

import {
  NO_CONFIG_BODY,
  SKILL_INDEX,
  SKILL_INDEX_UNAVAILABLE_BODY,
  STALE_SKILL_INDEX,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_REFUSED_BODY,
  UNREADABLE_CONFIG_BODY,
  UNREADABLE_CONFIG_ID,
  WORKER_ORIGIN,
} from "./fixtures"

// One mock of the three routes apps/editor calls. `/monitoring` is the worker's
// fourth route and is deliberately absent: Sentry's SDK reaches it, no code in
// the editor does, and a handler nothing calls is a claim nothing checks.

const CREATE_CONFIG_URL = `${WORKER_ORIGIN}/configs`
const READ_CONFIG_URL = `${WORKER_ORIGIN}/configs/:id`
const SKILL_INDEX_URL = `${WORKER_ORIGIN}/skills`

const CREATED = 201
const NOT_FOUND = 404
const INTEGRITY_FAILURE = 500
const STORE_UNAVAILABLE = 503

// The id is content-addressed, so the real worker mints the same one for the
// same payload every time — which is what makes answering with a constant
// faithful rather than a simplification.
const createConfig = http.post(CREATE_CONFIG_URL, () =>
  HttpResponse.json({ id: STORED_ID }, { status: CREATED })
)

// Which answer comes back is decided by the id, exactly as the store decides
// it: one id holds a payload, one holds bytes that no longer parse, and every
// other id — including `DEAD_LINK_ID` — has never been seen. That default is
// the worker's own behaviour, not a fallback invented here.
const readConfig = http.get<{ id: string }>(READ_CONFIG_URL, ({ params }) => {
  if (params.id === STORED_ID) return HttpResponse.json(STORED_PAYLOAD)

  if (params.id === UNREADABLE_CONFIG_ID) {
    return HttpResponse.text(UNREADABLE_CONFIG_BODY, {
      status: INTEGRITY_FAILURE,
    })
  }

  return HttpResponse.text(NO_CONFIG_BODY, { status: NOT_FOUND })
})

/** The worker answering as it does when nothing has gone wrong. */
export const configHandlers = [createConfig, readConfig]

/**
 * KV refusing the write — the one failure the POST has that no request can
 * provoke, since the body was built from the contract's own schema. Installed
 * per test with `configMockServer.use(...)` rather than living in the default
 * set, because a store that always refuses is not the worker's resting state.
 */
export const storeRefusedHandler = http.post(CREATE_CONFIG_URL, () =>
  HttpResponse.text(STORE_REFUSED_BODY, { status: STORE_UNAVAILABLE })
)

// The index as the worker serves it when the daily build behind it is landing:
// the whole thing, every allowlisted repository, in one response. The freshness
// header travels with it because it is the half of the contract a body cannot
// carry.
const readSkillIndex = http.get(SKILL_INDEX_URL, () =>
  HttpResponse.json(SKILL_INDEX, {
    headers: { [SKILL_INDEX_FRESHNESS_HEADER]: "fresh" },
  })
)

/** The worker answering as it does when nothing has gone wrong. */
export const skillIndexHandlers = [readSkillIndex]

/**
 * The scheduled build behind the index has stopped landing, so what the worker
 * holds has been ageing for days. A 200 and not a 502 by design: a list of
 * external skills from last week is worth almost what today's is worth, and an
 * error is worth nothing. Installed per test with `configMockServer.use(...)`,
 * because a build that has stopped running is not the resting state.
 */
export const staleSkillIndexHandler = http.get(SKILL_INDEX_URL, () =>
  HttpResponse.json(STALE_SKILL_INDEX, {
    headers: { [SKILL_INDEX_FRESHNESS_HEADER]: "stale" },
  })
)

/**
 * The only case the route refuses outright: no index has been published to KV,
 * so there is genuinely nothing to serve. Reachable in production exactly once
 * — between a first deploy and the first scheduled build that succeeds — and
 * never again afterwards, because the published index carries no expiry.
 */
export const skillIndexUnavailableHandler = http.get(SKILL_INDEX_URL, () =>
  HttpResponse.text(SKILL_INDEX_UNAVAILABLE_BODY, { status: STORE_UNAVAILABLE })
)
