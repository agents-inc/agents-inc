import { COMPOSE_URL } from "@workspace/api-mocks"
import { MATRIX } from "@workspace/matrix"

import { expect, test } from "../fixtures"

import type { Composer } from "../pages/composer"
import {
  CLOSE_QUOTE,
  COMPOSER_HINT,
  COMPOSER_PLACEHOLDER,
  COMPOSER_SEND_LABEL,
  OPEN_QUOTE,
  PROPOSAL_NO_CHANGES,
  PROPOSAL_NO_MODEL_REASON,
  SEND_KEY_SHORTCUTS,
} from "../pages/composer"
import { ConfigurePage } from "../pages/configure-page"
import {
  holdCompose,
  stubCompose,
  stubComposeRefusal,
  stubComposeTooLong,
  stubComposeUnreachable,
  stubSignedIn,
} from "../support/auth"
import { DOMAINS, EXCLUSIVE_CATEGORY, MULTI_CATEGORY } from "../support/catalog"

import type { SkillCell } from "../pages/skill-cell"
import type { Page } from "@playwright/test"

// A sentence in, a proposal out that changes nothing until applied. No modes
// and no starter chips: the absence assertions below defend that.

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY
const { name: OTHER_CATEGORY, first: OTHER_SKILL } = MULTI_CATEGORY

const SENTENCE = "A Next.js app with tRPC and Postgres."

const DEAD_MODE_LABEL = /^(build|adjust|ask)$/i

// Copy is mirrored, never imported.
const THINKING_REASON = "Choosing skills…"

// `PROPOSAL_NO_MODEL_REASON` is not here: a signed-out submit never reaches the
// worker.
const REFUSAL_TOO_MANY = "Too many requests in a minute. Try again shortly."
const REFUSAL_REFUSED = "The model did not answer. Nothing changed."
const REFUSAL_UNREACHABLE = "Could not reach the composer. Nothing changed."
const REFUSAL_TOO_LONG = "That is too long to send. Shorten it and try again."
const REFUSAL_SESSION_ENDED =
  "Your session ended. Sign in again — nothing changed."

const ONE_CHANGE = "1 change"
const TWO_CHANGES = "2 changes"

// Anchored at the end, as `1 change` is a prefix of `1 changes`; the
// lookbehind keeps `11 change` from passing for `1 change`.
const endsWithCount = (label: string) => new RegExp(`(?<!\\d)${label}$`)

/**
 * Its own `ConfigurePage`: the fixture navigates before a test's stubs are
 * installed.
 */
const arriveSignedIn = async (page: Page) => {
  stubSignedIn(page)
  const configure = new ConfigurePage(page)
  await configure.goto()
  return configure
}

// Playwright reports the request either way, so a spec can assert none was
// sent.
const composeRequests = (page: Page) => {
  const sent: string[] = []

  page.on("request", (request) => {
    if (request.method() === "POST" && request.url() === COMPOSE_URL)
      sent.push((request.postDataJSON() as { sentence: string }).sentence)
  })

  return sent
}

// Well past the cap, not cap + 1: the exact threshold is the worker's to move.
const PAST_THE_CAP = "x".repeat(900)

// The visitor can switch marketplace before the answer lands.
const UNKNOWN_SKILL_ID = "web-framework-not-in-this-catalogue"

// The pending frame draws `Choosing skills…` first.
const settled = async (composer: Composer) => {
  await expect(composer.proposal).toBeVisible()
  await expect(composer.proposal).not.toContainText(THINKING_REASON)
}

const selectedSkillIds = async (configure: ConfigurePage) => {
  const raw = await configure.storedConfig()
  if (raw === "") return []

  const { state } = JSON.parse(raw) as {
    state: { skills: Record<string, unknown> }
  }

  return Object.keys(state.skills)
}

/** Read from the running app: an id copied here goes stale in silence. */
const skillIdOf = async (configure: ConfigurePage, cell: SkillCell) => {
  await cell.toggle()
  await expect.poll(() => selectedSkillIds(configure)).toHaveLength(1)
  const [id] = await selectedSkillIds(configure)

  await cell.toggle()
  await expect.poll(() => selectedSkillIds(configure)).toHaveLength(0)

  return id!
}

// Wide enough that the page grid centres, moving columns but not
// viewport-pinned controls.
const CENTRED_VIEWPORT = { width: 2560, height: 1000 }

