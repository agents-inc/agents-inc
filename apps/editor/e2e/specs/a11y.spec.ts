import AxeBuilder from "@axe-core/playwright"
import { GITHUB_RAW_ORIGIN } from "@workspace/api-mocks"
import { EXTERNAL_SKILL, SKILL_INDEX } from "@workspace/api-mocks/fixtures"
import { MATRIX } from "@workspace/matrix"
import { http, HttpResponse } from "msw"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stubCompose, stubSignedIn } from "../support/auth"
import { DOMAINS, EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import { stubCreateConfig } from "../support/sharing"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"
import { stubWith } from "../support/stub"

import type { Locator } from "@playwright/test"

// axe over the assembled app; every state `visual.spec.ts` captures has an
// audit here. `color-contrast` is held out permanently.

// Enough of a selection that the roster and the sticky bar have something to
// draw.
const withSelection = async (configure: ConfigurePage) => {
  await configure.chooseStack(STACKS.nextjs)
  await configure.roster.root.waitFor()
}

// Subject guard for a scrolling pane: one that fits holds nothing for
// `scrollable-region-focusable` to find. Polled, since the text arrives late.
const overflows = (pane: Locator) =>
  pane.evaluate((node) => node.scrollHeight > node.clientHeight)

const audit = async (configure: ConfigurePage) => {
  const { violations } = await new AxeBuilder({ page: configure.page })
    .disableRules(["color-contrast"])
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

  // Held under the pointer, since an audit outlasts the toast's five seconds;
  // the closing count shows the audit ran with it on screen.
  test("with a toast naming the sub-agents a selection switched on", async ({
    configure,
  }) => {
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()
    await expect(configure.toasts.all).toHaveCount(1)
    await configure.toasts.all.hover()

    expect(await audit(configure)).toStrictEqual([])
    await expect(configure.toasts.all).toHaveCount(1)
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

  // A laptop-height window, where the skills and agents lists outgrow the
  // dialog and the row holding both scrolls.
  test("install, in a window too short for its lists", async ({
    configure,
    page,
  }) => {
    stubCreateConfig(page)
    await page.setViewportSize({ width: 1600, height: 640 })
    await withSelection(configure)
    await configure.roster.installButton.click()
    await configure.installDialog.root.waitFor()
    await expect.poll(() => overflows(configure.installDialog.lists)).toBe(true)

    expect(await audit(configure)).toStrictEqual([])
  })

  test("output preview", async ({ configure }) => {
    const preview = configure.outputPreviewDialog
    await withSelection(configure)
    await configure.roster.previewButton.click()
    await preview.root.waitFor()
    await expect.poll(() => overflows(preview.contentPane)).toBe(true)

    expect(await audit(configure)).toStrictEqual([])
  })

  // Fullscreen renames the maximise control and draws a valued `separator`.
  test("output preview in fullscreen", async ({ configure }) => {
    const preview = configure.outputPreviewDialog
    await withSelection(configure)
    await configure.roster.previewButton.click()
    await preview.root.waitFor()
    await preview.fullscreenButton.click()
    await expect.poll(() => overflows(preview.contentPane)).toBe(true)

    expect(await audit(configure)).toStrictEqual([])
  })

  // An added skill's SKILL.md, long enough that its pane scrolls, as a real
  // one does. Served in place of the fixture's few lines.
  test("skill contents, on a file longer than its pane", async ({
    configure,
    page,
  }) => {
    const SKILL_NAME = SKILL_INDEX.skills[0]!.name
    const MANIFEST = "SKILL.md"
    const LONG_MANIFEST = [
      EXTERNAL_SKILL.files[MANIFEST],
      ...Array.from({ length: 200 }, (_, line) => `Line ${line + 1}.`),
    ].join("\n")

    stubSkillIndex(page)
    stubSkillContents(page)
    stubWith(page, [
      http.get(
        `${GITHUB_RAW_ORIGIN}/${EXTERNAL_SKILL.repo}/HEAD/${EXTERNAL_SKILL.path}/${MANIFEST}`,
        () => HttpResponse.text(LONG_MANIFEST)
      ),
    ])

    const category = EXCLUSIVE_CATEGORY.name
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(
      SKILL_NAME,
      `${DOMAINS.web.toLowerCase()} · ${category.toLowerCase()}`
    )
    await dialog.confirm()
    await configure.skillIn(DOMAINS.web, category, SKILL_NAME).openContents()

    const contents = configure.skillContentsDialog
    await expect(contents.openPath).toHaveText(MANIFEST)
    await expect.poll(() => overflows(contents.textPane)).toBe(true)

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

  // Every skill in the catalogue, so the list outgrows the block's cap and
  // scrolls.
  test("with a proposal longer than its block", async ({ page }) => {
    stubSignedIn(page)
    stubCompose(page, Object.keys(MATRIX.skills))
    const configure = new ConfigurePage(page)
    const { composer } = configure
    await configure.goto()

    await composer.type("everything")
    await composer.send()
    await expect(composer.proposalRows.first()).toBeVisible()
    await expect.poll(() => overflows(composer.proposalBody)).toBe(true)

    expect(await audit(configure)).toStrictEqual([])
  })
})
