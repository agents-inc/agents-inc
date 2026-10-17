import { expect, test } from "../fixtures"
import {
  OUT_OF_SCOPE_PAYLOAD,
  STORED_ID,
  STORED_PAYLOAD,
  captureCreateConfig,
  postToConfigStore,
} from "../support/sharing"

// Written out, not imported: an expected value from the module under test could
// never disagree.
const MINTED = 201
const REFUSED = 400

const REACT_ID = "web-framework-react"

// `seedSkillSchema` strips these keys silently, which tells a recording double
// from a parsing one.
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

// `captureCreateConfig` stands in front of every captured POST, so it must
// refuse what the route refuses.
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

  // The control: a refusal alone cannot tell a scoped gate from one that
  // swallowed the route.
  test("mints for a configuration it can take", async ({ page }) => {
    captureCreateConfig(page)

    const answer = await postToConfigStore(page, STORED_PAYLOAD)

    expect(answer.status).toBe(MINTED)
    expect(answer.body).toStrictEqual({ id: STORED_ID })
  })

  // What was sent, not what was accepted: `scope-reach.spec.ts` reads an empty
  // log as "posted nothing".
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
