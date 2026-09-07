import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

const { web } = DOMAINS

// THE ONE VIEWPORT THRESHOLD THE APP HAS, from both sides.
//
// Three things cross it together and they are one decision rather than three:
// the skill lattice goes from four tracks to three, the stack grid follows it,
// and each domain tab drops the `01` index and the skill count it carries above
// the line. The threshold itself — 1500px — is written once, in
// `src/lib/viewport.ts`, and this file is the only place it is written a second
// time, because a spec that asked the app where its own threshold was could
// pass with the threshold anywhere.
//
// THE NARROW HALF IS A DRAWING A WINDOW CAN ACTUALLY HOLD, and it was not
// always: the page grid's floor used to sit at 1500px — the threshold itself —
// so every viewport that selected the narrow drawing also scrolled sideways,
// and the query was choosing between a layout that fitted and one nobody could
// see whole. The floor is 1200px now, which is what puts a real band between
// the two: 1400 is under the threshold and over the floor, so the last test
// below asserts the thing that band exists for.
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

  test("gives every domain tab its index and its count", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).toContainText("01")
  })
})

test.describe("below the threshold", () => {
  test.use({ viewport: NARROW })

  test("draws the skill lattice three across", async ({ configure }) => {
    const lattice = configure.skillLattice(web, EXCLUSIVE_CATEGORY.name)

    expect(await configure.latticeTracks(lattice)).toBe(3)
  })

  // The two lattices are one language. A stack row three across over skills
  // four across reads as two grids rather than as one page.
  test("draws the stack grid three across, with it", async ({ configure }) => {
    expect(await configure.latticeTracks(configure.stacks)).toBe(3)
  })

  // The index and the count are decoration on a control whose name is the
  // domain, which is why dropping them costs a reader nothing: the tab
  // announces exactly what it announced above the line.
  test("drops the index and the count, and keeps the name", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).not.toContainText("01")
    await expect(configure.domainTab(web)).toHaveAccessibleName(web)
  })

  // WHAT THE NARROW DRAWING IS FOR. Three tracks and a stripped strip buy
  // nothing while the window they are drawn in is wider than the screen — that
  // was the state until the grid's floor came down to 1200px, and it is the one
  // claim here that is about the two halves TOGETHER rather than about either.
  //
  // Read off the document rather than off the grid: an element can sit inside
  // its container and still push the page out, which is exactly what the grid
  // did when its tracks outgrew a floor set under them.
  test("fits the window it is drawn in", async ({ configure }) => {
    const { scrollWidth, clientWidth } = await configure.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})
