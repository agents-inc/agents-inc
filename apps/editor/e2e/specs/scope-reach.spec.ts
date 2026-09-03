import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stubSignedIn } from "../support/auth"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  OUT_OF_SCOPE_IMPORT_ID,
  OUT_OF_SCOPE_PAYLOAD,
  STORED_ID,
  captureCreateConfig,
  stubCreateConfig,
  stubGetConfig,
} from "../support/sharing"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

const DEVELOPER = "web-developer"
const MATRIX_DOMAIN = "API"
const MATRIX_ROLE = "dev"

// The id the skill named `REACT` above travels under. The grid is located by
// display name and the wire carries the id, so the two are named separately.
const REACT_ID = "web-framework-react"

// The marker's own words, written out rather than imported from the app — a
// spec that agrees with a rewording has to be rewritten to say so.
const SCOPE_ERROR = "This sub-agent must be set to project scope too"

// What the Save button says when the write is refused for this reason, written
// out for the reason above. It is the one ending of a save that is decided in
// the browser, so it is also the one that names something already on screen.
const SAVE_SCOPE_CONFLICT = "Scope conflict — fix marked rows"

// EDITOR-08. A global sub-agent's front-matter is written to `~/.claude`, where
// every project on the machine sees it; a project-scoped skill is installed
// under one project's `.claude`. So a global agent carrying a project skill
// names something that does not exist from anywhere else — and the CLI's own
// `init --from` throws on a payload holding one rather than installing a
// quieter configuration than the one that was shared.
//
// It is an ERROR to resolve, not an action to prevent: the assignment is made,
// the scope moves, nothing is dropped — and Install and Share are blocked until
// the user fixes it, which takes one click on the sub-agent's own scope word.

