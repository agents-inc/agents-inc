import {
  EXTERNAL_SKILL,
  SKILL_INDEX,
  XSS_SENTINEL,
} from "@workspace/api-mocks/fixtures"
import { CORPUS_CLI_VERSION } from "@workspace/compile/corpus"
import { MATRIX, matrixSchema } from "@workspace/matrix"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import { stubMarketplaceCatalogOf } from "../support/marketplace"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"

import type { ConfigurePage } from "../pages/configure-page"
import type { Locator } from "@playwright/test"

/**
 * What needs a browser. The bytes are held against `@workspace/compile` in
 * output-preview.test.ts and against a real install in
 * preview-matches-install.spec.ts. Copy is mirrored, never imported, so an
 * assertion can fail.
 */

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY
const REACT_ID = "web-framework-react"

// Named rather than counted: a count cannot see a swap.
const REACHED_AGENTS = [
  "pm",
  "reviewer",
  "web-developer",
  "web-researcher",
  "web-tester",
] as const

const DEVELOPER = "web-developer"

const GLOBAL = "~/"
const PROJECT = "./"

// Mirrored, not imported. One row carries both segments; drawn nested, every
// level below would move.
const SOURCE_DIR = ".agents-inc/claude/"

const CONFIG_TS = "config.ts"
const CONFIG_TYPES_TS = "config-types.ts"

// The design draws `config.d.ts`; the CLI emits `config-types.ts`.
const DESIGN_FILE_THE_CLI_NEVER_WRITES = "config.d.ts"

const NEW = "new"
const PLUGIN = "plugin"
const EJECT = "eject"

// The header's marker vocabulary is disjoint from the tree's.
const REFERENCE_ONLY = "reference only"

const CLEAN_MACHINE_CLAIM =
  "what installing this configuration on a machine with no existing agents-inc installation writes"

const PROJECT_DIRECTORY_PREMISE = "when it is run from a project directory"

// `init --from` in a project directory writes the project's pair whatever the
// configuration holds.
const PROJECT_PAIR_TREE = [PROJECT, SOURCE_DIR, CONFIG_TS, CONFIG_TYPES_TS]

// Written out rather than counted, so a swapped row fails.
const WHOLLY_GLOBAL_TREE = [
  GLOBAL,
  SOURCE_DIR,
  CONFIG_TS,
  CONFIG_TYPES_TS,
  ".claude/",
  "agents/",
  ...REACHED_AGENTS.map((agent) => `${agent}.md`),
  "plugin skills",
  REACT_ID,
  ...PROJECT_PAIR_TREE,
]

const SPLIT_TREE = [
  GLOBAL,
  SOURCE_DIR,
  CONFIG_TS,
  CONFIG_TYPES_TS,
  ".claude/",
  "agents/",
  ...REACHED_AGENTS.filter((agent) => agent !== DEVELOPER).map(
    (agent) => `${agent}.md`
  ),
  "plugin skills",
  REACT_ID,
  PROJECT,
  SOURCE_DIR,
  CONFIG_TS,
  CONFIG_TYPES_TS,
  ".claude/",
  "agents/",
  `${DEVELOPER}.md`,
]

const EJECTED_TREE = [
  GLOBAL,
  SOURCE_DIR,
  CONFIG_TS,
  CONFIG_TYPES_TS,
  ".claude/",
  "agents/",
  ...REACHED_AGENTS.map((agent) => `${agent}.md`),
  "skills/",
  `${REACT_ID}/`,
  ...PROJECT_PAIR_TREE,
]

const globalPath = (rest: string) => `${GLOBAL}${rest}`
const projectPath = (rest: string) => `${PROJECT}${rest}`

const GLOBAL_CONFIG_PATH = globalPath(`${SOURCE_DIR}${CONFIG_TS}`)
const PROJECT_CONFIG_PATH = projectPath(`${SOURCE_DIR}${CONFIG_TS}`)
const GLOBAL_DEVELOPER_PATH = globalPath(`.claude/agents/${DEVELOPER}.md`)

// Design px. The root is 110%, so `boundingBox()` reports 275 for a 250px
// design; fixing the product to `w-[250px]` would break its proportion with
// everything else that scales.
const TREE_PANE_DESIGN_PX = 250
const ROOT_FONT_SCALE_PERCENT = 110
const TREE_PANE_RENDERED_PX =
  (TREE_PANE_DESIGN_PX * ROOT_FONT_SCALE_PERCENT) / 100

