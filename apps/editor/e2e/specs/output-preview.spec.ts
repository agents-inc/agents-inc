import {
  EXTERNAL_SKILL,
  SKILL_INDEX,
  XSS_SENTINEL,
  seedPayload,
} from "@workspace/api-mocks/fixtures"
import { CORPUS_CLI_VERSION } from "@workspace/compile/corpus"
import { MATRIX, matrixSchema } from "@workspace/matrix"

import { buildOutputPreview } from "@/features/configure/lib/output-preview"
import { externalSkillId } from "@/stores/catalog-store"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import { stubMarketplaceCatalogOf } from "../support/marketplace"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"

import type { ConfigurePage } from "../pages/configure-page"

/**
 * A PREVIEW IS WORTH BUILDING ONLY IF IT DRAWS THE BYTES AN INSTALL WRITES.
 * The design file states the constraint the dialog exists to satisfy — "the
 * moment someone diffs it against reality and it is off, they stop trusting the
 * configurator" — and the prototype it replaces was measurably wrong about
 * thirteen of its own lines.
 *
 * So the assertions here divide cleanly, and the division is deliberate:
 *
 *   · the BYTES are held against `@workspace/compile`'s own output in
 *     `src/features/configure/lib/output-preview.test.ts`, where the renderer
 *     can be called directly;
 *   · what is held here is everything a browser is needed for — that the rows
 *     move when the configuration does, that the pane renders the model's text
 *     without normalising it, that a stranger's bytes are not interpreted, and
 *     that the footer says what the preview cannot know;
 *   · and the bytes against a real install of the same id are
 *     `preview-matches-install.spec.ts`'s, which runs the CLI.
 *
 * COPY IS MIRRORED, NEVER IMPORTED. Every string below that the product also
 * renders is written out here, for the reason `e2e/pages` writes its own
 * copies: an assertion that imports the constant it is checking cannot fail,
 * because both halves move together. `CORPUS_CLI_VERSION` is one exception
 * that proves the rule — the claim is that the footer names THE CORPUS's
 * version, not that it names a particular release — and the vendored
 * catalogue is the other: a skill's wizard label is read off `MATRIX` because
 * the claim is that the preview does NOT draw it, whatever it says, and its
 * SKILL.md sentence off `ACTIVATION_DESCRIPTIONS` because the claim is that
 * the preview draws the one the table holds for that skill, whatever it says.
 */

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY
const REACT_ID = "web-framework-react"

// Every sub-agent the shared resolver targets for a web skill: the domain's
// three role flavours plus the two cross-domain roles. Named rather than
// counted — a count cannot see a swap, and this roster IS the tree's middle.
const REACHED_AGENTS = [
  "pm",
  "reviewer",
  "web-developer",
  "web-researcher",
  "web-tester",
] as const

const DEVELOPER = "web-developer"

// A root is a BASE directory with two children, which is C5's correction to
// both the design and the programme README: the config pair lives in the source
// folder and everything else in `.claude/`.
const GLOBAL = "~/"
const PROJECT = "./"

// The source folder, mirrored rather than imported — the rule stated above, and
// the reason `apps/editor/eslint.config.js` bans this name everywhere but a
// spec. It is `.agents-inc/<provider>/` and the editor previews Claude.
//
// ONE ROW CARRIES BOTH SEGMENTS (D10) and that is what this constant asserts by
// its shape: drawn nested, the config pair would sit a level deeper and every
// entry in the level/posinset table below would move. At one row the pair keeps
// level 3 and this file's expectations stay string-only.
const SOURCE_DIR = ".agents-inc/claude/"

const CONFIG_TS = "config.ts"
const CONFIG_TYPES_TS = "config-types.ts"

// The design draws `config.d.ts`; the CLI emits `config-types.ts`. Pinned as
// an absence because an implementer reading the design file alone writes the
// other one, and a file named for a shape nobody emits is invisible to every
// assertion about the file that is emitted.
const DESIGN_FILE_THE_CLI_NEVER_WRITES = "config.d.ts"