const CONFIG_KEY = "agents-inc:config:v1"

// Control half of the console assertion: the listener must be shown to hear
// something.
const STALE_VERSION_BLOB = JSON.stringify({
  state: { stackId: null, skills: {}, remembered: {}, agents: {} },
  version: 1,
})

// Negative is the overlap in pixels, so a failure prints something actionable.
const dockGap = async (configure: ConfigurePage) => {
  const dock = await configure.composer.dock.boundingBox()
  const button = await configure.marketplaceButton.boundingBox()
  if (!dock || !button) throw new Error("the dock and the button must be drawn")

  return dock.y - (button.y + button.height)
}

const proposalToBandGap = async (configure: ConfigurePage) => {
  const proposal = await configure.composer.proposal.boundingBox()
  const band = await configure.composer.band.boundingBox()
  if (!proposal || !band)
    throw new Error("the proposal and the band must be drawn")

  return band.y - (proposal.y + proposal.height)
}

const TAB_STOPS = 60

const stopsUnderTheDock = (configure: ConfigurePage) =>
  configure.stopsCoveredBy(configure.composer.dock, "Tab", TAB_STOPS)

test.describe("the docked composer", () => {
  test("is docked at the foot of the main column before any scroll", async ({
    configure,
  }) => {
    expect(await configure.scrollY()).toBe(0)

    await expect(configure.composer.band).toBeVisible()
  })

  test("carries one placeholder and one send label", async ({ configure }) => {
    const { composer } = configure

    await expect(composer.field).toHaveAttribute(
      "placeholder",
      COMPOSER_PLACEHOLDER
    )
    await expect(composer.sendButton).toHaveAccessibleName(COMPOSER_SEND_LABEL)
  })

  test("keeps its one claim out of the drawing and in the description", async ({
    configure,
  }) => {
    const { composer } = configure

    // Measured: a screen-reader-only element is clipped, not removed, so it is
    // always `visible`.
    const box = await composer.hint.boundingBox()
    if (!box) throw new Error("the hint must be in the accessibility tree")
    expect(box.width).toBeLessThanOrEqual(1)
    expect(box.height).toBeLessThanOrEqual(1)

    await expect(composer.field).toHaveAccessibleDescription(COMPOSER_HINT)
    await expect(composer.sendButton).toHaveAccessibleDescription(COMPOSER_HINT)
  })

  test("publishes both submit chords on the send button", async ({
    configure,
  }) => {
    await expect(configure.composer.sendButton).toHaveAttribute(
      "aria-keyshortcuts",
      SEND_KEY_SHORTCUTS
    )
  })

  // An absence assertion passes on a composer that renders nothing, so the
  // channel is shown first.
  test("has no mode control of any kind", async ({ configure, page }) => {
    const { composer } = configure

    await configure.skillIn(web, CATEGORY, SKILL).toggle()
    await configure.skillIn(web, CATEGORY, SKILL).openOptions()
    await expect(page.getByRole("radiogroup").first()).toBeVisible()
    await expect(composer.sendButton).toBeVisible()

    await expect(composer.dock.getByRole("radiogroup")).toHaveCount(0)
    await expect(composer.dock.getByRole("radio")).toHaveCount(0)
    await expect(
      composer.dock.getByRole("button", { name: DEAD_MODE_LABEL })
    ).toHaveCount(0)
  })

  test("offers nothing but Send with the field empty", async ({
    configure,
  }) => {
    const { composer } = configure

    expect(await composer.draft()).toBe("")
    await expect(composer.dock.getByRole("button")).toHaveCount(1)
    await expect(composer.dock.getByRole("button")).toHaveAccessibleName(
      COMPOSER_SEND_LABEL
    )
  })
})

// `trim` tells a whitespace-only draft from a written one.
test.describe("an empty draft", () => {
  test("treats a whitespace-only draft as empty", async ({ configure }) => {
    const { composer } = configure

    await composer.type("   ")

    await expect(composer.sendButton).toBeDisabled()
  })
})

/**
 * The length rule is the worker's: a `maxLength` truncates a paste silently,
 * and a disabled Send past the cap is a dead end. The worker refuses and the
 * reason line says so.
 */
test.describe("a draft past the worker's cap", () => {
  test("keeps every character the visitor wrote", async ({ configure }) => {
    const { composer } = configure

    await composer.type(PAST_THE_CAP)

    expect(await composer.draft()).toBe(PAST_THE_CAP)
  })

  test("leaves Send reachable rather than refusing where it cannot explain", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(PAST_THE_CAP)

    await expect(composer.sendButton).toBeEnabled()
  })
})

