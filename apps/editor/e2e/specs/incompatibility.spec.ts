import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  IMPLIED,
  INCOMPATIBLE,
} from "../support/catalog"

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

    // `aria-disabled` takes it out of the tab order and out of Playwright's
    // actionability, the same check assistive tech makes.
    await expect(
      configure.skillIn(web, blockedCategory, SVELTEKIT).root
    ).toBeDisabled()
  })

  test("forcing a click on it still selects nothing", async ({ configure }) => {
    await configure.skillIn(web, triggerCategory, REACT).toggle()
    const sveltekit = configure.skillIn(web, blockedCategory, SVELTEKIT)

    // `aria-disabled` on the cell takes its whole subtree out of
    // actionability, so each press is forced and each handler must refuse.
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