test.describe("the output preview", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
  })

  test("the roster footer opens it", async ({ configure }) => {
    await configure.roster.previewButton.click()

    await expect(configure.outputPreviewDialog.root).toBeVisible()
  })

  /** Tabbed to from Share rather than focused: the tab order is the claim. */
  test("it is reachable from the keyboard between Share and Install", async ({
    configure,
    page,
  }) => {
    await configure.roster.shareButton.focus()
    await page.keyboard.press("Tab")

    await expect(configure.roster.previewButton).toBeFocused()

    await page.keyboard.press("Enter")

    await expect(configure.outputPreviewDialog.root).toBeVisible()
  })

  test("its label is one word, and the title still says generated", async ({
    configure,
  }) => {
    await expect(configure.roster.previewButton).toHaveText("Preview")
    await expect(configure.roster.previewButton).toHaveAttribute(
      "title",
      "Preview generated code"
    )
  })

  test("its title is the dialog's accessible name", async ({ configure }) => {
    await configure.roster.previewButton.click()

    await expect(configure.outputPreviewDialog.root).toHaveAccessibleName(
      "Output preview"
    )
  })
})

test.describe("the tree", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
  })

  test("draws both roots, their directories and every file under them", async ({
    configure,
  }) => {
    await configure.roster.previewButton.click()

    expect(await configure.outputPreviewDialog.rowNames()).toStrictEqual(
      WHOLLY_GLOBAL_TREE
    )
  })

  test("names the file the CLI emits, not the one the design drew", async ({
    configure,
  }) => {
    await configure.roster.previewButton.click()

    const names = await configure.outputPreviewDialog.rowNames()

    expect(names).toContain(CONFIG_TYPES_TS)
    expect(names).not.toContain(DESIGN_FILE_THE_CLI_NEVER_WRITES)
  })

  test("flipping an agent's scope moves its markdown between the roots", async ({
    configure,
  }) => {
    await configure.roster.previewButton.click()
    await expect(
      configure.outputPreviewDialog.row(GLOBAL_DEVELOPER_PATH)
    ).toBeVisible()
    await configure.outputPreviewDialog.close()

    await configure.subAgents.setScope(DEVELOPER, "project")
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    expect(await preview.rowNames()).toStrictEqual(SPLIT_TREE)
    await expect(
      preview.row(projectPath(`.claude/agents/${DEVELOPER}.md`))
    ).toBeVisible()
    await expect(preview.row(GLOBAL_DEVELOPER_PATH)).toHaveCount(0)
  })

  test("every emitted root holds the config pair", async ({ configure }) => {
    await configure.subAgents.setScope(DEVELOPER, "project")
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    await expect(preview.row(GLOBAL_CONFIG_PATH)).toBeVisible()
    await expect(
      preview.row(globalPath(`${SOURCE_DIR}${CONFIG_TYPES_TS}`))
    ).toBeVisible()
    await expect(preview.row(PROJECT_CONFIG_PATH)).toBeVisible()
    await expect(
      preview.row(projectPath(`${SOURCE_DIR}${CONFIG_TYPES_TS}`))
    ).toBeVisible()
  })

  test("flipping a skill to eject turns its reference into a directory", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await configure.roster.previewButton.click()
    expect(await preview.markerOf(REACT_ID)).toStrictEqual(PLUGIN)
    await preview.close()

    await configure.skillIn(web, CATEGORY, REACT).flipInstall()
    await configure.roster.previewButton.click()

    expect(await preview.rowNames()).toStrictEqual(EJECTED_TREE)
    expect(
      await preview.markerOf(globalPath(`.claude/skills/${REACT_ID}/`))
    ).toStrictEqual(EJECT)
  })

  /** Both halves, because either alone is satisfied by a bug. */
  test("a plugin skill is never `new` and never sits under a skills/ path", async ({
    configure,
  }) => {
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    expect(await preview.markerOf(REACT_ID)).not.toStrictEqual(NEW)
    await expect(
      preview.row(globalPath(`.claude/skills/${REACT_ID}/`))
    ).toHaveCount(0)
    expect(await preview.rowPaths()).not.toContain(
      globalPath(`.claude/skills/${REACT_ID}`)
    )
  })

  /**
   * Agents are flipped first, so the skill's flip never hits the scope error.
   */
  test("draws the global pair for a configuration written wholly into the project", async ({
    configure,
  }) => {
    for (const agent of REACHED_AGENTS) {
      await configure.subAgents.setScope(agent, "project")
    }
    await configure.skillIn(web, CATEGORY, REACT).flipScope()

    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    await expect(preview.row(PROJECT_CONFIG_PATH)).toBeVisible()
    expect(
      (await preview.rowPaths()).filter(
        (path) => path?.startsWith(GLOBAL) === true
      )
    ).toStrictEqual([
      GLOBAL,
      globalPath(SOURCE_DIR),
      GLOBAL_CONFIG_PATH,
      globalPath(`${SOURCE_DIR}${CONFIG_TYPES_TS}`),
    ])
  })
})

