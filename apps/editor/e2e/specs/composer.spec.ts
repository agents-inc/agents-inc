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
import {
  holdCompose,
  stubCompose,
  stubComposeRefusal,
  stubComposeUnreachable,
} from "../support/auth"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

import type { ConfigurePage } from "../pages/configure-page"
import type { SkillCell } from "../pages/skill-cell"
import type { Page } from "@playwright/test"

// A field docked to the foot of the main column takes a sentence, and pressing
// send answers with a PROPOSAL — a reviewable block that changes nothing until
// it is applied.
//
// THE COMPOSER HAS NO MODES AND NO STARTER CHIPS, and that is the claim this
// file exists to defend. The design source drew three modes on a segmented
// track, with a screenshot and a complete copy table; they were cut, replaced
// for one revision by two starter chips, and those were cut in turn — "the
// placeholder does that work". Both absences are asserted directly, and so is
// the thing either would come back as: a control in the dock that remembers it
// was clicked.

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY

// One sentence, used wherever a submit needs a subject. Its content is
// irrelevant to every assertion except the echo, which is the point: nothing in
// this phase reads what was written.
const SENTENCE = "A Next.js app with tRPC and Postgres."

// The three dead mode verbs. A button named any of them inside the composer is
// the segmented track restored, whatever it is drawn as.
const DEAD_MODE_LABEL = /^(build|adjust|ask)$/i

// The composer's own copy, MIRRORED rather than imported, exactly as
// `pages/composer.ts` mirrors the strings it carries: an assertion that reads
// the very constant the product renders cannot fail when that constant is
// reworded, because both halves move together.
//
// The reason line a submit draws while the request is in flight. It is also the
// one hook a spec has on "still waiting" — nothing else on screen distinguishes
// a round trip from a finished one.
const THINKING_REASON = "Choosing skills…"

// The other three members of the composer's refusal table. `PROPOSAL_NO_MODEL_REASON`
// is the fourth — `signed-out`, which the suite's default stub produces — and it
// lives in the page object because the specs written before EDITOR-54 already
// asserted on it.
const REFUSAL_TOO_MANY = "Too many requests in a minute. Try again shortly."
const REFUSAL_REFUSED = "The model did not answer. Nothing changed."
const REFUSAL_UNREACHABLE = "Could not reach the composer. Nothing changed."

// An id no seated catalogue carries. A model answering with one is not a
// hypothetical: the ids it is given come from whichever marketplace was seated
// when the prompt was built, and the visitor can switch away from that
// marketplace before the answer lands.
const UNKNOWN_SKILL_ID = "web-framework-not-in-this-catalogue"

// The proposal after its round trip has finished, whatever it finished as.
// Submitting is a request, so the block draws `Choosing skills…` before it
// draws an answer — and an assertion made before the answer lands is an
// assertion about the pending frame.
const settled = async (composer: Composer) => {
  await expect(composer.proposal).toBeVisible()
  await expect(composer.proposal).not.toContainText(THINKING_REASON)
}

// Which skills the saved configuration holds, by id.
const selectedSkillIds = async (configure: ConfigurePage) => {
  const raw = await configure.storedConfig()
  if (raw === "") return []

  const { state } = JSON.parse(raw) as {
    state: { skills: Record<string, unknown> }
  }

  return Object.keys(state.skills)
}

/**
 * The id behind a display name, taken from the RUNNING APP rather than written
 * down here.
 *
 * The catalogue is regenerated from the CLI, so an id copied into a spec goes
 * stale in silence — and a stub naming a skill nothing carries draws no rows at
 * all, which is exactly the state the tests below assert against. Selecting the
 * cell and reading the slot is the one route to the id that cannot drift.
 */
const skillIdOf = async (configure: ConfigurePage, cell: SkillCell) => {
  await cell.toggle()
  await expect.poll(() => selectedSkillIds(configure)).toHaveLength(1)
  const [id] = await selectedSkillIds(configure)

  await cell.toggle()
  await expect.poll(() => selectedSkillIds(configure)).toHaveLength(0)

  return id!
}