// The tree's three state labels and no more. A root and a directory carry none.
const NEW = "new"
const PLUGIN = "plugin"
const EJECT = "eject"

// The header's marker is binary and its vocabulary is disjoint from the tree's:
// `reference only` appears only in the subtitle, `new`/`plugin`/`eject` only on
// a row.
const REFERENCE_ONLY = "reference only"

// B3.5 rule 4 words this as a claim rather than a hedge, and the exact sentence
// is the whole of what stands between an honest preview and a wrong one: the
// preview cannot see disk, cannot run the merge an install runs, and cannot
// populate the global config's `projects` array.
const CLEAN_MACHINE_CLAIM =
  "what installing this configuration on a machine with no existing agents-inc installation writes"

// B3.5 rule 1: the footer states the premise both roots are drawn under. An
// install run from `$HOME` writes one standalone pair instead of two, so the
// tree is true only of an install run from a project directory — where the
// Install dialog sends the visitor first.
const PROJECT_DIRECTORY_PREMISE = "when it is run from a project directory"

// The project root a configuration holding nothing project-scoped still owes:
// its config pair and nothing else. `init --from` run from a project directory
// — where the Install dialog sends the visitor first — writes the project's
// pair whatever the project holds (`writeProjectConfig` passes
// `projectInstallationExists: isProjectContext`), and nothing else lands there
// for a configuration whose sub-agents and skills are all global.
const PROJECT_PAIR_TREE = [PROJECT, SOURCE_DIR, CONFIG_TS, CONFIG_TYPES_TS]

// The tree, as a list of row names, for a configuration holding one global
// plugin skill. Written out rather than counted, because a count cannot tell a
// swapped row from an unchanged one — and every correction in §0 shows up in
// this list: the source folder beside `.claude/`, `config-types.ts` rather than
// `config.d.ts`, and a plugin skill under a group that is deliberately not a
// path. The project's pair closes it, because the install writes that too.
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

// The same configuration with the developer written into the project instead.
// The `.md` moves under the second root and takes `.claude/agents/` with it —
// this list is the dialog's entire argument, and it is why there is no tab bar
// and no breadcrumb: scope separates itself.
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

// And the same configuration again with the skill ejected: the plugin group is
// gone, a real `skills/` directory has appeared, and the skill's row is a
// directory rather than a reference.
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