/**
 * The rows are flat DOM siblings, so `aria-level`/`posinset`/`setsize` are the
 * whole tree for a screen reader. Held against the ejected tree, where
 * `agents/` and `skills/` are separated siblings: a run-based implementation
 * gets those wrong.
 */
test.describe("the tree's shape, as a screen reader reads it", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
  })

  // Written out rather than derived, so it cannot share a bug with
  // `siblingPositions`.
  const EJECTED_POSITIONS = [
    { path: GLOBAL, level: "1", posinset: "1", setsize: "2" },
    {
      path: globalPath(SOURCE_DIR),
      level: "2",
      posinset: "1",
      setsize: "2",
    },
    { path: GLOBAL_CONFIG_PATH, level: "3", posinset: "1", setsize: "2" },
    {
      path: globalPath(`${SOURCE_DIR}${CONFIG_TYPES_TS}`),
      level: "3",
      posinset: "2",
      setsize: "2",
    },
    { path: globalPath(".claude/"), level: "2", posinset: "2", setsize: "2" },
    {
      path: globalPath(".claude/agents/"),
      level: "3",
      posinset: "1",
      setsize: "2",
    },
    ...REACHED_AGENTS.map((agent, index) => ({
      path: globalPath(`.claude/agents/${agent}.md`),
      level: "4",
      posinset: String(index + 1),
      setsize: String(REACHED_AGENTS.length),
    })),
    // `2 of 2` is the assertion: a run-based implementation says `1 of 1` here.
    {
      path: globalPath(".claude/skills/"),
      level: "3",
      posinset: "2",
      setsize: "2",
    },
    {
      path: globalPath(`.claude/skills/${REACT_ID}/`),
      level: "4",
      posinset: "1",
      setsize: "1",
    },
    { path: PROJECT, level: "1", posinset: "2", setsize: "2" },
    {
      path: projectPath(SOURCE_DIR),
      level: "2",
      posinset: "1",
      setsize: "1",
    },
    { path: PROJECT_CONFIG_PATH, level: "3", posinset: "1", setsize: "2" },
    {
      path: projectPath(`${SOURCE_DIR}${CONFIG_TYPES_TS}`),
      level: "3",
      posinset: "2",
      setsize: "2",
    },
  ]

  test("every row states its level and its place among its own siblings", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).flipInstall()
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog

    // Subject guard: the tree whose siblings are non-consecutive.
    expect(await preview.rowNames()).toStrictEqual(EJECTED_TREE)

    expect(await preview.rowPositions()).toStrictEqual(EJECTED_POSITIONS)
  })

  /** Computed per root, both would read `1 of 1`. */
  test("the two roots are siblings of each other", async ({ configure }) => {
    await configure.subAgents.setScope(DEVELOPER, "project")
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    expect(await preview.rowNames()).toStrictEqual(SPLIT_TREE)

    const roots = (await preview.rowPositions()).filter(
      (row) => row.level === "1"
    )

    expect(roots).toStrictEqual([
      { path: GLOBAL, level: "1", posinset: "1", setsize: "2" },
      { path: PROJECT, level: "1", posinset: "2", setsize: "2" },
    ])
  })

  test("the tree is one tab stop and the arrows move within it", async ({
    configure,
    page,
  }) => {
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog

    // Either way out of the selected row leaves the tree, and back in lands on
    // it again.
    for (const key of ["Tab", "Shift+Tab"]) {
      await preview.row(PROJECT_CONFIG_PATH).focus()
      await page.keyboard.press(key)
      expect(await preview.focusedRowPath()).toBeNull()
    }
    await page.keyboard.press("Tab")
    expect(await preview.focusedRowPath()).toStrictEqual(PROJECT_CONFIG_PATH)

    await preview.row(GLOBAL_CONFIG_PATH).focus()

    await page.keyboard.press("ArrowDown")
    expect(await preview.focusedRowPath()).toStrictEqual(
      globalPath(`${SOURCE_DIR}${CONFIG_TYPES_TS}`)
    )

    await page.keyboard.press("ArrowUp")
    expect(await preview.focusedRowPath()).toStrictEqual(GLOBAL_CONFIG_PATH)
  })

  /** Clamped, not wrapped: the index is `-1` when focus is off the tree. */
  test("the arrows stop at the first and last rows", async ({
    configure,
    page,
  }) => {
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog

    // Subject guard: without it, focus never moving would satisfy the clamps.
    const LAST_ROW = projectPath(`${SOURCE_DIR}${CONFIG_TYPES_TS}`)

    expect(
      [(await preview.rowPaths()).at(0), (await preview.rowPaths()).at(-1)],
      "the ends of the tree are not the rows these presses are aimed at"
    ).toStrictEqual([GLOBAL, LAST_ROW])

    await preview.row(GLOBAL).focus()
    await page.keyboard.press("ArrowUp")
    expect(await preview.focusedRowPath()).toStrictEqual(GLOBAL)

    await preview.row(LAST_ROW).focus()
    await page.keyboard.press("ArrowDown")
    expect(await preview.focusedRowPath()).toStrictEqual(LAST_ROW)
  })
})