// Wide enough that the page grid stops filling the window and starts being
// CENTRED in it — `mx-auto max-w-[105.25rem]` in `routes/route-components.tsx`
// — which slides every column right while anything pinned to the viewport stays
// where it is. That is the width at which a constant offset gets a floating
// control wrong, and it is why two floating controls stacked at one column's
// foot have to be measured here as well as at the suite's own 1600.
//
// The value is MIRRORED from `marketplace.spec.ts`, not imported: that file
// must stay unmodified — its passing untouched is the proof this phase did not
// break EDITOR-35 — and its own copy is a module-local const that is not
// exported.
const CENTRED_VIEWPORT = { width: 2560, height: 1000 }

const CONFIG_KEY = "agents-inc:config:v1"

// A readable configuration saved under a version the app has moved past, which
// is the cheapest thing that makes the app SAY something. Used only as the
// control half of the console assertion below — a listener that has never
// carried a message reports silence for the same reason an unplugged microphone
// does. Its shape is `persistence.spec.ts`'s, deliberately.
const STALE_VERSION_BLOB = JSON.stringify({
  state: { stackId: null, skills: {}, remembered: {}, agents: {} },
  version: 1,
})

// How much air there is between the marketplace button's bottom edge and the
// composer's top one. Negative is the overlap, in pixels, which is what a
// failure has to print: "expected true to be false" says nothing a reader can
// act on, and no visibility assertion can see an overlap at all — both elements
// are visible in every one of them, and Playwright clicks by dispatching at an
// element's box rather than by hit-testing what a person would press.
//
// Both boxes are read live, so there is not a single coordinate in here. What
// is asserted is a RELATIONSHIP between two elements on screen now — and it is
// taken against the DOCK rather than the band, because the dock grows a
// conditional child above the band (a proposal, after a submit) and the thing
// that has to be cleared is the taller one.
const dockGap = async (configure: ConfigurePage) => {
  const dock = await configure.composer.dock.boundingBox()
  const button = await configure.marketplaceButton.boundingBox()
  if (!dock || !button) throw new Error("the dock and the button must be drawn")

  return dock.y - (button.y + button.height)
}

// How much air there is between the proposal's bottom edge and the band's top
// one. The one geometric claim the "answer above the field" decision makes, and
// the only thing that catches it being built the other way round — below the
// band a full-bleed strip of column colour sits between the band's bottom
// hairline and the viewport edge, which reads as a second band and is a tenth
// rejected float treatment by accident.
const proposalToBandGap = async (configure: ConfigurePage) => {
  const proposal = await configure.composer.proposal.boundingBox()
  const band = await configure.composer.band.boundingBox()
  if (!proposal || !band)
    throw new Error("the proposal and the band must be drawn")

  return band.y - (proposal.y + proposal.height)
}

const scrollToBottom = (configure: ConfigurePage) =>
  configure.page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  )