test.describe("submitting", () => {
  test("keeps the send button disabled until the draft holds something", async ({
    configure,
  }) => {
    const { composer } = configure

    await expect(composer.sendButton).toBeDisabled()

    await composer.type(SENTENCE)

    await expect(composer.sendButton).toBeEnabled()
  })

  test("answers with a proposal that echoes the sentence and reports no changes", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()

    await expect(composer.proposalHeader).toContainText(
      `${OPEN_QUOTE}${SENTENCE}${CLOSE_QUOTE}`
    )
    await expect(composer.proposalHeader).toContainText(PROPOSAL_NO_CHANGES)
    await expect(composer.proposal.getByRole("group")).toHaveCount(0)
  })

  // Outside the live region: live regions should be terse.
  test("explains itself in a reason line that is not part of the announcement", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()

    await expect(composer.proposalReason).toHaveText(PROPOSAL_NO_MODEL_REASON)
    await expect(composer.proposalHeader).not.toContainText(
      PROPOSAL_NO_MODEL_REASON
    )
  })

  test("sends nothing to the worker while signed out", async ({
    configure,
    page,
  }) => {
    const { composer } = configure
    const sent = composeRequests(page)

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposalReason).toHaveText(PROPOSAL_NO_MODEL_REASON)

    expect(sent).toStrictEqual([])

    const signedIn = await arriveSignedIn(page)
    await signedIn.composer.type(SENTENCE)
    await signedIn.composer.send()
    await settled(signedIn.composer)

    expect(sent).toStrictEqual([SENTENCE])
  })

  test("offers an enabled Discard and a disabled Apply", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()

    await expect(composer.discardButton).toBeEnabled()
    await expect(composer.applyButton).toBeDisabled()
  })

  test("submits on Control+Enter", async ({ configure }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.submitWithKeys("Control+Enter")

    await expect(composer.proposal).toBeVisible()
  })

  test("submits on Meta+Enter too, on the same platform", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.submitWithKeys("Meta+Enter")

    await expect(composer.proposal).toBeVisible()
  })

  // The chord is pressed afterwards, so the channel is shown to carry a value.
  test("inserts a newline on a plain Enter rather than submitting", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.field.press("Enter")

    expect(await composer.draft()).toBe(`${SENTENCE}\n`)
    await expect(composer.proposal).toHaveCount(0)

    await composer.submitWithKeys("Control+Enter")
    await expect(composer.proposal).toBeVisible()
  })

  test("leaves the draft alone", async ({ configure }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    expect(await composer.draft()).toBe(SENTENCE)
  })

  test("drops the proposal as soon as the draft is edited", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    await composer.field.pressSequentially("!")

    await expect(composer.proposal).toHaveCount(0)
  })

  // Read from the slot, which is made to carry a value first.
  test("changes no saved configuration, through the submit or the discard", async ({
    configure,
  }) => {
    const { composer } = configure

    await configure.skillIn(web, CATEGORY, SKILL).toggle()
    await expect.poll(() => configure.storedConfig()).not.toBe("")
    const before = await configure.storedConfig()

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    expect(await configure.storedConfig()).toBe(before)

    await composer.discardButton.click()
    await expect(composer.proposal).toHaveCount(0)

    expect(await configure.storedConfig()).toBe(before)
  })

  // The second half is the channel: the listener must be shown to hear
  // something.
  test("reports nothing through the app's issue seam", async ({
    configure,
    page,
  }) => {
    const { composer } = configure
    const issues: string[] = []
    page.on("console", (message) => {
      if (message.text().startsWith("[issue]")) issues.push(message.text())
    })

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    expect(issues).toStrictEqual([])

    await page.evaluate(
      ([key, blob]) => localStorage.setItem(key!, blob!),
      [CONFIG_KEY, STALE_VERSION_BLOB]
    )
    await page.reload()
    await configure.stacks.waitFor()

    expect(issues).toHaveLength(1)
  })
})