test.describe("the header and the selection", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.previewButton.click()
  })

  /** Exact, not a substring: a filename alone would still contain it. */
  test("the subtitle is the selected path and its marker", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await preview.select(GLOBAL_CONFIG_PATH)
    await expect(preview.subtitle).toHaveText(`${GLOBAL_CONFIG_PATH} · ${NEW}`)

    await preview.select(GLOBAL_DEVELOPER_PATH)
    await expect(preview.subtitle).toHaveText(
      `${GLOBAL_DEVELOPER_PATH} · ${NEW}`
    )
  })

  test("a plugin node's marker is `reference only`", async ({ configure }) => {
    const preview = configure.outputPreviewDialog

    await preview.select(REACT_ID)

    await expect(preview.subtitle).toHaveText(`${REACT_ID} · ${REFERENCE_ONLY}`)
  })

  /**
   * A relocated selection resolves to the project root's `config.ts`, never a
   * blank pane.
   */
  test("a selection that no longer exists falls back rather than blanking", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await preview.select(GLOBAL_DEVELOPER_PATH)
    await expect(preview.subtitle).toHaveText(
      `${GLOBAL_DEVELOPER_PATH} · ${NEW}`
    )
    await preview.close()

    await configure.subAgents.setScope(DEVELOPER, "project")
    await configure.roster.previewButton.click()

    await expect(preview.subtitle).toHaveText(`${PROJECT_CONFIG_PATH} · ${NEW}`)
  })

  test("a directory row shows an empty pane", async ({ configure }) => {
    const preview = configure.outputPreviewDialog

    await preview.select(globalPath(".claude/agents/"))

    expect(await preview.lines()).toStrictEqual([])
  })
})

test.describe("the content pane", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.previewButton.click()
  })

  /**
   * An ejected catalogue skill is copied at install time, so its bodies are
   * unknown and must not be invented.
   */
  test("invents no file bodies for an ejected catalogue skill", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog
    await preview.close()

    await configure.skillIn(web, CATEGORY, REACT).flipInstall()
    await configure.roster.previewButton.click()

    const directory = globalPath(`.claude/skills/${REACT_ID}/`)
    await preview.select(directory)

    expect(await preview.rowNames()).toStrictEqual(EJECTED_TREE)
    await expect(preview.contentPane).toContainText(REACT_ID)
    await expect(preview.contentPane).not.toContainText("# React")
  })

  /**
   * Asserted on the box: the split is `packages/ui`'s `DialogPane`, not a
   * className here.
   */
  test("the tree column is fixed and the content column takes the rest", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog
    const tree = await preview.treePane.boundingBox()
    const content = await preview.contentPane.boundingBox()

    expect(tree?.width).toBe(TREE_PANE_RENDERED_PX)
    expect(content?.width).toBeGreaterThan(TREE_PANE_RENDERED_PX)
  })
})

// Scroll reads go through `expect.poll`, and only "moved" is asserted: the
// browser's scroll anchoring makes exact offsets unreliable.
const scrollOf = (pane: Locator) =>
  pane.evaluate((node) => ({
    top: node.scrollTop,
    room: node.scrollHeight - node.clientHeight,
  }))

const containing = (text: string) =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

/**
 * A file longer than its pane is read by scrolling, so a keyboard user needs
 * the pane itself: its rows are text, with nothing in them to focus. It sits
 * between the tree and Close, and says which file it holds. Chromium already
 * makes such a scroller a tab stop on its own, so the order and the scrolling
 * hold before the app marks it; the name, and axe in a11y.spec.ts, do not.
 */
