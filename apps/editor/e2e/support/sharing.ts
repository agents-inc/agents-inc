import type { Page } from "@playwright/test"

// The sharing worker is the app's second network dependency (after GitHub
// search). The specs mock it at the browser boundary: what these test is the
// app's half of the round trip, not KV — apps/server has its own suite.

export const SHARE_API = "http://localhost:8787"

export const STORED_ID = "Ab3xY9_Q"

// A payload as the worker would return it: real catalog ids, since the app
// prunes anything its catalog does not know.
//
// v2 moved model and effort off the skill and onto the agent, and gave agents
// their own top-level map. Both kinds of entry are here: an agent that travels
// only its overrides (derived on by the assignment below) and one that travels
// as `on: true` with nothing else — a bare base agent, which v1 could not
// express at all.
export const STORED_PAYLOAD = {
  v: 3,
  matrixVersion: "1.0.0",
  stackId: null,
  skills: {
    "web-framework-react": {
      install: "plugin",
      scope: "project",
      assignments: { "web-developer": "preloaded" },
    },
  },
  agents: {
    "web-developer": { model: "haiku", effort: "max" },
    "api-developer": { on: true },
  },
}

export const stubCreateConfig = (page: Page) =>
  page.route(`${SHARE_API}/configs`, (route) =>
    route.fulfill({ status: 201, json: { id: STORED_ID } })
  )

// The same stub, keeping what was sent. The POST body *is* the contract with
// the CLI, so a spec asserting on the wire needs the request rather than the
// id the worker answers with. Appended in order: minting happens once per
// install-dialog open, so a spec comparing two configurations reads the
// entries it added around each one.
export const captureCreateConfig = async (page: Page) => {
  const posted: Record<string, unknown>[] = []

  await page.route(`${SHARE_API}/configs`, (route) => {
    posted.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, json: { id: STORED_ID } })
  })

  return posted
}

export const stubGetConfig = (page: Page, id: string) =>
  page.route(`${SHARE_API}/configs/${id}`, (route) =>
    route.fulfill({ status: 200, json: STORED_PAYLOAD })
  )

export const stubGetConfigMissing = (page: Page, id: string) =>
  page.route(`${SHARE_API}/configs/${id}`, (route) =>
    route.fulfill({ status: 404, body: "No config under this id" })
  )