// Signed in wherever the worker must answer: signed out, nothing is sent.
test.describe("a submit in flight", () => {
  test("holds the send button disabled until the answer lands", async ({
    page,
  }) => {
    const { composer } = await arriveSignedIn(page)
    const compose = holdCompose(page)

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toContainText(THINKING_REASON)

    await expect(composer.sendButton).toBeDisabled()

    compose.release()
    await settled(composer)
    await expect(composer.sendButton).toBeEnabled()
  })

  // A disabled control cannot hold focus, so the caret must be handed
  // somewhere.
  test("hands the caret to the field when Send takes itself out of reach", async ({
    page,
  }) => {
    const { composer } = await arriveSignedIn(page)
    const compose = holdCompose(page)

    await composer.type(SENTENCE)
    await composer.send()

    await expect(composer.sendButton).toBeDisabled()
    await expect(composer.field).toBeFocused()

    compose.release()
    await settled(composer)
  })

  // Counted at the worker: a swallowed press and an unaccepted one look the
  // same.
  test("sends one sentence however often the chord is pressed", async ({
    page,
  }) => {
    const { composer } = await arriveSignedIn(page)
    const compose = holdCompose(page)

    await composer.type(SENTENCE)
    await composer.submitWithKeys("Control+Enter")
    await expect(composer.proposal).toContainText(THINKING_REASON)

    await composer.submitWithKeys("Control+Enter")
    await composer.submitWithKeys("Meta+Enter")

    compose.release()
    await settled(composer)

    expect(compose.asked).toStrictEqual([SENTENCE])
  })

  /**
   * The edited sentence's own echo separates a second submit from a late first
   * answer.
   */
  test("stops waiting on an answer the moment the draft changes", async ({
    page,
  }) => {
    const { composer } = await arriveSignedIn(page)
    const compose = holdCompose(page)
    const edited = `${SENTENCE}!`

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.sendButton).toBeDisabled()

    await composer.field.pressSequentially("!")

    await expect(composer.proposal).toHaveCount(0)
    await expect(composer.sendButton).toBeEnabled()

    compose.release()
    await composer.send()
    await settled(composer)

    await expect(composer.proposalHeader).toContainText(
      `${OPEN_QUOTE}${edited}${CLOSE_QUOTE}`
    )
  })
})

test.describe("a refusal", () => {
  const REFUSALS = [
    {
      what: "a session that ended while the tab was open",
      stub: (page: Page) => stubComposeRefusal(page, 401),
      copy: REFUSAL_SESSION_ENDED,
    },
    {
      what: "a rate limit",
      stub: (page: Page) => stubComposeRefusal(page, 429),
      copy: REFUSAL_TOO_MANY,
    },
    {
      what: "an answer the worker would not give",
      stub: (page: Page) => stubComposeRefusal(page, 500),
      copy: REFUSAL_REFUSED,
    },
    {
      what: "a composer it cannot reach",
      stub: stubComposeUnreachable,
      copy: REFUSAL_UNREACHABLE,
    },
    {
      what: "a sentence past the worker's cap",
      stub: stubComposeTooLong,
      copy: REFUSAL_TOO_LONG,
    },
  ] as const

  for (const { what, stub, copy } of REFUSALS) {
    test(`says so after ${what}, and offers nothing to apply`, async ({
      page,
    }) => {
      const { composer } = await arriveSignedIn(page)
      stub(page)

      await composer.type(SENTENCE)
      await composer.send()

      await expect(composer.proposalReason).toHaveText(copy)
      await expect(composer.proposalHeader).toContainText(PROPOSAL_NO_CHANGES)
      await expect(composer.applyButton).toBeDisabled()
    })
  }
})

test.describe("applying a proposal", () => {
  /** Apply adds what the proposal drew: one derivation, not two. */
  test("selects exactly the skills its rows named", async ({ page }) => {
    const configure = await arriveSignedIn(page)
    const { composer } = configure
    const cell = configure.skillIn(web, CATEGORY, SKILL)
    const skillId = await skillIdOf(configure, cell)
    stubCompose(page, [skillId, UNKNOWN_SKILL_ID])

    await composer.type(SENTENCE)
    await composer.send()
    await settled(composer)

    // One row and one change, because the other id names nothing on screen.
    await expect(composer.proposal.getByRole("group")).toHaveCount(1)

    await composer.applyButton.click()

    expect(await cell.isSelected()).toBe(true)
    expect(await selectedSkillIds(configure)).toStrictEqual([skillId])
  })

  test("heads the list with what it adds, and draws a row for each", async ({
    page,
  }) => {
    const configure = await arriveSignedIn(page)
    const { composer } = configure
    const skillId = await skillIdOf(
      configure,
      configure.skillIn(web, CATEGORY, SKILL)
    )
    stubCompose(page, [skillId])

    await composer.type(SENTENCE)
    await composer.send()
    await settled(composer)

    await expect(composer.proposal.getByRole("group")).toHaveAccessibleName(
      "Skills · 1 added"
    )
    await expect(composer.proposalRows).toHaveCount(1)
    await expect(composer.proposalRows).toContainText(SKILL)
  })

  test("clears the proposal", async ({ page }) => {
    const configure = await arriveSignedIn(page)
    const { composer } = configure
    const skillId = await skillIdOf(
      configure,
      configure.skillIn(web, CATEGORY, SKILL)
    )
    stubCompose(page, [skillId])

    await composer.type(SENTENCE)
    await composer.send()
    await settled(composer)

    await composer.applyButton.click()

    await expect(composer.proposal).toHaveCount(0)
  })
})