test.describe("the content pane, from the keyboard", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    await preview.select(GLOBAL_DEVELOPER_PATH)
    await expect(preview.subtitle).toHaveText(
      `${GLOBAL_DEVELOPER_PATH} · ${NEW}`
    )

    // Subject guard: a sub-agent's markdown outgrows the pane, or nothing here
    // has anything to scroll.
    await expect
      .poll(async () => (await scrollOf(preview.contentPane)).room)
      .toBeGreaterThan(0)
  })

  test("Tab from the tree's selected row lands on it", async ({
    configure,
    page,
  }) => {
    const preview = configure.outputPreviewDialog
    await preview.row(GLOBAL_DEVELOPER_PATH).focus()

    await page.keyboard.press("Tab")

    await expect(preview.contentPane).toBeFocused()
  })

  test("Shift+Tab from Close lands on it", async ({ configure, page }) => {
    const preview = configure.outputPreviewDialog
    await preview.closeButton.focus()

    await page.keyboard.press("Shift+Tab")

    await expect(preview.contentPane).toBeFocused()
  })

  test("its name is the file it shows, and follows the selection", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await expect(preview.contentPane).toHaveAccessibleName(
      containing(GLOBAL_DEVELOPER_PATH)
    )

    await preview.select(GLOBAL_CONFIG_PATH)
    await expect(preview.subtitle).toHaveText(`${GLOBAL_CONFIG_PATH} · ${NEW}`)

    await expect(preview.contentPane).toHaveAccessibleName(
      containing(GLOBAL_CONFIG_PATH)
    )
  })

  test("the arrow keys and End scroll it once Tab has reached it", async ({
    configure,
    page,
  }) => {
    const preview = configure.outputPreviewDialog
    await preview.row(GLOBAL_DEVELOPER_PATH).focus()
    await page.keyboard.press("Tab")

    await page.keyboard.press("ArrowDown")
    await expect
      .poll(async () => (await scrollOf(preview.contentPane)).top)
      .toBeGreaterThan(0)
    const stepped = (await scrollOf(preview.contentPane)).top

    await page.keyboard.press("End")
    await expect
      .poll(async () => (await scrollOf(preview.contentPane)).top)
      .toBeGreaterThan(stepped)
  })

  /** The tree's arrows are its own: scrolling the bytes picks no other file. */
  test("scrolling it from the keyboard leaves the selection where it was", async ({
    configure,
    page,
  }) => {
    const preview = configure.outputPreviewDialog
    await preview.row(GLOBAL_DEVELOPER_PATH).focus()
    await page.keyboard.press("Tab")
    await expect(preview.contentPane).toBeFocused()

    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowUp")

    await expect(preview.subtitle).toHaveText(
      `${GLOBAL_DEVELOPER_PATH} · ${NEW}`
    )
    await expect(preview.row(GLOBAL_DEVELOPER_PATH)).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  // Controls: what the pane already does, which reaching it must not change.
  test("the wheel still scrolls it", async ({ configure, page }) => {
    const preview = configure.outputPreviewDialog
    await preview.contentPane.hover()

    await page.mouse.wheel(0, 400)

    await expect
      .poll(async () => (await scrollOf(preview.contentPane)).top)
      .toBeGreaterThan(0)
  })

  test("Tab from the tree leaves a scrolled pane where it was", async ({
    configure,
    page,
  }) => {
    const preview = configure.outputPreviewDialog
    await preview.contentPane.hover()
    await page.mouse.wheel(0, 400)
    await expect
      .poll(async () => (await scrollOf(preview.contentPane)).top)
      .toBeGreaterThan(0)

    await preview.row(GLOBAL_DEVELOPER_PATH).focus()
    await page.keyboard.press("Tab")

    expect((await scrollOf(preview.contentPane)).top).toBeGreaterThan(0)
  })
})

test.describe("fullscreen and the splitter", () => {
  const MIN_TREE_RENDERED_PX = (180 * ROOT_FONT_SCALE_PERCENT) / 100
  const MAX_TREE_RENDERED_PX = (560 * ROOT_FONT_SCALE_PERCENT) / 100

  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.previewButton.click()
  })

  test("the header carries a maximise control that names the action", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await expect(preview.fullscreenButton).toHaveAccessibleName("Fullscreen")

    await preview.fullscreenButton.click()

    await expect(preview.fullscreenButton).toHaveAccessibleName(
      "Exit fullscreen"
    )
  })

  test("fills the viewport but keeps its footer on screen", async ({
    configure,
    page,
  }) => {
    const preview = configure.outputPreviewDialog
    await preview.fullscreenButton.click()

    const sheet = (await preview.root.boundingBox())!
    const viewport = page.viewportSize()!

    expect(sheet.width).toBeGreaterThan(viewport.width * 0.9)
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(viewport.height)
    await expect(preview.closeButton).toBeVisible()
  })

  test("double-clicking the header does the same", async ({ configure }) => {
    const preview = configure.outputPreviewDialog

    await preview.header.dblclick()

    await expect(preview.fullscreenButton).toHaveAccessibleName(
      "Exit fullscreen"
    )
  })

  test("esc steps out of fullscreen before it closes", async ({
    configure,
    page,
  }) => {
    const preview = configure.outputPreviewDialog
    await preview.fullscreenButton.click()

    await page.keyboard.press("Escape")

    await expect(preview.root).toBeVisible()
    await expect(preview.fullscreenButton).toHaveAccessibleName("Fullscreen")

    await page.keyboard.press("Escape")

    await expect(preview.root).toBeHidden()
  })

  test("dragging the splitter widens the tree and narrows the code", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog
    const before = (await preview.contentPane.boundingBox())!

    await preview.dragSplitter(80)

    const tree = (await preview.treePane.boundingBox())!
    const after = (await preview.contentPane.boundingBox())!

    expect(tree.width).toBeGreaterThan(TREE_PANE_RENDERED_PX)
    expect(after.width).toBeLessThan(before.width)
  })

  test("refuses to drag either pane out of existence", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await preview.dragSplitter(-600)
    expect((await preview.treePane.boundingBox())!.width).toBeCloseTo(
      MIN_TREE_RENDERED_PX,
      0
    )

    await preview.dragSplitter(2000)
    expect((await preview.treePane.boundingBox())!.width).toBeCloseTo(
      MAX_TREE_RENDERED_PX,
      0
    )
  })

  test("keeps the width and the fullscreen state between opens", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog
    await preview.fullscreenButton.click()
    await preview.dragSplitter(60)
    const widened = (await preview.treePane.boundingBox())!.width

    await preview.closeButton.click()
    await expect(preview.root).toBeHidden()
    await configure.roster.previewButton.click()

    await expect(preview.fullscreenButton).toHaveAccessibleName(
      "Exit fullscreen"
    )
    expect((await preview.treePane.boundingBox())!.width).toBeCloseTo(
      widened,
      0
    )
  })
})

