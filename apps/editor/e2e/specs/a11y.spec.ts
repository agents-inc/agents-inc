import AxeBuilder from "@axe-core/playwright"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stubCompose, stubSignedIn } from "../support/auth"
import { DOMAINS, EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import { stubCreateConfig } from "../support/sharing"
import { stubSkillIndex } from "../support/skill-index"

// axe over the assembled app; `packages/ui` gates each component alone. Every
// state `visual.spec.ts` captures has an audit here.
//
// Two rules are held out. `color-contrast` is a permanent owner ruling (see
// packages/ui/.storybook/preview.ts). `scrollable-region-focusable` is a
// pending fix, EDITOR-58: the output preview's content pane scrolls and holds
// nothing focusable. It comes out of the list once that is fixed.

// Enough of a selection that the roster and the sticky bar have something to
// draw.
const withSelection = async (configure: ConfigurePage) => {
  await configure.chooseStack(STACKS.nextjs)
  await configure.roster.root.waitFor()
}

const audit = async (configure: ConfigurePage) => {
  const { violations } = await new AxeBuilder({ page: configure.page })
    .disableRules(["color-contrast", "scrollable-region-focusable"])
    .analyze()

  // Rule and target only; the full node list buries which rule broke.
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
    await configure.stepTitle("then your stack").click()
    await expect(configure.stacks).toBeHidden()

    expect(await audit(configure)).toStrictEqual([])
  })

  // Waits for the pin rather than the scroll: an unstuck bar is "at rest".
  test("with the filter bar pinned", async ({ configure }) => {
    await withSelection(configure)
    await configure.scrollPastThePin()
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    expect(await audit(configure)).toStrictEqual([])
  })

  test("with Codex chosen as the provider", async ({ configure }) => {
    await withSelection(configure)
    await configure.provider.choose("codex")
    await expect(configure.provider.chosen).toHaveText(/codex/i)

    expect(await audit(configure)).toStrictEqual([])
  })

  test("with a Codex error mark's reason open", async ({ configure }) => {
    await withSelection(configure)
    const skill = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.first
    )
    await skill.flipScope()
    await configure.provider.choose("codex")
    await skill.errorMark.focus()
    await expect(skill.errorTip).toBeVisible()

    expect(await audit(configure)).toStrictEqual([])
  })
})

test.describe("the roster panel", () => {
  test("grouped by scope rather than domain", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.groupBy("scope")
    await expect(configure.roster.scopeBand("global")).toBeVisible()

    expect(await audit(configure)).toStrictEqual([])
  })
})

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

  // Fullscreen renames the maximise control and draws a valued `separator`.
  test("output preview in fullscreen", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.previewButton.click()
    await configure.outputPreviewDialog.root.waitFor()
    await configure.outputPreviewDialog.fullscreenButton.click()

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

// Two states: the draft is ordinary controls, and the proposal announces
// itself through a live region.
test.describe("the composer", () => {
  test("with a sentence drafted", async ({ configure }) => {
    await configure.composer.type("a react app with tailwind and vitest")
    await expect(configure.composer.sendButton).toBeEnabled()

    expect(await audit(configure)).toStrictEqual([])
  })

  // Builds its own `ConfigurePage`: the `configure` fixture navigates during
  // setup, before a spec could route the session request.
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