// The tree column, which is the INVERSE of `DialogPane`'s default — the
// package's left pane is the flexible one. B3.4 sends the change into
// `packages/ui` rather than overriding it here, so the number is asserted on
// the rendered box, and a rendered box is not a design pixel.
//
// The column is `w-[15.625rem]`: 250 design px divided by a 16px root. But
// `globals.css` sets `font-size: 110%` on `:root` and calls it THE SIZING KNOB,
// naming "column widths" among the things its one percentage scales — so every
// `rem` dimension in the app renders 10% larger than the number it was designed
// at, and `boundingBox()` reports CSS pixels. 275 is the correct box for a
// 250px design.
//
// BOTH HALVES ARE NAMED, because either alone misleads the next reader. A bare
// 275 hides which number the design owns and reads as an arbitrary measurement
// somebody copied off a failing run. And "fixing" the product to `w-[250px]`
// would turn this green while taking the column out of proportion with the row
// height, font, padding and indent inside it, all of which still scale — the
// silent breakage the knob's docblock exists to prevent.
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

  /**
   * The prototype's entry point is a `div` with an `onClick`: no keyboard
   * affordance, no focus-visible, no pressed state. It is a real button here,
   * and its place in the tab order is part of the design's stated reason for
   * where it sits — "above the Install button reads as a step before it; below
   * reads as an aside. I prefer above — you preview, then you install."
   *
   * So the Tab is from Share rather than a bare `.focus()`: what is being
   * asserted is that the control is reachable AT THAT POINT in the order, which
   * focusing it directly would say nothing about.
   */
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

  /**
   * One word, because the cell is one third of a 300px panel now. The claim the
   * old label carried — "generated", which says the files do not exist yet —
   * moves to the `title`, which is the design's own home for it.
   */
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

  /**
   * The four corrections the programme README ruled on are satisfied for free
   * once the renderer is shared — they are properties of `generateConfigSource`
   * and `assembleConfigTypesSource` rather than rules a second implementation
   * has to remember. This pins the one of them that is a FILENAME, because a
   * second implementation is exactly what an implementer reading the design
   * file alone would write.
   */
  test("names the file the CLI emits, not the one the design drew", async ({
    configure,
  }) => {
    await configure.roster.previewButton.click()

    const names = await configure.outputPreviewDialog.rowNames()

    expect(names).toContain(CONFIG_TYPES_TS)
    expect(names).not.toContain(DESIGN_FILE_THE_CLI_NEVER_WRITES)
  })

  /**
   * Criterion 4, and the dialog's whole argument: flipping an agent's scope
   * word in the roster visibly moves its `.md` from one root to the other, with
   * no tab bar and no breadcrumb doing any of the work. Both roots are drawn
   * either way, each with its config pair, because an install from a project
   * directory writes both pairs whatever the configuration holds.
   */
  test("flipping an agent's scope moves its markdown between the roots", async ({
    configure,
  }) => {
    await configure.roster.previewButton.click()
    await expect(
      configure.outputPreviewDialog.row(GLOBAL_DEVELOPER_PATH)
    ).toBeVisible()
    await configure.outputPreviewDialog.close()

    await configure.roster.setScope(DEVELOPER, "project")
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    expect(await preview.rowNames()).toStrictEqual(SPLIT_TREE)
    await expect(
      preview.row(projectPath(`.claude/agents/${DEVELOPER}.md`))
    ).toBeVisible()
    await expect(preview.row(GLOBAL_DEVELOPER_PATH)).toHaveCount(0)
  })

  /**
   * Both roots carry the config pair, always. The source folder is the one
   * directory a root cannot be without, because the pair is the one thing an
   * install from a project directory writes under both roots whatever the
   * configuration holds.
   */
  test("every emitted root holds the config pair", async ({ configure }) => {
    await configure.roster.setScope(DEVELOPER, "project")
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

  /**
   * Criterion 5, and the design's strongest argument for the whole dialog: the
   * plugin/eject decision made visible. One lives under a path and the other
   * does not, so the difference is not a badge — it is where the row IS.
   */
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

  /**
   * Criterion 6, both halves, because either alone is satisfied by a bug:
   * "never labelled `new`" passes on a preview that omits plugin skills
   * entirely, and "no path under `skills/`" passes on one that labels them
   * `new` somewhere else.
   *
   * The rule behind it is `packages/cli/CLAUDE.md`'s by name — a user must be
   * able to copy any line out of a block describing the filesystem and `cd`
   * into it — and `installPluginSkills` shells out to `claude plugin install`,
   * so the destination is not this CLI's to name.
   */
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
   * A configuration written entirely into the project still writes the global
   * pair, and nothing else under `~/`: `ensureBlankPair` creates it before the
   * project write runs, and the project's `config-types.ts` imports from it.
   * B3.2's "absent, not empty" assumed an install writes nothing there; run
   * from a project directory it writes exactly these two files.
   *
   * The scope words are flipped on the agents FIRST, so the skill's own flip
   * never leaves a pair whose two scopes cannot meet — the error state is a
   * different subject and would only be noise here. The global root's rows are
   * asserted whole, so a root filled with the project's entries fails too.
   */
  test("draws the global pair for a configuration written wholly into the project", async ({
    configure,
  }) => {
    for (const agent of REACHED_AGENTS) {
      await configure.roster.setScope(agent, "project")
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
 * THE TREE A SCREEN READER IS HANDED, which is a different tree from the one on
 * screen and is not checked by any assertion above.
 *
 * The rows are DOM siblings — one flat run of buttons, with `padding-left`
 * doing all the nesting — so nothing structural says how many rows share a
 * level or which one this is. `aria-level`, `aria-posinset` and `aria-setsize`
 * are the whole of it, and being arithmetic rather than structure they are
 * exactly what an accessibility scan cannot judge: `axe` would pass a tree
 * whose every row claimed to be the first of one.
 *
 * The values are held against the EJECTED configuration on purpose. `agents/`
 * and `skills/` are siblings with five `.md` rows sitting between them, which
 * is the case the component's own docblock names as the one a naive
 * implementation gets wrong — group consecutive runs instead of tracking the
 * nearest row a level shallower and each becomes the only member of its own
 * set. Against the plugin tree, where no two same-level directories are
 * separated, both implementations agree and the assertion would pass for the
 * wrong reason.
 */
test.describe("the tree's shape, as a screen reader reads it", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
  })

  // One entry per row of EJECTED_TREE, in emission order. Attribute values are
  // strings because that is what a row carries and what is read back; a number
  // here would be this file's opinion of the attribute rather than the
  // attribute. Written out rather than derived from the tree above — a
  // derivation would be a second copy of `siblingPositions`, which would then
  // agree with the first about whatever it got wrong.
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
    // The first of the two non-consecutive siblings.
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
    // The second, five rows later. `2 of 2` is the whole assertion: a run-based
    // implementation says `1 of 1` here and `1 of 1` above.
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
    // The project root the install writes its pair under, the global root's
    // sibling: one directory, holding the two config files.
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

    // The subject guard. `EJECTED_POSITIONS` is keyed by path, so a tree that
    // drew different rows would fail the comparison below on the paths and
    // never reach the numbers — this says the tree under test is the one whose
    // siblings are non-consecutive, which is the only reason these values are
    // worth asserting.
    expect(await preview.rowNames()).toStrictEqual(EJECTED_TREE)

    expect(await preview.rowPositions()).toStrictEqual(EJECTED_POSITIONS)
  })

  /**
   * Two roots are ONE tree, not two. `siblingPositions` runs over the roots
   * flattened, so `~/` and `./` are each other's siblings and say so; computed
   * per root they would both read `1 of 1`, and a listener tabbing in would be
   * told there is one root when there are two.
   */
  test("the two roots are siblings of each other", async ({ configure }) => {
    await configure.roster.setScope(DEVELOPER, "project")
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

  /**
   * ROVING FOCUS, which is the other half of the same decision: a tree is one
   * tab stop, and the arrows move inside it. Without the arrows the tab stop is
   * a cage — the selected row is reachable and no other row is, so a keyboard
   * user can open the preview and read exactly one file.
   */
  test("the tree is one tab stop and the arrows move within it", async ({
    configure,
    page,
  }) => {
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog

    // The selected row is the tab stop; every other row is arrow-reachable
    // only. Asserted as the whole roster rather than as "the selected one is 0",
    // because a second row at 0 would put a stray stop in the dialog's tab
    // order and read the same from the selected row's side. Nothing has been
    // selected yet, so it is the default: the project root's `config.ts`, which
    // the install writes for this configuration too.
    expect(await preview.rowTabStops()).toStrictEqual(
      (await preview.rowPaths()).map((path) => ({
        path,
        tabIndex: path === PROJECT_CONFIG_PATH ? 0 : -1,
      }))
    )

    await preview.row(GLOBAL_CONFIG_PATH).focus()

    await page.keyboard.press("ArrowDown")
    expect(await preview.focusedRowPath()).toStrictEqual(
      globalPath(`${SOURCE_DIR}${CONFIG_TYPES_TS}`)
    )

    await page.keyboard.press("ArrowUp")
    expect(await preview.focusedRowPath()).toStrictEqual(GLOBAL_CONFIG_PATH)
  })

  /**
   * The ends clamp rather than wrap. Pinned because the arithmetic is a
   * `Math.min`/`Math.max` pair around an index that is `-1` when focus is not on
   * a row at all, and an off-by-one at either end either wraps the listener
   * back round or drops focus out of the tree entirely.
   */
  test("the arrows stop at the first and last rows", async ({
    configure,
    page,
  }) => {
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog

    // Subject guard: which rows the two ends ARE. Without it the two clamp
    // assertions below are satisfied by focus never having moved anywhere,
    // which is also what a broken tree looks like. The last row is the project
    // pair's second file, because the install writes the project's pair for
    // this configuration as well.
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

  /**
   * Criterion 7. The header changing as rows are clicked is the whole of the
   * no-breadcrumb decision and its stated cost, so the subtitle is asserted as
   * an exact string rather than as a substring — a subtitle that showed only
   * the filename would still contain it.
   */
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

  /**
   * The marker is binary and its two vocabularies do not overlap: `reference
   * only` appears here and is never a tree label, and `new`/`plugin`/`eject`
   * appear on a row and never here. A plugin node is the one place the
   * distinction is load-bearing — the row says `plugin` because that is how it
   * installs, and the header says `reference only` because that is what the
   * pane is showing.
   */
  test("a plugin node's marker is `reference only`", async ({ configure }) => {
    const preview = configure.outputPreviewDialog

    await preview.select(REACT_ID)

    await expect(preview.subtitle).toHaveText(`${REACT_ID} · ${REFERENCE_ONLY}`)
  })

  /**
   * Criterion 8, and B3.2 calls it "the one prototype behaviour most worth
   * copying verbatim". The tree is regenerated from live state on every render,
   * so flipping a scope relocates rows constantly — and a selection that
   * relocated must resolve to the project root's `config.ts` rather than
   * leaving the pane blank, which would read as an empty file.
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

    await configure.roster.setScope(DEVELOPER, "project")
    await configure.roster.previewButton.click()

    await expect(preview.subtitle).toHaveText(`${PROJECT_CONFIG_PATH} · ${NEW}`)
  })

  /** A root or a directory has no bytes of its own. The subtitle carries the path. */
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
   * THE ASSERTION THIS WHOLE PHASE EXISTS FOR, at the one level a browser can
   * make it: what is on screen is the model's text, character for character.
   *
   * The model's text is held against `@workspace/compile`'s own output in
   * `src/features/configure/lib/output-preview.test.ts`, so the chain closes —
   * screen to model to renderer. What is caught HERE and nowhere else is the
   * DOM half: a pane that trims, re-wraps, collapses runs of spaces, drops a
   * blank line or truncates a long file all leave the model correct and the
   * reader misinformed.
   *
   * `allTextContents` rather than an inner-text read, for the reason
   * `SkillContentsDialog.body` uses `textContent`: normalised whitespace would
   * be a different file.
   *
   * The guard above the comparison is not ceremony. The expectation is built
   * from a payload written out here, and a payload that stopped describing what
   * the screen is showing would fail the byte comparison with a diff nobody
   * could read; failing on the tree instead says which of the two is wrong.
   */
  test("renders the model's bytes without normalising them", async ({
    configure,
  }) => {
    const preview = configure.outputPreviewDialog
    const model = await buildOutputPreview(
      seedPayload({
        skills: {
          [REACT_ID]: {
            install: "plugin",
            scope: "global",
            assignments: Object.fromEntries(
              REACHED_AGENTS.map((agent) => [agent, "preloaded"] as const)
            ),
          },
        },
        agents: {},
      }),
      "claude"
    )

    expect(
      model.roots.flatMap((root) => root.nodes.map((node) => node.name)),
      "the payload written out in this spec no longer describes what the screen is showing"
    ).toStrictEqual(await preview.rowNames())

    const expected = model.roots[0]?.nodes.find(
      (node) => node.id === GLOBAL_CONFIG_PATH
    )?.body

    expect(
      expected,
      "the model drew no global config.ts to compare against"
    ).toBeTruthy()

    await preview.select(GLOBAL_CONFIG_PATH)

    expect(await preview.lines()).toStrictEqual(expected!.split("\n"))
  })

  /**
   * An ejected CATALOGUE skill's directory has no file bodies the preview can
   * honestly show: `copySkillsToLocalFlattened` is a directory copy, so the
   * bytes come from the marketplace at install time and the browser would have
   * to guess at both the file list and the contents. The design's `SKILL.md`
   * and `reference.md` templates are invented bytes and must not appear.
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

    // Its own children would be the invented half, so it has none.
    expect(await preview.rowNames()).toStrictEqual(EJECTED_TREE)
    // And what the pane says is where the directory comes from, not what is in
    // it — the source coordinate, and that the copy happens at install time.
    await expect(preview.contentPane).toContainText(REACT_ID)
    await expect(preview.contentPane).not.toContainText("# React")
  })

  /**
   * B3.4 resolves the split in `packages/ui` rather than overriding it from the
   * app, because `DialogPane`'s default is the inverse of what a tree wants —
   * `side="left"` is `flex-1` with a border and `side="right"` is a fixed
   * 12.25rem. A one-off className in a feature file would put a design-system
   * decision where nobody looking for it would find it, so the geometry is
   * asserted on the box.
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

// THE CODE PANE IS ~60 CHARACTERS AT 760px, which is narrow enough that
// generated `config.ts` lines wrap and stop looking like the file they claim to
// be. Fullscreen is the answer to that, and the splitter is the answer to the
// tension underneath it: long paths and long code lines competing for one
// width. Free window resizing was built and rejected — nobody wants 812px, they
// want MORE.
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

  // Sized against the sheet's own inset rather than the viewport: a width of
  // `calc(100vw - 48px)` pushed the footer, and with it the only Close button,
  // off the bottom of the screen.
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

  // ONE PRESS EACH, IN ORDER. A maximised sheet is a place you are in, so the
  // first escape is a reader asking to leave it rather than to leave the
  // preview — and the second still closes.
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

  // Clamped at both ends, so neither pane can be dragged out of existence.
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

  // Both survive a close, which is the design's own rule: the reader who
  // widened the tree to read a path did it for the file they are about to open
  // next as well as the one they just closed.
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

  /**
   * Criterion 12. The preview cannot see disk: it cannot merge into a global
   * config already installed, cannot reconcile a project split against one,
   * cannot mask a tombstone, and cannot populate the global config's
   * `projects` array. None of that is fixed by sharing the renderer, so it is
   * scoped out and SAID — as a claim rather than a hedge, which is the
   * difference between an honest preview and a wrong one. So is the directory
   * the install runs from, which decides whether there is a project root.
   */
  test("states what it is a preview of", async ({ configure }) => {
    await expect(configure.outputPreviewDialog.footerNote).toContainText(
      CLEAN_MACHINE_CLAIM
    )
    await expect(configure.outputPreviewDialog.footerNote).toContainText(
      PROJECT_DIRECTORY_PREMISE
    )
  })

  /**
   * §B3.5 rule 5. A visitor on an older CLI genuinely gets different bytes than
   * the vendored corpus produces, and surfacing that beats hiding it — the
   * version is stamped into the first body line of every compiled sub-agent in
   * the tree, so it is the most visible line in the dialog.
   */
  test("names the version the corpus was vendored at", async ({
    configure,
  }) => {
    await expect(configure.outputPreviewDialog.footerNote).toContainText(
      CORPUS_CLI_VERSION
    )
  })

  /**
   * The stat counts only files an install actually writes: the two config files
   * per root — and an install from a project directory writes both roots'
   * pairs, whatever the configuration holds — plus one per compiled sub-agent.
   * A plugin reference is not a file, and an ejected catalogue directory is
   * copied rather than generated — the preview does not know what is in it,
   * so it cannot count it.
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

  /**
   * No primary action, matching the Install dialog's rule that installing is a
   * CLI command. Escape and the focus trap come from Base UI's `Dialog` and are
   * not hand-rolled — the prototype had neither.
   */
  test("offers Close and nothing that writes", async ({ configure, page }) => {
    const preview = configure.outputPreviewDialog

    await expect(preview.closeButton).toBeVisible()

    await page.keyboard.press("Escape")

    await expect(preview.root).toBeHidden()
  })
})

test.describe("the empty configuration", () => {
  /**
   * Criterion 10 leaves the choice open — disabled, or a dialog with a stated
   * empty message — and asks for one to be picked and pinned. Disabled, because
   * that is what Save and Share do in the very same footer for the very same
   * reason: `skillCount === 0` means there is nothing to write, and a dialog
   * that opens onto nothing is a dialog that had nothing to say.
   */
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

  // An external skill's id is minted from the category it was PLACED in, not
  // from anything the index said — the index carries no category at all, which
  // is why the dropdown exists. `externalSkillId` is imported rather than
  // spelled out because it is the identity helper both surfaces agree through;
  // reimplementing it here is how two surfaces come to disagree about an id.
  const CHOSEN_CATEGORY_ID = "web-framework"
  const ADDED_SKILL_ID = externalSkillId(CHOSEN_CATEGORY_ID, SKILL_NAME)
  const ADDED_SKILL_PATH = `${GLOBAL}.claude/skills/${ADDED_SKILL_ID}/${MANIFEST}`

  // The one line of the stranger's manifest the install rewrites:
  // `withInstalledName` in the CLI's `seed/external-skills.ts` names the skill
  // by the id it installs under, and leaves every other byte as it came. It is
  // the manifest's own line, written out rather than built from the index's
  // `name` — the two fixtures agree today, and agreeing is not being one fact.
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

  /**
   * An external skill is the ONE ejected directory whose contents the preview
   * really knows: the bytes travel in the payload and are already seated, so
   * listing them is reporting rather than inventing. That is what makes this
   * the only place a stranger's file reaches the preview at all.
   */
  test("lists an added skill's real files under its directory", async ({
    configure,
  }) => {
    await expect(
      configure.outputPreviewDialog.row(ADDED_SKILL_PATH)
    ).toBeVisible()
  })

  /**
   * Criterion 11, and it is `skill-contents-dialog.tsx`'s shipped
   * rendering-safety decision arriving in a second dialog: no markdown
   * renderer, no sanitiser, no `dangerouslySetInnerHTML`, because the tree
   * holds a stranger's bytes and the CLI is going to write them to somebody's
   * disk.
   *
   * Both halves are asserted and they pull in opposite directions, which is why
   * neither is enough alone:
   *
   *   nothing RAN     — the sentinel the fixture's markup would set is absent;
   *   nothing was LOST — the characters on screen are the file's own, so the
   *                      preview is still telling the truth about the bytes.
   *
   * A sanitiser passes the first and fails the second. A markdown renderer
   * fails both. Only escaping-and-showing passes.
   */
  test("shows a hostile file verbatim and runs none of it", async ({
    configure,
    page,
  }) => {
    const preview = configure.outputPreviewDialog

    // The fixture really does carry the markup, so a version of it that stopped
    // carrying it would fail here rather than passing vacuously — and it
    // carries the line the install renames, so the expectation below differs
    // from the fixture by exactly that line and by nothing a sanitiser touched.
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

  /**
   * And it is not highlighted, which is a decision rather than an omission:
   * §2's scope fence rules third-party bytes out of the grammars entirely, so
   * no token element is built over them at all. The catalogue's own generated
   * files are the opposite case, and the contrast is what makes this assertion
   * mean something.
   */
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

    // Polled, because the grammar is a chunk of its own that colours a file a
    // beat after its lines are on screen — and a file the preview has not
    // drawn before in this session reaches that beat later than one it has.
    // Which file that is moves with the default selection, so a single read
    // here measured the selection rather than the grammar.
    await preview.select(GLOBAL_CONFIG_PATH)
    await expect(preview.subtitle).toHaveText(`${GLOBAL_CONFIG_PATH} · ${NEW}`)
    await expect.poll(tokens).toBeGreaterThan(0)

    expect(strangerTokens).toBe(0)
  })
})

/**
 * The sentence a compiled sub-agent's activation table gives each skill, read
 * off the row the table draws for it: `### <id>`, then `- Description: …`.
 * `undefined` when the sub-agent has no row for the skill at all.
 */
const activationSentence = (lines: readonly string[], skillId: string) => {
  const heading = lines.indexOf(`### ${skillId}`)
  return heading === -1 ? undefined : lines[heading + 1]
}

const DESCRIPTION_PREFIX = "- Description: "

// The developer's cell in a skill's assignment matrix, as the options panel
// names it.
const ASSIGNMENT_DOMAIN = "Web"
const ASSIGNMENT_ROLE = "dev"

/**
 * React picked, and set to load on demand for the developer — which is what
 * puts it in the developer's activation table: a preloaded skill is listed in
 * the frontmatter instead, with no sentence beside it. Picking preloads it, so
 * the cell goes round preloaded → unassigned → lazy.
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
 * THE SEAT EVERY VISITOR STARTS ON (u03). A compiled sub-agent's activation
 * table describes each skill with the sentence its SKILL.md states — that is
 * what an install writes, because compile reads SKILL.md itself. The vendored
 * catalogue carries only the wizard's short label, so a preview drawing from
 * it draws a line no install has ever written.
 *
 * The label is read off the vendored catalogue rather than typed here, and
 * the claim is held to the one skill whose row the line before it finds. The
 * SKILL.md sentence is read off the vendored table `generate:types` copies out
 * of each skill's SKILL.md, so the positive half of the claim is that the row
 * says the sentence the table holds for THIS skill — a row merely differing
 * from the label would pass on a lookup answering another skill's sentence.
 * The table is imported only once the negative has held, so a tree that
 * predates it fails on the label it draws rather than on the import.
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
 * THE MARKETPLACE THE PUBLIC CATALOGUE INSTALLS FROM. A visitor who loads
 * nothing mints a configuration naming no marketplace, and `init --from`
 * installs one from the CLI's default and records it in `config.ts` — the
 * project's always, and the global's once it holds anything. React is picked
 * for the global developer here, so both files hold the line.
 *
 * React is a plugin, so the install also registers the marketplace with
 * Claude Code, reads the name its manifest gives it, and records that on the
 * line after the ref — in both files, as `init --from` wrote them on a clean
 * machine. A configuration installed wholly by eject reads no manifest and
 * records no name; `preview-matches-install.spec.ts`'s public case holds that
 * half against a real install.
 *
 * The lines are mirrored rather than built, by this file's rule: they are
 * text the install writes.
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
 * A MARKETPLACE LOADED UNDER THE SAME SELECTION. The preview is prepared
 * before it is opened and rebuilt whenever the configuration moves — but
 * loading a marketplace that carries every picked skill moves nothing in the
 * configuration, and the catalogue it is drawn against is the only thing that
 * changed. The preview has to answer for that catalogue at once: the
 * marketplace its config.ts records and the sentences its sub-agents show are
 * both the loaded one's.
 *
 * The catalogue is a fork of the public one with one sentence of its own on
 * the picked skill, so loading it drops nothing from the selection and the
 * one thing that can tell the two seats apart is on screen. A fork rather than
 * the public repository itself, because the public catalogue's ref is what
 * config.ts records before any load: loading it again would leave that line
 * where it was, whether or not the preview answered for the load.
 *
 * An install from a marketplace other than the public one reads that
 * marketplace's manifest whatever it installs, and records the name the
 * manifest gives on the line after the ref. This browser reads the catalogue
 * and no manifest — and the stub here answers every path in the repository
 * with the catalogue, which names no marketplace — so the name is one only
 * the install can read, drawn on a line of the installed line's shape the
 * way the project's name is.
 */
test.describe("the preview after a marketplace loads under the same selection", () => {
  const LOADED_REF = "public-fork/skills"
  // The form a seated marketplace is recorded in, mirrored rather than built
  // by the app's own formatter.
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

  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceCatalogOf(page, LOADED_CATALOG)
    const preview = configure.outputPreviewDialog

    await pickReactOnDemand(configure)
    // Opened once on the public catalogue first, so a preview is already
    // built for this selection — the state a visitor who previews, then
    // switches marketplace, is in.
    await configure.roster.previewButton.click()
    await expect(preview.row(GLOBAL_CONFIG_PATH)).toBeVisible()
    await preview.close()

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(LOADED_REF)
    await configure.marketplaceDialog.load()
    await expect(configure.marketplaceDialog.root).toBeHidden()

    // Subject guard: the load kept the selection, so nothing in the
    // configuration moved and the catalogue is the only thing that did.
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