test.describe("the footer", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.previewButton.click()
  })

  test("states what it is a preview of", async ({ configure }) => {
    await expect(configure.outputPreviewDialog.footerNote).toContainText(
      CLEAN_MACHINE_CLAIM
    )
    await expect(configure.outputPreviewDialog.footerNote).toContainText(
      PROJECT_DIRECTORY_PREMISE
    )
  })

  test("names the version the corpus was vendored at", async ({
    configure,
  }) => {
    await expect(configure.outputPreviewDialog.footerNote).toContainText(
      CORPUS_CLI_VERSION
    )
  })

  /**
   * Plugin references and copied catalogue directories are not counted: the
   * preview does not write them.
   */
  test("counts the files an install writes and nothing else", async ({
    configure,
  }) => {
    const CONFIG_FILES_PER_ROOT = 2
    const ROOTS_AN_INSTALL_WRITES = 2
    const written =
      CONFIG_FILES_PER_ROOT * ROOTS_AN_INSTALL_WRITES + REACHED_AGENTS.length

    await expect(configure.outputPreviewDialog.footerNote).toContainText(
      `${written} files`
    )
  })

  test("says how many skills are ejected, and it moves when one is", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await expect(preview.footerNote).toContainText("0 ejected")
    await preview.close()

    await configure.skillIn(web, CATEGORY, REACT).flipInstall()
    await configure.roster.previewButton.click()

    await expect(preview.footerNote).toContainText("1 ejected")
  })

  test("offers Close and nothing that writes", async ({ configure, page }) => {
    const preview = configure.outputPreviewDialog

    await expect(preview.closeButton).toBeVisible()

    await page.keyboard.press("Escape")

    await expect(preview.root).toBeHidden()
  })
})

test.describe("the empty configuration", () => {
  test("leaves the entry point disabled while nothing is selected", async ({
    configure,
  }) => {
    await expect(configure.roster.previewButton).toBeDisabled()
  })
})