test.describe("a project skill on a global sub-agent", () => {
  test("marks the roster row and says what to do", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()

    // The control: the row is unmarked before the scope moves.
    await expect(configure.roster.skillRow(REACT, DEVELOPER)).toBeVisible()
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()

    await skill.flipScope()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()
    await expect(
      configure.roster.scopeError(REACT, DEVELOPER)
    ).toHaveAccessibleName(SCOPE_ERROR)
  })

  // The sub-agent is on, and that is load-bearing rather than incidental: it
  // holds a skill, which is exactly why the pair is a problem — and its scope
  // word has to read as a live control, because it is the one-click fix.
  test("leaves the sub-agent on and the counts honest", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    const assigned = await skill.agentCount.textContent()

    await skill.flipScope()

    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "true")
    await expect(skill.agentCount).toHaveText(assigned ?? "")
  })

  test("blocks Install and says how many sub-agents to change", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await expect(configure.roster.installButton).toBeEnabled()

    await skill.flipScope()

    await expect(configure.roster.installButton).toBeDisabled()
    await expect(configure.roster.installButton).toContainText("project scope")
  })

  test("counts the sub-agents to change, not the assignments", async ({
    configure,
  }) => {
    const react = configure.skillIn(web, CATEGORY, REACT)
    await react.toggle()
    await react.flipScope()

    // React reaches several sub-agents, so the number is plural and reads as
    // the count of CLICKS it takes to resolve.
    await expect(configure.roster.installButton).toContainText(
      /\d+ sub-agents need project scope/
    )
  })

  // One rule, both doors: a link minted from here would be one `init --from`
  // refuses outright, and that failure lands on the recipient.
  test("blocks Share too", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await expect(configure.roster.shareButton).toBeEnabled()

    await skill.flipScope()

    await expect(configure.roster.shareButton).toBeDisabled()
  })

  test("mints nothing while it is blocked", async ({ configure, page }) => {
    const posted = captureCreateConfig(page)
    const skill = configure.skillIn(web, CATEGORY, REACT)

    await skill.toggle()
    await skill.flipScope()
    await configure.roster.shareButton.click({ force: true })

    await expect(configure.roster.installButton).toBeDisabled()
    expect(posted).toStrictEqual([])
  })

  // The control the assertion above is worth nothing without, and it has to be
  // in THIS file: an empty request log is equally satisfied by a stub that
  // records nothing at all, and a mint asserted in some other spec is not held
  // against this one by anything. The README states the rule — a negative is
  // only as good as the channel that would carry it — and CLI-861 is what it
  // reads like when the channel is left unchecked: the stub behind both of
  // these answered 201 to every body for as long as it existed.
  test("mints once nothing is blocking it", async ({ configure, page }) => {
    const posted = captureCreateConfig(page)
    const skill = configure.skillIn(web, CATEGORY, REACT)

    await skill.toggle()
    await configure.roster.shareButton.click()

    // The request log rather than the button, and deliberately the same surface
    // its sibling above reads: what the button ends up SAYING is the
    // clipboard's business — a context holding no clipboard permission stops at
    // "Link made, copy refused" with the id already minted — and the claim here
    // is only that this channel carries a value at all.
    await expect.poll(() => posted.length).toBe(1)
    const [body] = posted
    expect(body).toBeDefined()
    expect(body!.skills).toHaveProperty(REACT_ID)
  })

  // Blocking it would leave nowhere to put work in progress.
  test("leaves Save alone", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()

    await skill.flipScope()

    await expect(configure.roster.saveButton).toBeEnabled()
  })

  // The owner's flow, end to end: see the marker, click the sub-agent's scope
  // word, install.
  test("one click on the sub-agent's scope resolves it", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.flipScope()
    await expect(configure.roster.installButton).toBeDisabled()

    await configure.roster.scopeControl(DEVELOPER).click()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()
    // The other sub-agents React reaches are still global, so one click fixes
    // one row — and the button stays blocked until the last of them is done.
    await expect(configure.roster.installButton).toBeDisabled()
    await expect(configure.roster.installButton).toContainText("project scope")
  })

  test("setting the skill back to global resolves every row at once", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.flipScope()
    await expect(configure.roster.installButton).toBeDisabled()

    await skill.flipScope()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()
    await expect(configure.roster.installButton).toBeEnabled()
    await expect(configure.roster.shareButton).toBeEnabled()
  })

  // Assigning is not refused. A user pointing the ••• panel at a sub-agent is
  // asking for a configuration, and the answer is the row plus the marker
  // beside it — not a click that silently does nothing.
  test("assigning from the options panel is allowed, and marked", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.openOptions()
    await skill.options.choose("project")

    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)

    await expect(
      skill.options.matrixCell(MATRIX_DOMAIN, MATRIX_ROLE)
    ).toHaveText("lazy")
    await expect(
      configure.roster.scopeError(REACT, "api-developer")
    ).toBeVisible()
  })
})

// The other door the pair arrives through. Nothing is dropped — silently losing
// assignments somebody SHARED is the outcome the ruling forbids — so it lands
// in the error state with Install blocked, and the line above the grid says
// what to do about it.
test.describe("a shared link holding the pair", () => {
  test.beforeEach(({ page }) => {
    stubGetConfig(page, OUT_OF_SCOPE_IMPORT_ID, OUT_OF_SCOPE_PAYLOAD)
    stubCreateConfig(page)
  })

  test("applies the skill and marks the row", async ({ configure, page }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)

    await expect(configure.skill(REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()
  })

  test("says what must be done, above the grid", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)

    await expect(configure.importNotice).toContainText("project scope")
    await expect(configure.importNotice).toContainText("Sub-agents")
  })

  // The line is an explanation, not a substitute for what the address already
  // had to say about itself.
  test("keeps what the shared address already said", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)

    await expect(configure.importNotice).toContainText("shared configuration")
  })

  test("arrives with Install and Share blocked", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)
    await expect(configure.skill(REACT).root).toBeVisible()

    await expect(configure.roster.installButton).toBeDisabled()
    await expect(configure.roster.shareButton).toBeDisabled()
  })

  test("resolves in one click from the row the notice points at", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()

    await configure.roster.scopeControl(DEVELOPER).click()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()
    await expect(configure.roster.installButton).toBeEnabled()
    await expect(configure.importNotice).not.toContainText("project scope")
  })
})