// The count sits in the header's live region, so these read what is announced.
test.describe("counting what a proposal changes", () => {
  test("counts a single added skill as one change, in the singular", async ({
    page,
  }) => {
    const configure = await arriveSignedIn(page)
    const { composer } = configure
    const skillId = await skillIdOf(
      configure,
      configure.skillIn(web, CATEGORY, SKILL)
    )
    stubCompose(page, [skillId])

    await composer.type(SENTENCE)
    await composer.send()
    await settled(composer)

    await expect(composer.proposalRows).toHaveCount(1)
    await expect(composer.proposalHeader).toHaveText(endsWithCount(ONE_CHANGE))
  })

  test("counts two added skills as two changes, in the plural", async ({
    page,
  }) => {
    const configure = await arriveSignedIn(page)
    const { composer } = configure
    const skillId = await skillIdOf(
      configure,
      configure.skillIn(web, CATEGORY, SKILL)
    )
    const otherSkillId = await skillIdOf(
      configure,
      configure.skillIn(web, OTHER_CATEGORY, OTHER_SKILL)
    )
    stubCompose(page, [skillId, otherSkillId])

    await composer.type(SENTENCE)
    await composer.send()
    await settled(composer)

    await expect(composer.proposalRows).toHaveCount(2)
    await expect(composer.proposalHeader).toHaveText(endsWithCount(TWO_CHANGES))
  })

  // Two ids, one row: the count is of what the reader can see.
  test("counts the rows it draws, not every id the model named", async ({
    page,
  }) => {
    const configure = await arriveSignedIn(page)
    const { composer } = configure
    const skillId = await skillIdOf(
      configure,
      configure.skillIn(web, CATEGORY, SKILL)
    )
    stubCompose(page, [skillId, UNKNOWN_SKILL_ID])

    await composer.type(SENTENCE)
    await composer.send()
    await settled(composer)

    await expect(composer.proposalRows).toHaveCount(1)
    await expect(composer.proposalHeader).toHaveText(endsWithCount(ONE_CHANGE))
  })
})

test.describe("discarding a proposal", () => {
  // The block just left the DOM, so focus must not fall to `body`.
  test("clears the proposal, keeps the draft and returns focus to the field", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    await composer.discardButton.click()

    await expect(composer.proposal).toHaveCount(0)
    expect(await composer.draft()).toBe(SENTENCE)
    await expect(composer.field).toBeFocused()
  })
})

// Signed in, one skill proposed by the chord, the caret still in the field.
const proposeOneSkill = async (page: Page) => {
  const configure = await arriveSignedIn(page)
  const { composer } = configure
  const cell = configure.skillIn(web, CATEGORY, SKILL)
  stubCompose(page, [await skillIdOf(configure, cell)])

  await composer.type(SENTENCE)
  await composer.submitWithKeys("Control+Enter")
  await settled(composer)
  await expect(composer.applyButton).toBeEnabled()

  return { configure, cell }
}

