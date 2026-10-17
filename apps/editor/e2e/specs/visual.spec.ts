import { argosScreenshot } from "@argos-ci/playwright"

import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"
import { DOMAINS, EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import { stubCreateConfig } from "../support/sharing"
import { stubSkillIndex } from "../support/skill-index"

// One capture per chosen state, diffed by Argos. Viewport-sized: below the fold
// is generated catalogue.

// Themes by emulating the media query, which leaves no `data-theme` behind.
// Same page, since Argos names an upload by this string alone.
const THEMES = ["light", "dark"] as const
type Theme = (typeof THEMES)[number]

// The light half keeps its unsuffixed name: a renamed screenshot is a new
// baseline to Argos.
const screenshotName = (name: string, theme: Theme) =>
  theme === "light" ? name : `${name}-dark`

// Quoted rather than read from the stylesheet, so it can fail; it guards the
// harness, since Argos cannot tell a dark pass rendered light.
const PAGE_BACKGROUND = {
  light: "rgb(255, 255, 255)",
  dark: "rgb(22, 21, 19)",
} as const satisfies Record<Theme, string>

const capture = async (configure: ConfigurePage, name: string) => {
  for (const theme of THEMES) {
    await configure.page.emulateMedia({ colorScheme: theme })
    await expect(configure.page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND[theme]
    )
    // Tagged so each theme can be reviewed as a group in Argos.
    await argosScreenshot(configure.page, screenshotName(name, theme), {
      fullPage: false,
      tag: theme,
    })
  }

  // Back to light, so a capture added after this one is not taken in dark.
  await configure.page.emulateMedia({ colorScheme: "light" })
}

// Enough of a selection that the roster, the sticky bar and both footer
// buttons have something to draw.
const withSelection = async (configure: ConfigurePage) => {
  await configure.chooseStack(STACKS.nextjs)
  await configure.roster.root.waitFor()
}

test.describe("the configure screen", () => {
  test("at rest", async ({ configure }) => {
    await capture(configure, "configure-at-rest")
  })

  test("with a stack applied", async ({ configure }) => {
    await withSelection(configure)
    await capture(configure, "configure-stack-applied")
  })

  test("with the stack grid folded away", async ({ configure }) => {
    await configure.stepTitle("then your stack").click()
    await capture(configure, "configure-stacks-folded")
  })

  test("filtered down to one search term", async ({ configure }) => {
    await configure.search(EXCLUSIVE_CATEGORY.first)
    await capture(configure, "configure-searching")
  })

  test("with the filter bar pinned", async ({ configure }) => {
    await withSelection(configure)
    await configure.scrollPastThePin()
    await expect.poll(() => configure.isBarStuck()).toBe(true)
    await capture(configure, "configure-bar-pinned")
  })

  test("with nothing matching the filter", async ({ configure }) => {
    await configure.search("no skill is called this")
    await configure.emptyState.waitFor()
    await capture(configure, "configure-empty-filter")
  })

  // The reason overhangs the cell to its right, so this guards its stacking.
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
    await capture(configure, "configure-codex-error-tip")
  })
})

test.describe("the roster panel", () => {
  test("grouped by scope rather than domain", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.groupBy("scope")
    await capture(configure, "roster-grouped-by-scope")
  })
})

test.describe("the dialogs", () => {
  // Opening the dialog mints a share link, and the fixture refuses anything
  // unstubbed.
  test("install", async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
    await configure.roster.installButton.click()
    await configure.installDialog.root.waitFor()
    await capture(configure, "dialog-install")
  })

  test("output preview", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.previewButton.click()
    await configure.outputPreviewDialog.root.waitFor()
    await capture(configure, "dialog-output-preview")
  })

  // Its own screen: the sheet trades its width for the viewport's inset, so
  // every proportion inside it is measured against a different box.
  test("output preview in fullscreen", async ({ configure }) => {
    await withSelection(configure)
    await configure.roster.previewButton.click()
    await configure.outputPreviewDialog.root.waitFor()
    await configure.outputPreviewDialog.fullscreenButton.click()

    await capture(configure, "dialog-output-preview-fullscreen")
  })

  test("add skill", async ({ configure, page }) => {
    stubSkillIndex(page)
    await configure.addSkillButton.click()
    await configure.addSkillDialog.root.waitFor()
    await capture(configure, "dialog-add-skill")
  })

  test("marketplace", async ({ configure }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.root.waitFor()
    await capture(configure, "dialog-marketplace")
  })
})

test.describe("the composer", () => {
  test("with a sentence drafted", async ({ configure }) => {
    await configure.composer.type("a react app with tailwind and vitest")
    await capture(configure, "composer-drafted")
  })
})
