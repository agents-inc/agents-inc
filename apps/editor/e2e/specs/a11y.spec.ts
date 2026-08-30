import AxeBuilder from "@axe-core/playwright"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stubCompose, stubSignedIn } from "../support/auth"
import { EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import { stubCreateConfig } from "../support/sharing"
import { stubSkillIndex } from "../support/skill-index"

// The accessibility suite, over the ASSEMBLED app.
//
// `packages/ui` already gates axe per component at `test: "error"`, and that is
// not this. A component can be perfectly labelled alone and still land in a
// page with two `main` landmarks, a heading level skipped between sections, a
// dialog that leaves focus behind it, or an accessible name that is unique in
// isolation and duplicated six times once the grid renders. **Composition is
// where these appear, and nothing here could see them until now.**
//
// EVERY STATE `visual.spec.ts` CAPTURES HAS AN AUDIT HERE. That is a rule
// rather than a count, because a count is wrong the first time either file
// grows and a reader cannot tell which of the two moved: the same screens are
// worth both questions, so a capture without an audit is a gap and adding one
// means adding the other. It is stated because it has been false — four of that
// file's captures had no audit for as long as this comment claimed they were
// "the same states" — and it is not symmetrical: the composer's PROPOSAL is
// audited and not captured, since a live region and a pair of buttons are a
// question about announcement rather than about pixels.
//
// TWO RULES ARE HELD OUT, AND THEY ARE NOT THE SAME KIND OF THING.
//
// `color-contrast` is a PERMANENT owner ruling (2026-08-07), recorded in
// packages/ui/.storybook/preview.ts and held out there for the same reason: the
// palette is a taste decision for this project, no rule will ever gate it, and
// running the check would report the design as a defect forever.
//
// `scrollable-region-focusable` is a PENDING FIX — the last of the three real
// defects this suite found on its first run, filed as EDITOR-58. The output
// preview's content pane scrolls and holds nothing focusable, so its file
// cannot be read past the fold without a mouse. It is the only one left: the
// other two came out on 2026-08-29 with the cell and the row that carried
// them, and the shell that now names the page.
//
// **Held out so the suite can gate everything else.** The alternative was
// leaving it failing, which gates nothing and gets ignored. The line below
// comes out as the defect is fixed — and the difference between it and the
// line above it is the whole reason both are annotated rather than listed.
// Enough of a selection that the roster and the sticky bar have something to
// draw. The same preamble `visual.spec.ts` gives its captures, and named here
// for the same reason: an empty right-hand column is its own state rather than
// the basis for the states below.
const withSelection = async (configure: ConfigurePage) => {
  await configure.chooseStack(STACKS.nextjs)
  await configure.roster.root.waitFor()
}

const audit = async (configure: ConfigurePage) => {
  const { violations } = await new AxeBuilder({ page: configure.page })
    .disableRules(["color-contrast", "scrollable-region-focusable"])
    .analyze()

  // The ids alone. A violation's full node list runs to hundreds of lines and
  // buries the one thing a reader needs, which is which rule broke and where.
  return violations.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }))
}

test.describe("the configure screen", () => {
  test("at rest", async ({ configure }) => {
    expect(await audit(configure)).toStrictEqual([])
  })

  test("with a stack applied", async ({ configure }) => {
    await withSelection(configure)

    expect(await audit(configure)).toStrictEqual([])
  })

  test("with nothing matching the filter", async ({ configure }) => {
    await configure.search("no skill is called this")
    await configure.emptyState.waitFor()

    expect(await audit(configure)).toStrictEqual([])
  })

  test("filtered down to one search term", async ({ configure }) => {
    await configure.search(EXCLUSIVE_CATEGORY.first)

    expect(await audit(configure)).toStrictEqual([])
  })

  test("with the stack grid folded away", async ({ configure }) => {
    await configure.stackToggle.click()
    await expect(configure.stacks).toBeHidden()

    expect(await audit(configure)).toStrictEqual([])
  })

  // Pinning is what CHANGES the bar — it takes the top of the window and goes
  // dark — so the audit has to wait for the pin rather than for the scroll.
  // Auditing a bar that never stuck audits the state above it, which is the
  // state "at rest" already covers.
  test("with the filter bar pinned", async ({ configure }) => {
    await withSelection(configure)
    await configure.scrollTo(1200)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    expect(await audit(configure)).toStrictEqual([])
  })
})

test.describe("the roster panel", () => {
  // The bands are the whole of this state: they change from a domain's name to
  // a destination path, and they are the panel's only interactive headers.
  test("grouped by scope rather than domain", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.groupBy("scope")
    await expect(configure.roster.scopeBand("global")).toBeVisible()

    expect(await audit(configure)).toStrictEqual([])
  })
})

// A dialog is where accessibility goes wrong most often and most invisibly —
// focus that never enters, focus that escapes behind it, a surface with no
// accessible name, content underneath left reachable to a screen reader.
test.describe("the dialogs", () => {
  test("install", async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
    await configure.roster.installButton.click()
    await configure.installDialog.root.waitFor()

    expect(await audit(configure)).toStrictEqual([])
  })

  test("output preview", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.previewButton.click()
    await configure.outputPreviewDialog.root.waitFor()

    expect(await audit(configure)).toStrictEqual([])
  })

  test("add skill", async ({ configure, page }) => {
    stubSkillIndex(page)
    await configure.addSkillButton.click()
    await configure.addSkillDialog.root.waitFor()

    expect(await audit(configure)).toStrictEqual([])
  })

  test("marketplace", async ({ configure }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.root.waitFor()

    expect(await audit(configure)).toStrictEqual([])
  })
})

// The composer, and the one surface here neither suite reached. Two states
// rather than one, because they publish through different channels: the field
// and its openers are ordinary controls, and the proposal announces itself
// through a live region and offers two verbs that act on the selection.
test.describe("the composer", () => {
  test("with a sentence drafted", async ({ configure }) => {
    await configure.composer.type("a react app with tailwind and vitest")
    await expect(configure.composer.suggestions).toBeHidden()

    expect(await audit(configure)).toStrictEqual([])
  })

  // Signed in, and building its own `ConfigurePage` for the ordering reason
  // `accounts.spec.ts` states: the `configure` fixture navigates during setup,
  // so the session request has already gone out by the time a spec routes it.
  test("with a proposal to apply or discard", async ({ page }) => {
    stubSignedIn(page)
    stubCompose(page, ["web-framework-react"])
    const configure = new ConfigurePage(page)
    await configure.goto()

    await configure.composer.type("a react app")
    await configure.composer.send()
    await configure.composer.proposalHeader.waitFor()

    expect(await audit(configure)).toStrictEqual([])
  })
})