test.describe("a stranger's bytes in the preview", () => {
  const SKILL_NAME = SKILL_INDEX.skills[0]!.name
  const CATEGORY_OPTION = `${web.toLowerCase()} · ${CATEGORY.toLowerCase()}`
  const MANIFEST = "SKILL.md"
  const MANIFEST_TEXT = EXTERNAL_SKILL.files[MANIFEST]

  // Written out: the id is what the payload carries and the CLI installs under.
  const ADDED_SKILL_ID = "external-web-framework-brainstorming"
  const ADDED_SKILL_PATH = `${GLOBAL}.claude/skills/${ADDED_SKILL_ID}/${MANIFEST}`

  // The one manifest line the install rewrites (`withInstalledName`).
  const UPSTREAM_NAME_LINE = "name: brainstorming"
  const INSTALLED_MANIFEST_TEXT = MANIFEST_TEXT.replace(
    UPSTREAM_NAME_LINE,
    `name: ${ADDED_SKILL_ID}`
  )

  test.beforeEach(async ({ page, configure }) => {
    stubSkillIndex(page)
    stubSkillContents(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()
    await configure.skillIn(web, CATEGORY, SKILL_NAME).toggle()
    await configure.roster.previewButton.click()
  })

  test("lists an added skill's real files under its directory", async ({
    configure,
  }) => {
    await expect(
      configure.outputPreviewDialog.row(ADDED_SKILL_PATH)
    ).toBeVisible()
  })

  /**
   * Nothing ran (the sentinel is absent) and nothing was lost (the bytes are
   * the file's own). A sanitiser fails the second; a markdown renderer fails
   * both.
   */
  test("shows a hostile file verbatim and runs none of it", async ({
    configure,
    page,
  }) => {
    const preview = configure.outputPreviewDialog

    // The fixture really carries the markup, so this cannot pass vacuously.
    expect(MANIFEST_TEXT).toContain("<script>")
    expect(MANIFEST_TEXT).toContain("onerror=")
    expect(MANIFEST_TEXT).toContain(UPSTREAM_NAME_LINE)

    await preview.select(ADDED_SKILL_PATH)

    expect(await preview.lines()).toStrictEqual(
      INSTALLED_MANIFEST_TEXT.split("\n")
    )
    expect(await page.evaluate((name) => name in window, XSS_SENTINEL)).toBe(
      false
    )
  })

  test("does not run a grammar over a stranger's file", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog
    const tokens = () =>
      preview.contentPane.evaluate(
        (node) => node.querySelectorAll("[data-slot='preview-token']").length
      )

    await preview.select(ADDED_SKILL_PATH)
    await expect(preview.subtitle).toHaveText(`${ADDED_SKILL_PATH} · ${NEW}`)
    const strangerTokens = await tokens()

    // Polled: the grammar chunk colours a file a beat after its lines appear.
    await preview.select(GLOBAL_CONFIG_PATH)
    await expect(preview.subtitle).toHaveText(`${GLOBAL_CONFIG_PATH} · ${NEW}`)
    await expect.poll(tokens).toBeGreaterThan(0)

    expect(strangerTokens).toBe(0)
  })
})

const activationSentence = (lines: readonly string[], skillId: string) => {
  const heading = lines.indexOf(`### ${skillId}`)
  return heading === -1 ? undefined : lines[heading + 1]
}

const DESCRIPTION_PREFIX = "- Description: "

const ASSIGNMENT_DOMAIN = "Web"
const ASSIGNMENT_ROLE = "dev"

/**
 * Picking preloads, so the cell goes preloaded → unassigned → lazy; only lazy
 * skills get a sentence.
 */
const pickReactOnDemand = async (configure: ConfigurePage) => {
  const react = configure.skillIn(web, CATEGORY, REACT)

  await react.toggle()
  await react.openOptions()
  await react.options.cycleAssignment(ASSIGNMENT_DOMAIN, ASSIGNMENT_ROLE)
  await react.options.cycleAssignment(ASSIGNMENT_DOMAIN, ASSIGNMENT_ROLE)
  await configure.roster.heading.click()
}

/**
 * An install's activation table shows each skill's SKILL.md sentence; the
 * vendored catalogue holds only the wizard label, which the preview must not
 * draw.
 */
test.describe("the activation table on the public catalogue", () => {
  test.beforeEach(async ({ configure }) => {
    await pickReactOnDemand(configure)
    await configure.roster.previewButton.click()
  })

  test("describes a skill with its SKILL.md sentence rather than the wizard's label", async ({
    configure,
  }) => {
    const label = MATRIX.skills[REACT_ID]?.description
    const preview = configure.outputPreviewDialog

    expect(
      label,
      "the vendored catalogue no longer carries the skill this reads"
    ).toBeDefined()

    await preview.select(GLOBAL_DEVELOPER_PATH)
    await expect(preview.subtitle).toHaveText(
      `${GLOBAL_DEVELOPER_PATH} · ${NEW}`
    )
    const described = activationSentence(await preview.lines(), REACT_ID)

    expect(
      described,
      "the compiled sub-agent draws no activation row for the skill"
    ).toMatch(new RegExp(`^${DESCRIPTION_PREFIX}\\S`))
    expect(described).not.toBe(`${DESCRIPTION_PREFIX}${label}`)

    const { ACTIVATION_DESCRIPTIONS } =
      await import("@workspace/matrix/activation-descriptions")
    const sentence = ACTIVATION_DESCRIPTIONS[REACT_ID]

    expect(
      sentence,
      "the vendored table holds no SKILL.md sentence for the skill this reads"
    ).toBeDefined()
    expect(described).toBe(`${DESCRIPTION_PREFIX}${sentence}`)
  })
})

/**
 * The install records the default marketplace's ref and, for plugin skills, its
 * manifest name.
 */