// The third door, and the only one left open. Signed in, Save is a WRITE: the
// same payload a share link carries is minted through `POST /configs` and what
// is stored against the account is a pointer to it (SERVER-04). So the pair
// reaches the store from a button EDITOR-08 deliberately does not disable, and
// `createSharedConfig` refuses it before the request rather than after
// (CLI-851) — which is the part a round trip would otherwise pay for.
//
// SAVE RATHER THAN SHARE, and that is the subject rather than a convenience:
// Share is disabled in front of the guard, so reaching the refusal through it
// means forcing a click on a dead button, while Save takes an ordinary one.
//
// These build their own `ConfigurePage` rather than taking the `configure`
// fixture, the ordering constraint `e2e/README.md` states: the fixture
// navigates during setup, so first paint — and the session read with it — would
// happen before `stubSignedIn` installed anything.
test.describe("a signed-in save of the pair", () => {
  test("refuses it before the POST, and says so on the button", async ({
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const { created } = stubSignedIn(page)
    const configure = new ConfigurePage(page)
    await configure.goto()

    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.flipScope()
    await configure.roster.saveButton.click()

    // The words first, because they are what says the DECISION was reached:
    // this button is silent on a save that worked, so an empty request log with
    // nothing on the button is equally a click that never landed.
    await expect(
      configure.roster.saveNarrating(SAVE_SCOPE_CONFLICT)
    ).toBeVisible()

    // And the request log, because the words alone cannot say WHERE the refusal
    // happened. A `createSharedConfig` that posted first and mapped the worker's
    // 400 back to this same ending would put exactly these words on this button
    // — and a refusal costing a round trip is the defect the pre-POST guard was
    // built to remove, not a friendlier spelling of it. Only the log tells the
    // two apart.
    expect(posted).toStrictEqual([])

    // EDITOR-66, AND THE SECOND ROUND TRIP IS A SEPARATE CLAIM. A signed-in save
    // is TWO writes — mint the payload, then store the pointer — and the log
    // above only holds the first. `roster-panel.tsx` promises beside its
    // `saving` state that a refused mint leaves the account untouched rather
    // than saving a name pointing at nothing, and until this line nothing in the
    // repository held it: an early return dropped from that handler files a row
    // whose `configId` is the empty string, which restores to a dead pointer the
    // next time anyone opens it, and every spec in this project stayed green.
    //
    // The stack log rather than the screen, for the reason its sibling above is
    // the request log: this button is silent on a save that worked, so a stored
    // row and no stored row look identical here. And `stubSignedIn` is what
    // makes the negative worth anything — the same stub answers 201 to the POST
    // it records, so an empty log is a channel that carried nothing rather than
    // one that was never open, which the permitted case below proves by filling
    // it through this very stub.
    expect(created).toStrictEqual([])
  })

  // THE PERMITTED CASE, and the refusal above is worth nothing without it: a
  // `createSharedConfig` that refused every payload leaves the same empty log
  // and the same disabled-nothing on screen, so the negative cannot tell a
  // guard scoped to this pair from one that has swallowed the whole route.
  // It has to be in THIS file — a mint asserted in some other spec is not held
  // against this one by anything.
  //
  // One action apart from its sibling, deliberately: the same skill, the same
  // button, and no `flipScope`.
  test("mints and stores an ordinary configuration", async ({ page }) => {
    const posted = captureCreateConfig(page)
    const { created } = stubSignedIn(page)
    const configure = new ConfigurePage(page)
    await configure.goto()

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.saveButton.click()

    // Both halves of the round trip, and the pointer is polled rather than the
    // payload because it is the second of the two: a stack row exists only once
    // the mint it names came back, so waiting on it settles both.
    await expect.poll(() => created).toHaveLength(1)
    expect(posted).toHaveLength(1)

    const [body] = posted
    expect(body).toBeDefined()
    expect(body!.skills).toHaveProperty(REACT_ID)

    // What is stored is the id the POST answered with rather than anything the
    // page derived, which is the whole design of a saved configuration.
    const [stored] = created
    expect(stored).toBeDefined()
    expect(stored!.configId).toBe(STORED_ID)
  })
})