test.describe("the docked composer", () => {
  test("is docked at the foot of the main column before any scroll", async ({
    configure,
  }) => {
    expect(await configure.scrollY()).toBe(0)

    await expect(configure.composer.band).toBeVisible()
  })

  // One placeholder and one send label, because there is one of each control.
  // The design's `DOCK` constant carried three of both.
  test("carries one placeholder and one send label", async ({ configure }) => {
    const { composer } = configure

    await expect(composer.field).toHaveAttribute(
      "placeholder",
      COMPOSER_PLACEHOLDER
    )
    await expect(composer.sendButton).toHaveAccessibleName(COMPOSER_SEND_LABEL)
  })

  // THE CONTROL ROW HOLDS THE SEND BUTTON AND NOTHING ELSE. The hint that used
  // to sit on its left edge is gone from the drawing, and the claim it carried
  // — that pressing send changes nothing — reaches assistive technology alone
  // now. A reason goes in the accessible DESCRIPTION, never in the name.
  test("keeps its one claim out of the drawing and in the description", async ({
    configure,
  }) => {
    const { composer } = configure

    // MEASURED rather than asserted as hidden. A screen-reader-only element is
    // clipped to a pixel rather than removed, so it is `visible` to every
    // visibility check there is — what the design settled is that it takes no
    // room in the control row, and only its box can say so.
    const box = await composer.hint.boundingBox()
    if (!box) throw new Error("the hint must be in the accessibility tree")
    expect(box.width).toBeLessThanOrEqual(1)
    expect(box.height).toBeLessThanOrEqual(1)

    await expect(composer.field).toHaveAccessibleDescription(COMPOSER_HINT)
    await expect(composer.sendButton).toHaveAccessibleDescription(COMPOSER_HINT)
  })

  // The glyph pair drawn on the button is `aria-hidden`, so without this
  // attribute the shortcut reaches nobody who cannot see it.
  test("publishes both submit chords on the send button", async ({
    configure,
  }) => {
    await expect(configure.composer.sendButton).toHaveAttribute(
      "aria-keyshortcuts",
      SEND_KEY_SHORTCUTS
    )
  })

  // The most likely regression in the whole phase, and an absence assertion is
  // green against a composer that renders nothing at all — so the channel is
  // established twice first: a radiogroup this app really draws, and a control
  // inside this scope that really answers.
  test("has no mode control of any kind", async ({ configure, page }) => {
    const { composer } = configure

    await configure.skillIn(web, CATEGORY, SKILL).toggle()
    await configure.skillIn(web, CATEGORY, SKILL).openOptions()
    // The skill options panel holds two `Segmented` rows, which are real
    // radiogroups — so `getByRole("radiogroup")` is known to report one.
    await expect(page.getByRole("radiogroup").first()).toBeVisible()
    // And the composer's own scope answers for a control that is there.
    await expect(composer.sendButton).toBeVisible()

    await expect(composer.dock.getByRole("radiogroup")).toHaveCount(0)
    await expect(composer.dock.getByRole("radio")).toHaveCount(0)
    await expect(
      composer.dock.getByRole("button", { name: DEAD_MODE_LABEL })
    ).toHaveCount(0)
  })

  // AND NO STARTER CHIPS. They were built, shipped and cut, so the empty state
  // of the dock is the band alone — the placeholder is what names the
  // capability now. `Send` is the dock's only button in every state, which is
  // the assertion rather than a count of a group that no longer exists.
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

// One predicate, two readers: an empty draft is the state the send button is
// disabled in, and `trim` is what tells a whitespace-only draft from a written
// one. The naive `=== ""` passes every assertion in this file except this.
test.describe("an empty draft", () => {
  test("treats a whitespace-only draft as empty", async ({ configure }) => {
    const { composer } = configure

    await composer.type("   ")

    await expect(composer.sendButton).toBeDisabled()
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

  // The header is the proposal's live region and holds two things: the sentence
  // that was sent, in curly quotes that are CONTENT rather than a `::before`,
  // and the total. Zero changes reads `no changes` rather than `0 changes`,
  // which reads as a broken template.
  //
  // The body assertion rides here on purpose: an empty proposal has no group,
  // and a locator asserted to be empty needs to be asserted holding a value in
  // the same test or it is a claim over a channel that never carried one.
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

  // Deliberately outside the live region: live regions should be terse, and the
  // sentence is in the accessible tree either way.
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

  // `Apply` is disabled whenever a proposal carries zero changes — a general
  // rule rather than a phase carve-out. Disabled rather than absent, so the
  // footer does not change shape for a reason the visitor cannot see.
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

  // Both chords are bound on every platform. Only one of them is DRAWN — `⌘↩`
  // on Apple platforms and `Ctrl↩` elsewhere — and a platform check that binds
  // only what it draws is invisible on the platform that keeps it.
  test("submits on Meta+Enter too, on the same platform", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.submitWithKeys("Meta+Enter")

    await expect(composer.proposal).toBeVisible()
  })

  // The field is a prose box whose own placeholder invites a sentence, and the
  // button draws a modifier affordance that would be pointless if the bare key
  // submitted too. The chord is pressed afterwards so the "did not submit" half
  // is asserted over a channel that then carries a value.
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

  // Nothing has been applied, so destroying the visitor's sentence would be a
  // pure loss. `Apply` is the verb that clears it, and it is unreachable here.
  test("leaves the draft alone", async ({ configure }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    expect(await composer.draft()).toBe(SENTENCE)
  })

  // A stale answer to a changed question is worse than no answer. Editing the
  // sentence is the only way to change the question, because there is no other
  // input — the second clearing trigger this used to have was a mode change.
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

  // The headline claim of the phase, and the only assertion that actually makes
  // it: nothing is applied until `Apply` is pressed, and neither the submit nor
  // the discard is that press. Read from the slot rather than inferred from the
  // screen, and the slot is made to carry a value first — comparing two empty
  // strings is a claim about nothing.
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

  // A suite that ignores the console is not watching the application it drives.
  // The second half is the channel: a listener that has never carried a message
  // reports silence for the same reason an unplugged microphone does.
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

// A round trip is a state the composer is IN, not an instant it passes through,
// and until EDITOR-58 nothing on screen said so: the button stayed live and the
// chord stayed bound for the whole of it, so a second press was accepted and
// swallowed by a guard the visitor could not see.
test.describe("a submit in flight", () => {
  test("holds the send button disabled until the answer lands", async ({
    configure,
    page,
  }) => {
    const { composer } = configure
    const compose = holdCompose(page)

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toContainText(THINKING_REASON)

    await expect(composer.sendButton).toBeDisabled()

    // The other direction, and the reason the assertion above is about a state
    // rather than about a button that is simply dead: it comes back.
    compose.release()
    await settled(composer)
    await expect(composer.sendButton).toBeEnabled()
  })

  // A disabled control cannot hold focus, so the press that disables `Send`
  // takes the caret with it unless somewhere is named for it to go. The dock's
  // one input is the obvious somewhere, and it is where `Discard` hands focus
  // back for the same reason: what the visitor was in has just gone.
  test("hands the caret to the field when Send takes itself out of reach", async ({
    configure,
    page,
  }) => {
    const { composer } = configure
    const compose = holdCompose(page)

    await composer.type(SENTENCE)
    await composer.send()

    await expect(composer.sendButton).toBeDisabled()
    await expect(composer.field).toBeFocused()

    compose.release()
    await settled(composer)
  })

  // The button is disabled, so the chord is the only door left open — and a
  // press it swallows and a press it never accepted are identical on screen.
  // What tells them apart is how many sentences reached the worker.
  test("sends one sentence however often the chord is pressed", async ({
    configure,
    page,
  }) => {
    const { composer } = configure
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
   * The in-flight state may not outlive the question that started it.
   *
   * Editing the draft voids the answer — that is what `revise` is for — so an
   * answer nobody is waiting for must not go on holding the field shut. The
   * edited sentence is then submitted and its own echo asserted, which is the
   * one thing that separates "the second submit went through" from "the first
   * answer arrived late and drew itself".
   */
  test("stops waiting on an answer the moment the draft changes", async ({
    configure,
    page,
  }) => {
    const { composer } = configure
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

// Four things can go wrong with a submit and the composer says a different
// sentence about each, because only some of them name something the person at
// the keyboard can do. The signed-out one is the suite's default and is
// asserted above; these are the other three.
test.describe("a refusal", () => {
  const REFUSALS = [
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
  ] as const

  for (const { what, stub, copy } of REFUSALS) {
    test(`says so after ${what}, and offers nothing to apply`, async ({
      configure,
      page,
    }) => {
      const { composer } = configure
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
  /**
   * WHAT APPLY ADDS IS WHAT THE PROPOSAL DREW — one derivation, not two.
   *
   * The rows can only name a skill the seated catalogue carries; a second
   * filter asking merely whether the visitor already holds an id keeps one it
   * does not. `config-store.toggleSkill` refuses an unknown id in silence, so
   * the two lists disagreeing costs nothing today and would cost everything the
   * moment that guard moved — which is why the ids are taken from the rows
   * rather than derived a second time.
   */
  test("selects exactly the skills its rows named", async ({
    configure,
    page,
  }) => {
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

  // The block NAMES what it is offering, and the heading carries the count so
  // the rows do not have to: `Skills · 1 added` generalises to a changed group
  // with no new mechanism. One row per thing, and the count is the row count.
  test("heads the list with what it adds, and draws a row for each", async ({
    configure,
    page,
  }) => {
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

  // Applying is the one verb that clears the sentence: it is the only door out
  // of the composer where what the visitor asked for has actually happened.
  test("clears the proposal", async ({ configure, page }) => {
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

test.describe("discarding a proposal", () => {
  // Three effects, and the third is the one nothing else would catch: the block
  // the visitor was in has just left the DOM, so focus must not fall to `body`.
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

// A floating control needs a geometry assertion, not a visibility one, and this
// column now floats two of them: the marketplace button and the composer. Every
// assertion below is a relationship between two live boxes.
test.describe("the composer's geometry", () => {
  // The dock at its shortest — a draft in the field and no answer yet, so its
  // one conditional child is not drawn.
  test("leaves the marketplace button clear at its shortest", async ({
    configure,
  }) => {
    await configure.composer.type(SENTENCE)

    expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  // The opening state: a blank draft, so the dock is the band alone. This is
  // the one every visitor sees first.
  test("leaves the marketplace button clear with an empty field", async ({
    configure,
  }) => {
    expect(await configure.composer.draft()).toBe("")

    expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  // And with the dock's other conditional child, which is taller again.
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

  // At maximum scroll the sticky wrapper comes to rest in flow, which is the
  // one position it holds that is not the sticky one.
  test("leaves the marketplace button clear at maximum scroll", async ({
    configure,
  }) => {
    await scrollToBottom(configure)

    expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  // The proposal is ABOVE the band. Below it, a full-bleed strip of column
  // colour would sit between the band's bottom hairline and the viewport edge,
  // which reads as a second band — a tenth rejected float treatment by
  // accident. Nothing else catches it being built the other way round.
  test("draws the proposal above the band, not below it", async ({
    configure,
  }) => {
    const { composer } = configure

    await composer.type(SENTENCE)
    await composer.send()
    await expect(composer.proposal).toBeVisible()

    expect(await proposalToBandGap(configure)).toBeGreaterThanOrEqual(0)
  })

  // AND FULL-BLEED, exactly as the band under it is. The proposal is notched
  // into the grid rather than a card floated in the column — a bordered box
  // inset to the content edge is what it used to be, and the two treatments are
  // told apart by one measurement and by nothing else on screen.
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

  // "Notched into the grid": the band is a row of the column rather than a card
  // over it, so it bleeds the full width of the column it sits in.
  test("draws the band full-bleed across the main column", async ({
    configure,
    page,
  }) => {
    const band = await configure.composer.band.boundingBox()
    const main = await page.locator("main").boundingBox()
    if (!band || !main) throw new Error("the band and the column must be drawn")

    expect(band.width).toBeCloseTo(main.width, 0)
  })

  // The bleed asserted against the OTHER full-bleed band in this column rather
  // than against a gutter figure. The gutter is a variable — `--spacing-gutter`
  // — and the design log records four separate bugs from writing its value out
  // instead, so nothing here may know what it is. The filter bar is the
  // composer's idiom upside down, so the two boxes have to agree exactly.
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

  // And the content INSIDE it against the content edge the grid sits on, which
  // is the same edge the filter bar re-insets to. The field's left and the send
  // button's right are the two edges the design names, and a domain section is
  // an ordinary child of the column, so its box IS that edge — measured rather
  // than computed from the gutter for the reason above.
  test("insets its content to the edge the skill grid sits on", async ({
    configure,
  }) => {
    const { composer } = configure
    const section = await configure.domain(web).boundingBox()
    const field = await composer.field.boundingBox()
    const send = await composer.sendButton.boundingBox()
    if (!section || !field || !send)
      throw new Error("the section, the field and the button must be drawn")

    expect(field.x).toBeCloseTo(section.x, 0)
    expect(send.x + send.width).toBeCloseTo(section.x + section.width, 0)
  })

  test("keeps the control row inside the band", async ({ configure }) => {
    const { scroll, client } = await configure.composer.bandOverflow()

    expect(scroll).toBeLessThanOrEqual(client)
  })

  // A dock pinned to the viewport's foot hides whatever is under it, so the
  // page has to end above it: at maximum scroll the last cell in the grid must
  // still be reachable.
  test("does not permanently cover the end of the grid", async ({
    configure,
  }) => {
    await scrollToBottom(configure)

    const cell = await configure.skillCells.last().boundingBox()
    const band = await configure.composer.band.boundingBox()
    if (!cell || !band)
      throw new Error("the last cell and the band must be drawn")

    expect(band.y - (cell.y + cell.height)).toBeGreaterThanOrEqual(0)
  })

  // The field grows with what it holds and then stops, because the dock is
  // sticky at the viewport bottom and an uncapped field would eventually cover
  // the page. Measured rather than asserted as a class: a CSS declaration being
  // present in the DOM is not evidence that it is in effect, which is how a
  // `h-[26rem]` came to report 696px while declaring 416.
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
