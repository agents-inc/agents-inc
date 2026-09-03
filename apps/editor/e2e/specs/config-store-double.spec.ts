import { expect, test } from "../fixtures"
import {
  OUT_OF_SCOPE_PAYLOAD,
  STORED_ID,
  STORED_PAYLOAD,
  captureCreateConfig,
  postToConfigStore,
} from "../support/sharing"

// The two statuses `POST /configs` answers with, WRITTEN OUT rather than
// imported. `@workspace/api-mocks` keeps both of them private, and importing
// them if it did not would be worse than restating them: a spec that takes its
// expected value from the module it is checking moves whenever that module
// moves, so it could never disagree with it. This is the same reason
// `packages/cli`'s `e2e/pages/constants.ts` mirrors the product's strings
// instead of importing them.
const MINTED = 201
const REFUSED = 400

const REACT_ID = "web-framework-react"

// A body carrying the two keys a skill no longer has — `model` and `effort`
// belong to the sub-agent now. `seedSkillSchema` is a plain object schema, so a
// parse STRIPS them silently rather than refusing, which is what makes this the
// body that tells the two possible doubles apart: one that records what it was
// handed, and one that records what it parsed. `sharing.spec.ts`'s "posts the
// v2 shape" asserts a skill carries neither key, and that assertion goes
// vacuous — passing for free, whatever the app sent — the moment the second one
// is installed.
//
// Installable otherwise, so the answer under test is the mint rather than a
// refusal for some second reason: `STORED_PAYLOAD` pins `web-developer` into
// the project, which is where a project-scoped skill can reach it.
const SEED_CARRYING_STRIPPABLE_KEYS = {
  ...STORED_PAYLOAD,
  skills: {
    [REACT_ID]: {
      install: "plugin",
      scope: "project",
      assignments: { "web-developer": "preloaded" },
      model: "haiku",
      effort: "max",
    },
  },
}

// CLI-861. `captureCreateConfig` is the resting answer every spec that captures
// a POST stands in front of (`grep -rn captureCreateConfig e2e/specs`), and it
// used to answer `mintedConfig()` for any body at all — installed AHEAD of the
// validating handlers it re-passes, so its permissiveness was the one that
// counted. A double more permissive than the route it stands in for cannot
// fail, and one that cannot fail is not a test of whatever posts to it: the
// editor's own pre-POST guard (CLI-851) could regress in full while every spec
// built on this stub stayed green.
//
// These drive the stub rather than the app on purpose. The app can no longer
// produce a body the write contract refuses, which is exactly why the stub's
// refusal needs a spec of its own — the guard that makes it unreachable is the
// thing this stub exists to catch the loss of.
test.describe("the config store double", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("refuses a configuration the write contract rejects", async ({
    page,
  }) => {
    captureCreateConfig(page)

    // A project-scoped skill on a sub-agent with no `agents` entry, so that
    // sub-agent rests at global and the pair has nowhere to be written.
    const answer = await postToConfigStore(page, OUT_OF_SCOPE_PAYLOAD)

    expect(answer.status).toBe(REFUSED)
    expect(answer.body).toMatchObject({ success: false })
  })

  // The control the refusal above means nothing without: a refusal on its own
  // cannot tell a correctly-scoped gate from one that has swallowed the route,
  // and both read the same from a spec that only ever posts a bad body.
  test("mints for a configuration it can take", async ({ page }) => {
    captureCreateConfig(page)

    const answer = await postToConfigStore(page, STORED_PAYLOAD)

    expect(answer.status).toBe(MINTED)
    expect(answer.body).toStrictEqual({ id: STORED_ID })
  })

  // What was SENT, not what was accepted. `scope-reach.spec.ts` reads an empty
  // request log as "the app posted nothing", and that reading is only true
  // while a refused body still lands in it — a stub that recorded successes
  // alone would let the same assertion be satisfied by an app posting the very
  // payload the guard exists to stop.
  test("records a body it refused", async ({ page }) => {
    const posted = captureCreateConfig(page)

    await postToConfigStore(page, OUT_OF_SCOPE_PAYLOAD)

    expect(posted).toStrictEqual([OUT_OF_SCOPE_PAYLOAD])
  })

  test("keeps the body byte for byte, including keys a parse would strip", async ({
    page,
  }) => {
    const posted = captureCreateConfig(page)

    const answer = await postToConfigStore(page, SEED_CARRYING_STRIPPABLE_KEYS)

    expect(answer.status).toBe(MINTED)
    expect(posted).toStrictEqual([SEED_CARRYING_STRIPPABLE_KEYS])
  })
})