// Apply takes the block, and itself, off the page: the keyboard goes where
// Discard sends it rather than to `body`.
test.describe("where the keyboard goes when a proposal leaves", () => {
  test("goes to the field when Apply is clicked", async ({ page }) => {
    const { configure, cell } = await proposeOneSkill(page)
    const { composer } = configure

    await composer.applyButton.click()

    await expect(composer.proposal).toHaveCount(0)
    await expect(cell.root).toHaveAttribute("aria-pressed", "true")
    await expect(composer.field).toBeFocused()
  })

  for (const key of ["Enter", "Space"] as const) {
    test(`goes to the field when ${key} on Apply applies it`, async ({
      page,
    }) => {
      const { configure, cell } = await proposeOneSkill(page)
      const { composer } = configure

      await page.keyboard.press("Shift+Tab")
      await expect(composer.applyButton).toBeFocused()
      await page.keyboard.press(key)

      await expect(composer.proposal).toHaveCount(0)
      await expect(cell.root).toHaveAttribute("aria-pressed", "true")
      await expect(composer.field).toBeFocused()
    })
  }

  // The Enter that applies must not also reach the field it hands the caret to.
  test("keeps the draft as it was when Enter on Apply applies it", async ({
    page,
  }) => {
    const { configure } = await proposeOneSkill(page)
    const { composer } = configure

    await page.keyboard.press("Shift+Tab")
    await expect(composer.applyButton).toBeFocused()
    await page.keyboard.press("Enter")

    await expect(composer.proposal).toHaveCount(0)
    expect(await composer.draft()).toBe(SENTENCE)
  })

  test("goes to the field when Enter on Discard discards it", async ({
    page,
  }) => {
    const { configure } = await proposeOneSkill(page)
    const { composer } = configure

    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Shift+Tab")
    await expect(composer.discardButton).toBeFocused()
    await page.keyboard.press("Enter")

    await expect(composer.proposal).toHaveCount(0)
    await expect(composer.field).toBeFocused()
  })
})

/**
 * The block is capped and its list scrolls, and the rows hold nothing to focus,
 * so a keyboard user scrolls the list itself: a named tab stop before Discard.
 * Every skill in the catalogue is proposed, so the list outgrows the cap. Only
 * "moved" is asserted: scroll anchoring makes exact offsets unreliable.
 * Chromium already makes such a scroller a tab stop on its own, so the order
 * and the scrolling hold before the app marks it; the name, and axe in
 * a11y.spec.ts, do not.
 */
test.describe("a proposal longer than its block", () => {
  test.beforeEach(async ({ page }) => {
    const { composer } = await arriveSignedIn(page)
    stubCompose(page, Object.keys(MATRIX.skills))

    await composer.type(SENTENCE)
    await composer.send()
    await settled(composer)

    // Subject guard: a list that fits has nothing to scroll.
    await expect
      .poll(async () => (await composer.proposalBodyScroll()).room)
      .toBeGreaterThan(0)
  })

  test("Shift+Tab from Discard lands on the list", async ({ page }) => {
    const { composer } = new ConfigurePage(page)
    await composer.discardButton.focus()

    await page.keyboard.press("Shift+Tab")

    await expect(composer.proposalBody).toBeFocused()
  })

  test("the list has a name of its own", async ({ page }) => {
    const { composer } = new ConfigurePage(page)

    await expect(composer.proposalBody).toHaveAccessibleName(/\S/)
  })

  test("the arrow keys and End scroll it once Shift+Tab has reached it", async ({
    page,
  }) => {
    const { composer } = new ConfigurePage(page)
    await composer.discardButton.focus()
    await page.keyboard.press("Shift+Tab")

    await page.keyboard.press("ArrowDown")
    await expect
      .poll(async () => (await composer.proposalBodyScroll()).top)
      .toBeGreaterThan(0)
    const stepped = (await composer.proposalBodyScroll()).top

    await page.keyboard.press("End")
    await expect
      .poll(async () => (await composer.proposalBodyScroll()).top)
      .toBeGreaterThan(stepped)
  })

  // A control: what the list already does, which reaching it must not change.
  test("the wheel still scrolls it", async ({ page }) => {
    const { composer } = new ConfigurePage(page)
    await composer.proposalBody.hover()

    await page.mouse.wheel(0, 200)

    await expect
      .poll(async () => (await composer.proposalBodyScroll()).top)
      .toBeGreaterThan(0)
  })
})

