import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  IMPLIED,
  INCOMPATIBLE,
} from "../support/catalog"

import type { ConfigurePage } from "../pages/configure-page"
import type { Locator } from "@playwright/test"

const { web } = DOMAINS
const {
  trigger: REACT,
  triggerCategory,
  blocked: SVELTEKIT,
  blockedCategory,
  reason: REASON,
  blockedTransitively: NUXT,
  transitiveCategory,
} = INCOMPATIBLE

// Ruled out several hops away: SvelteKit → built on Svelte → conflicts with
// React.
test.describe("incompatible skills", () => {
  test("nothing is ruled out before anything is chosen", async ({
    configure,
  }) => {
    const sveltekit = configure.skillIn(web, blockedCategory, SVELTEKIT)

    expect(await sveltekit.isIncompatible()).toBe(false)
  })

  test("choosing a framework rules out what cannot be built on it", async ({
    configure,
  }) => {
    await configure.skillIn(web, triggerCategory, REACT).toggle()

    const sveltekit = configure.skillIn(web, blockedCategory, SVELTEKIT)
    expect(await sveltekit.isIncompatible()).toBe(true)
    expect(await sveltekit.incompatibleReason()).toBe(REASON)
  })

  test("the rule keeps following past the first hop", async ({ configure }) => {
    await configure.skillIn(web, triggerCategory, REACT).toggle()

    // Nuxt is built on Vue, and Vue is what conflicts with React.
    expect(
      await configure.skillIn(web, transitiveCategory, NUXT).isIncompatible()
    ).toBe(true)
  })

  // A ruled-out cell stops being white and sinks into the column; no opacity,
  // so its name stays legible.
  test("a ruled-out cell recedes into the column, at full opacity", async ({
    configure,
  }) => {
    const sveltekit = configure.skillIn(web, blockedCategory, SVELTEKIT)
    const available = await sveltekit.background()

    await configure.skillIn(web, triggerCategory, REACT).toggle()

    const receded = await sveltekit.background()
    expect(receded).not.toBe(available)
    expect(
      await sveltekit.cell.evaluate((node) => getComputedStyle(node).opacity)
    ).toBe("1")
  })

  test("a ruled-out cell reads as disabled to the browser", async ({
    configure,
  }) => {
    await configure.skillIn(web, triggerCategory, REACT).toggle()

    // `aria-disabled` takes it out of Playwright's actionability, the same
    // check assistive tech makes.
    await expect(
      configure.skillIn(web, blockedCategory, SVELTEKIT).root
    ).toBeDisabled()
  })

  test("forcing a click on it still selects nothing", async ({ configure }) => {
    await configure.skillIn(web, triggerCategory, REACT).toggle()
    const sveltekit = configure.skillIn(web, blockedCategory, SVELTEKIT)

    // Every control on the cell reads disabled, so each press is forced and
    // each handler must refuse.
    await sveltekit.root.click({ force: true })
    expect(await sveltekit.isSelected()).toBe(false)

    // Either install cell will do: nothing inside a ruled-out cell may select
    // it.
    await sveltekit.installCell("plugin").click({ force: true })
    expect(await sveltekit.isSelected()).toBe(false)

    await sveltekit.optionsButton.click({ force: true })
    expect(await sveltekit.isSelected()).toBe(false)
    await expect(sveltekit.options.root).toBeHidden()
  })

  test("it is never hidden, only disabled", async ({ configure }) => {
    await configure.skillIn(web, triggerCategory, REACT).toggle()

    await expect(
      configure.skillIn(web, blockedCategory, SVELTEKIT).root
    ).toBeVisible()
  })

  // Picking one replaces rather than adds, so ruling the rest out would strand
  // the user on their first choice.
  test("exclusive siblings stay selectable", async ({ configure }) => {
    await configure.skillIn(web, triggerCategory, REACT).toggle()

    const vue = configure.skillIn(
      web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.second
    )
    expect(await vue.isIncompatible()).toBe(false)

    await vue.toggle()
    expect(await vue.isSelected()).toBe(true)
  })

  test("deselecting puts everything back in reach", async ({ configure }) => {
    const react = configure.skillIn(web, triggerCategory, REACT)
    const sveltekit = configure.skillIn(web, blockedCategory, SVELTEKIT)

    await react.toggle()
    expect(await sveltekit.isIncompatible()).toBe(true)

    await react.toggle()
    expect(await sveltekit.isIncompatible()).toBe(false)
    await sveltekit.toggle()
    expect(await sveltekit.isSelected()).toBe(true)
  })

  // The other direction. Next.js is built on React, so choosing Next.js
  // chooses React, and everything React strands goes with it — even though
  // Next.js itself names none of those skills.
  test("what the selection implies rules things out too", async ({
    configure,
  }) => {
    await configure
      .skillIn(web, IMPLIED.implierCategory, IMPLIED.implier)
      .toggle()

    const vuetify = configure.skillIn(
      web,
      IMPLIED.blockedCategory,
      IMPLIED.blocked
    )
    await expect(vuetify.root).toBeDisabled()
    expect(await vuetify.incompatibleReason()).toBe(IMPLIED.reason)
  })

  // Angular conflicts with the implied React, but a pick-one category swaps
  // rather than adds, so the sibling exemption reaches implied skills too —
  // and React itself stays live, because choosing it is consistent with
  // Next.js.
  test("an implied conflict gets the sibling exemption too", async ({
    configure,
  }) => {
    await configure
      .skillIn(web, IMPLIED.implierCategory, IMPLIED.implier)
      .toggle()

    await expect(
      configure.skillIn(web, IMPLIED.impliedCategory, IMPLIED.implied).root
    ).toBeEnabled()
    await expect(
      configure.skillIn(web, IMPLIED.impliedCategory, IMPLIED.impliedSibling)
        .root
    ).toBeEnabled()
    await expect(
      configure.skillIn(web, IMPLIED.implierCategory, IMPLIED.implierSibling)
        .root
    ).toBeEnabled()
  })

  // Swapping to the framework it is built on is the way out of the dead end.
  test("choosing the required skill releases it", async ({ configure }) => {
    await configure.skillIn(web, triggerCategory, REACT).toggle()
    const sveltekit = configure.skillIn(web, blockedCategory, SVELTEKIT)
    expect(await sveltekit.isIncompatible()).toBe(true)

    await configure.skillIn(web, triggerCategory, "Svelte").toggle()

    expect(await sveltekit.isIncompatible()).toBe(false)
  })
})