test.describe("the marketplace on the public catalogue", () => {
  const DEFAULT_MARKETPLACE_LINE = "  marketplace: 'github:agents-inc/skills',"
  const DEFAULT_MARKETPLACE_NAME_LINE = "  marketplaceName: 'agents-inc',"

  test.beforeEach(async ({ configure }) => {
    await pickReactOnDemand(configure)
    await configure.roster.previewButton.click()
  })

  for (const path of [GLOBAL_CONFIG_PATH, PROJECT_CONFIG_PATH]) {
    test(`${path} records the marketplace an install reads when none is named`, async ({
      configure,
    }) => {
      const preview = configure.outputPreviewDialog

      await preview.select(path)
      await expect(preview.subtitle).toHaveText(`${path} · ${NEW}`)

      expect(await preview.lines()).toContain(DEFAULT_MARKETPLACE_LINE)
    })

    test(`${path} names that marketplace as its manifest does, on the line after its ref`, async ({
      configure,
    }) => {
      const preview = configure.outputPreviewDialog

      await preview.select(path)
      await expect(preview.subtitle).toHaveText(`${path} · ${NEW}`)

      const lines = await preview.lines()
      const ref = lines.indexOf(DEFAULT_MARKETPLACE_LINE)

      expect(
        ref,
        "the config.ts records no marketplace, so the line after it has no subject"
      ).not.toBe(-1)
      expect(lines[ref + 1]).toBe(DEFAULT_MARKETPLACE_NAME_LINE)
    })
  }
})

/**
 * Loading the marketplace on screen again keeps the selection, yet the preview
 * must redraw for what its catalogue now says. Another marketplace would start
 * a new configuration instead. A fork, so its ref differs from the public one.
 */
test.describe("the preview after a marketplace loads again under the same selection", () => {
  const LOADED_REF = "public-fork/skills"
  // Mirrored rather than built by the app's formatter.
  const LOADED_CANONICAL_REF = "github:public-fork/skills"
  const LOADED_MARKETPLACE_LINE = `  marketplace: '${LOADED_CANONICAL_REF}',`
  const NAME_ONLY_THE_INSTALL_READS =
    "  marketplaceName: '<computed at install time>',"
  const LOADED_SENTENCE =
    "React, as this marketplace's own SKILL.md describes it. Load when the loaded catalogue is the one on screen."

  const LOADED_CATALOG = matrixSchema.parse({
    ...MATRIX,
    version: "9.9.9-loaded",
    generatedAt: "build",
    skills: {
      ...MATRIX.skills,
      [REACT_ID]: {
        ...MATRIX.skills[REACT_ID],
        activationDescription: LOADED_SENTENCE,
      },
    },
  })

  // The fork as it first published: the public catalogue's own words.
  const FIRST_CATALOG = matrixSchema.parse({
    ...MATRIX,
    version: "9.9.9-first",
    generatedAt: "build",
  })

  const loadFork = async (configure: ConfigurePage) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(LOADED_REF)
    await configure.marketplaceDialog.load()
    await expect(configure.marketplaceDialog.root).toBeHidden()
  }

  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceCatalogOf(page, FIRST_CATALOG)
    const preview = configure.outputPreviewDialog

    await loadFork(configure)
    await pickReactOnDemand(configure)
    await configure.roster.previewButton.click()
    await expect(preview.row(GLOBAL_CONFIG_PATH)).toBeVisible()
    await preview.close()

    // Added last, so it answers first: the fork has published since.
    stubMarketplaceCatalogOf(page, LOADED_CATALOG)
    await loadFork(configure)

    // Subject guard: only the catalogue changed.
    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await configure.roster.previewButton.click()
  })

  test("its config.ts records the marketplace just loaded", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await preview.select(GLOBAL_CONFIG_PATH)
    await expect(preview.subtitle).toHaveText(`${GLOBAL_CONFIG_PATH} · ${NEW}`)

    expect(await preview.lines()).toContain(LOADED_MARKETPLACE_LINE)
  })

  for (const path of [GLOBAL_CONFIG_PATH, PROJECT_CONFIG_PATH]) {
    test(`${path} names the marketplace just loaded on the line after its ref, as a value only the install reads`, async ({
      configure,
    }) => {
      const preview = configure.outputPreviewDialog

      await preview.select(path)
      await expect(preview.subtitle).toHaveText(`${path} · ${NEW}`)

      const lines = await preview.lines()
      const ref = lines.indexOf(LOADED_MARKETPLACE_LINE)

      expect(
        ref,
        "the config.ts records no loaded marketplace, so the line after it has no subject"
      ).not.toBe(-1)
      expect(lines[ref + 1]).toBe(NAME_ONLY_THE_INSTALL_READS)
    })
  }

  test("its sub-agents describe the picked skill in the loaded catalogue's words", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog

    await preview.select(GLOBAL_DEVELOPER_PATH)
    await expect(preview.subtitle).toHaveText(
      `${GLOBAL_DEVELOPER_PATH} · ${NEW}`
    )

    expect(activationSentence(await preview.lines(), REACT_ID)).toBe(
      `${DESCRIPTION_PREFIX}${LOADED_SENTENCE}`
    )
  })
})