// Floating controls: every assertion is a relationship between two live boxes.
test.describe("the composer's geometry", () => {
  test("leaves the marketplace button clear at its shortest", async ({
    configure,
  }) => {
    await configure.composer.type(SENTENCE)

    expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  test("leaves the marketplace button clear with an empty field", async ({
    configure,
  }) => {
    expect(await configure.composer.draft()).toBe("")

    expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  test("leaves the marketplace button clear with a proposal open", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  test("leaves the marketplace button clear where the page grid centres", async ({
    configure,
    page,
  }) => {
    await page.setViewportSize(CENTRED_VIEWPORT)

    expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  // At maximum scroll the sticky wrapper rests in flow.
  test("leaves the marketplace button clear at maximum scroll", async ({
    configure,
  }) => {
    await configure.scrollToBottom()

    expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  // Below the band, a strip of column colour would read as a second band.
  test("draws the proposal above the band, not below it", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    expect(await proposalToBandGap(configure)).toBeGreaterThanOrEqual(0)
  })

  test("bleeds as far as the band it answers into", async ({ configure }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    const proposal = await composer.proposal.boundingBox()
    const band = await composer.band.boundingBox()
    if (!proposal || !band)
      throw new Error("the proposal and the band must be drawn")

    expect({ x: proposal.x, width: proposal.width }).toStrictEqual({
      x: band.x,
      width: band.width,
    })
  })

  test("draws the band full-bleed across the main column", async ({
    configure,
    page,
  }) => {
    const band = await configure.composer.band.boundingBox()
    const main = await page.locator("main").boundingBox()
    if (!band || !main) throw new Error("the band and the column must be drawn")

    expect(band.width).toBeCloseTo(main.width, 0)
  })

  // Against the filter bar, not a gutter figure: nothing here may know the
  // gutter's value.
  test("bleeds exactly as far as the filter bar does", async ({
    configure,
  }) => {
    const band = await configure.composer.band.boundingBox()
    const bar = await configure.filterBar.boundingBox()
    if (!band || !bar) throw new Error("the band and the bar must be drawn")

    expect({ x: band.x, width: band.width }).toStrictEqual({
      x: bar.x,
      width: bar.width,
    })
  })

  // Against a domain section's box, which is the content edge.
  test("insets its content to the edge the skill grid sits on", async ({
    configure,
  }) => {
    const { composer } = configure
    const section = await configure.domain(web).boundingBox()
    const field = await composer.field.boundingBox()
    const inset = await composer.field.evaluate((node) =>
      parseFloat(getComputedStyle(node).paddingLeft)
    )
    const send = await composer.sendButton.boundingBox()
    if (!section || !field || !send)
      throw new Error("the section, the field and the button must be drawn")

    expect(field.x + inset).toBeCloseTo(section.x, 0)
    expect(send.x + send.width).toBeCloseTo(section.x + section.width, 0)
  })

  test("keeps the control row inside the band", async ({ configure }) => {
    const { scroll, client } = await configure.composer.bandOverflow()

    expect(scroll).toBeLessThanOrEqual(client)
  })

  test("does not permanently cover the end of the grid", async ({
    configure,
  }) => {
    await configure.scrollToBottom()

    const cell = await configure.skillCells.last().boundingBox()
    const band = await configure.composer.band.boundingBox()
    if (!cell || !band)
      throw new Error("the last cell and the band must be drawn")

    expect(band.y - (cell.y + cell.height)).toBeGreaterThanOrEqual(0)
  })

  // The scroll shows the walk left the first screen.
  test("never covers the control the keyboard is on", async ({ configure }) => {
    expect(await stopsUnderTheDock(configure)).toStrictEqual([])
    expect(await configure.scrollY()).toBeGreaterThan(0)
  })

  // With the dock at its tallest, so the clearance must grow with it.
  test("never covers the control the keyboard is on with a proposal open", async ({
    configure,
  }) => {
    await configure.composer.type(SENTENCE)
    await configure.composer.send()
    await settled(configure.composer)
    // Without a reload, which would drop the proposal.
    await configure.editorLink.focus()
    await configure.scrollTo(0)

    expect(await stopsUnderTheDock(configure)).toStrictEqual([])
    expect(await configure.scrollY()).toBeGreaterThan(0)
  })

  // Measured: a declared class is no evidence it is in effect.
  test("grows with the draft and then stops, scrolling instead", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type("one")
    const short = await composer.fieldBox()

    await composer.type("one\ntwo\nthree")
    const grown = await composer.fieldBox()

    await composer.type("line\n".repeat(30))
    const capped = await composer.fieldBox()

    await composer.type("line\n".repeat(60))
    const stillCapped = await composer.fieldBox()

    expect(grown.client).toBeGreaterThan(short.client)
    expect(stillCapped.client).toBe(capped.client)
    expect(capped.scroll).toBeGreaterThan(capped.client)
  })
})