const paintOf = (target: Locator) =>
  target.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      color: style.color,
      background: style.backgroundColor,
      border: style.borderColor,
      shadow: style.boxShadow,
      cursor: style.cursor,
    }
  })

const theClash = (configure: ConfigurePage) => ({
  react: configure.skillIn(web, triggerCategory, REACT),
  sveltekit: configure.skillIn(web, blockedCategory, SVELTEKIT),
})

// The ••• and both switches read as the cell does: disabled to the eye and to
// assistive tech while the clash stands, live again once it goes.
test.describe("a ruled-out cell's own controls", () => {
  test("its ••• reads as disabled while the clash stands", async ({
    configure,
  }) => {
    const { react, sveltekit } = theClash(configure)
    await expect(sveltekit.optionsButton).toBeEnabled()

    await react.toggle()
    await expect(sveltekit.optionsButton).toBeDisabled()

    await react.toggle()
    await expect(sveltekit.optionsButton).toBeEnabled()
  })

  test("its ••• opens nothing from the keyboard", async ({
    configure,
    page,
  }) => {
    const { react, sveltekit } = theClash(configure)
    await react.toggle()

    await sveltekit.optionsButton.focus()
    await page.keyboard.press("Enter")
    await page.keyboard.press("Space")

    await expect(sveltekit.optionsButton).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    await expect(sveltekit.options.root).toBeHidden()
  })

  test("its ••• opens the options once the clash goes", async ({
    configure,
  }) => {
    const { react, sveltekit } = theClash(configure)
    await react.toggle()
    await react.toggle()

    await sveltekit.openOptions()

    await expect(sveltekit.options.root).toBeVisible()
    await expect(sveltekit.optionsButton).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })

  // Shown, as on any cell under the pointer, but offering no press.
  test("its ••• still shows on hover, and the pointer changes nothing on it", async ({
    configure,
  }) => {
    const { react, sveltekit } = theClash(configure)
    await sveltekit.hover()
    const availableAtRest = await sveltekit.optionsPaint()
    expect(availableAtRest.cursor).toBe("pointer")
    await sveltekit.optionsButton.hover()
    expect(await sveltekit.optionsPaint()).not.toStrictEqual(availableAtRest)

    await react.toggle()
    await sveltekit.hover()
    await expect.poll(() => sveltekit.optionsOpacity()).toBe(1)

    const atRest = await sveltekit.optionsPaint()
    expect(atRest.cursor).not.toBe("pointer")
    await sveltekit.optionsButton.hover()
    expect(await sveltekit.optionsPaint()).toStrictEqual(atRest)
  })

  test("its switches read as disabled while the clash stands", async ({
    configure,
  }) => {
    const { react, sveltekit } = theClash(configure)
    for (const cell of sveltekit.switches) await expect(cell).toBeEnabled()

    await react.toggle()
    for (const cell of sveltekit.switches) await expect(cell).toBeDisabled()

    await react.toggle()
    for (const cell of sveltekit.switches) await expect(cell).toBeEnabled()
  })

  // Past the ••• come the cell's pairs, until the clash takes them out.
  test("its switches leave the tab order while the clash stands", async ({
    configure,
    page,
  }) => {
    const { react, sveltekit } = theClash(configure)
    const inTheCell = sveltekit.cell.locator(":focus")

    await sveltekit.optionsButton.focus()
    await page.keyboard.press("Tab")
    await expect(sveltekit.installMode).toBeFocused()

    await react.toggle()
    await sveltekit.optionsButton.focus()
    await expect(sveltekit.optionsButton).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(inTheCell).toHaveCount(0)
  })

  // The paint every refused switch takes, as Codex's refused PROJECT does.
  test("its switches take the unavailable paint, and the pointer changes nothing on them", async ({
    configure,
  }) => {
    const { react, sveltekit } = theClash(configure)
    for (const cell of sveltekit.switches) {
      expect((await paintOf(cell)).cursor).toBe("pointer")
    }

    await react.toggle()

    for (const cell of sveltekit.switches) {
      const atRest = await paintOf(cell)
      expect(atRest.cursor).toBe("not-allowed")
      await cell.hover()
      expect(await paintOf(cell)).toStrictEqual(atRest)
    }
    const unavailable = await configure.tokenColor("--color-unavailable")
    for (const off of await sveltekit.offSwitches.all()) {
      expect((await paintOf(off)).color).toBe(unavailable)
    }
  })

  test("pressing one of its switches changes nothing", async ({
    configure,
  }) => {
    const { react, sveltekit } = theClash(configure)
    await react.toggle()
    const install = await sveltekit.installMode.textContent()
    const scope = await sveltekit.scope.textContent()

    for (const off of await sveltekit.offSwitches.all()) {
      await off.click({ force: true })
    }

    expect(await sveltekit.installMode.textContent()).toBe(install)
    expect(await sveltekit.scope.textContent()).toBe(scope)
    expect(await sveltekit.isSelected()).toBe(false)
  })

  test("a switch press lands once the clash goes", async ({ configure }) => {
    const { react, sveltekit } = theClash(configure)
    await react.toggle()
    await react.toggle()
    const install = await sveltekit.installMode.textContent()

    await sveltekit.flipInstall()

    await expect
      .poll(() => sveltekit.installMode.textContent())
      .not.toBe(install)
  })
})

