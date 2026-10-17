import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

const { web } = DOMAINS

// The 1500px threshold from both sides, written again on purpose: asking the
// app for it would pass anywhere. 1400 sits under it and over the 1200px floor.
const WIDE = { width: 1600, height: 1000 }
const NARROW = { width: 1400, height: 1000 }

test.describe("at or past the threshold", () => {
  test.use({ viewport: WIDE })

  test("draws the skill lattice four across", async ({ configure }) => {
    const lattice = configure.skillLattice(web, EXCLUSIVE_CATEGORY.name)

    expect(await configure.latticeTracks(lattice)).toBe(4)
  })

  test("draws the stack grid four across", async ({ configure }) => {
    expect(await configure.latticeTracks(configure.stacks)).toBe(4)
  })

  test("gives every domain tab its count", async ({ configure }) => {
    await expect(configure.domainTab(web)).toHaveText(
      new RegExp(`^${web}\\d+$`)
    )
  })
})

test.describe("below the threshold", () => {
  test.use({ viewport: NARROW })

  test("draws the skill lattice three across", async ({ configure }) => {
    const lattice = configure.skillLattice(web, EXCLUSIVE_CATEGORY.name)

    expect(await configure.latticeTracks(lattice)).toBe(3)
  })

  test("draws the stack grid three across, with it", async ({ configure }) => {
    expect(await configure.latticeTracks(configure.stacks)).toBe(3)
  })

  test("drops the count, and keeps the name", async ({ configure }) => {
    await expect(configure.domainTab(web)).toHaveText(web)
    await expect(configure.domainTab(web)).toHaveAccessibleName(web)
  })

  // Read off the document: an element can sit inside its container and still
  // push the page out.
  test("fits the window it is drawn in", async ({ configure }) => {
    const { scrollWidth, clientWidth } = await configure.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})