const pressFromTheKeyboard = async (target: Locator) => {
  await target.focus()
  await target.page().keyboard.press("Space")
}

// Nothing stays editable on a ruled-out skill, so the clash closes its panel
// as a press outside does, whatever made the choice.
test.describe("a skill's open options as the selection changes", () => {
  test("close when a choice from the keyboard rules the skill out", async ({
    configure,
  }) => {
    const { react, sveltekit } = theClash(configure)
    await sveltekit.openOptions()
    await expect(sveltekit.options.root).toBeVisible()

    await pressFromTheKeyboard(react.root)

    await expect(sveltekit.root).toBeDisabled()
    await expect(sveltekit.options.root).toBeHidden()
    await expect(sveltekit.optionsButton).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  })

  test("stay closed once the skill is back in reach", async ({ configure }) => {
    const { react, sveltekit } = theClash(configure)
    await sveltekit.openOptions()
    await expect(sveltekit.options.root).toBeVisible()

    await pressFromTheKeyboard(react.root)
    await expect(sveltekit.root).toBeDisabled()
    await pressFromTheKeyboard(react.root)

    await expect(sveltekit.root).toBeEnabled()
    await expect(sveltekit.options.root).toBeHidden()
    await expect(sveltekit.optionsButton).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  })

  test("close when a choice with the pointer rules the skill out", async ({
    configure,
  }) => {
    const { react, sveltekit } = theClash(configure)
    await sveltekit.openOptions()
    await expect(sveltekit.options.root).toBeVisible()

    await react.toggle()

    await expect(sveltekit.root).toBeDisabled()
    await expect(sveltekit.options.root).toBeHidden()
  })

  // Svelte rules Next.js out but is what SvelteKit is built on.
  test("stay open when a choice from the keyboard leaves the skill in reach", async ({
    configure,
  }) => {
    const sveltekit = configure.skillIn(web, blockedCategory, SVELTEKIT)
    const svelte = configure.skillIn(web, triggerCategory, "Svelte")
    const nextjs = configure.skillIn(
      web,
      IMPLIED.implierCategory,
      IMPLIED.implier
    )
    await sveltekit.openOptions()

    await pressFromTheKeyboard(svelte.root)

    await expect(nextjs.root).toBeDisabled()
    await expect(sveltekit.root).toBeEnabled()
    await expect(sveltekit.options.root).toBeVisible()
    await expect(sveltekit.optionsButton).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })

  test("close without moving the keyboard", async ({ configure }) => {
    const { react, sveltekit } = theClash(configure)
    await sveltekit.openOptions()

    await pressFromTheKeyboard(react.root)

    await expect(sveltekit.root).toBeDisabled()
    await expect(react.root).toBeFocused()
  })

  test("close with the settings made in them kept", async ({ configure }) => {
    const { react, sveltekit } = theClash(configure)
    const assignment = sveltekit.options.matrixCell(web, "dev")
    await sveltekit.openOptions()
    await sveltekit.options.choose("eject")
    await sveltekit.options.choose("global")
    await expect(assignment).toHaveText("pre")
    await sveltekit.options.cycleAssignment(web, "dev")
    await sveltekit.options.cycleAssignment(web, "dev")
    await expect(assignment).toHaveText("lazy")

    await pressFromTheKeyboard(react.root)
    await expect(sveltekit.root).toBeDisabled()
    await expect(sveltekit.installMode).toHaveText("eject")
    await expect(sveltekit.scope).toHaveText("global")

    await react.toggle()
    await sveltekit.openOptions()
    await expect(sveltekit.options.segment("eject")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(sveltekit.options.segment("global")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(assignment).toHaveText("lazy")
  })
})
