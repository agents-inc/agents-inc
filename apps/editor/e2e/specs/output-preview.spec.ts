import {
  EXTERNAL_SKILL,
  SKILL_INDEX,
  XSS_SENTINEL,
} from "@workspace/api-mocks/fixtures"
import { CORPUS_CLI_VERSION } from "@workspace/compile/corpus"
import { SEED_VERSION } from "@workspace/matrix"

import { buildOutputPreview } from "@/features/configure/lib/output-preview"
import { externalSkillId } from "@/stores/catalog-store"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"

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
 *     that the footer says what the preview cannot know.
 *
 * COPY IS MIRRORED, NEVER IMPORTED. Every string below that the product also
 * renders is written out here, for the reason `e2e/pages` writes its own
 * copies: an assertion that imports the constant it is checking cannot fail,
 * because both halves move together. `CORPUS_CLI_VERSION` is the one import,
 * and it is the exception that proves the rule — the claim is that the footer
 * names THE CORPUS's version, not that it names a particular release.
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
// both the design and the programme README: the config pair lives in
// `.claude-src/` and everything else in `.claude/`.
const GLOBAL = "~/"
const PROJECT = "./"

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

// The tree, as a list of row names, for a configuration holding one global
// plugin skill. Written out rather than counted, because a count cannot tell a
// swapped row from an unchanged one — and every correction in §0 shows up in
// this list: `.claude-src/` beside `.claude/`, `config-types.ts` rather than
// `config.d.ts`, and a plugin skill under a group that is deliberately not a
// path.
const GLOBAL_ONLY_TREE = [
  GLOBAL,
  ".claude-src/",
  CONFIG_TS,
  CONFIG_TYPES_TS,
  ".claude/",
  "agents/",
  ...REACHED_AGENTS.map((agent) => `${agent}.md`),
  "plugin skills",
  REACT_ID,
]

// The same configuration with the developer written into the project instead.
// The `.md` moves and takes a whole second root with it — this list is the
// dialog's entire argument, and it is why there is no tab bar and no
// breadcrumb: scope separates itself.
const SPLIT_TREE = [
  GLOBAL,
  ".claude-src/",
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
  ".claude-src/",
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
  ".claude-src/",
  CONFIG_TS,
  CONFIG_TYPES_TS,
  ".claude/",
  "agents/",
  ...REACHED_AGENTS.map((agent) => `${agent}.md`),
  "skills/",
  `${REACT_ID}/`,
]

const globalPath = (rest: string) => `${GLOBAL}${rest}`
const projectPath = (rest: string) => `${PROJECT}${rest}`

const GLOBAL_CONFIG_PATH = globalPath(`.claude-src/${CONFIG_TS}`)
const PROJECT_CONFIG_PATH = projectPath(`.claude-src/${CONFIG_TS}`)
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
   * "Generated" is load-bearing in the label — it says the files do not exist
   * yet — and there is deliberately no count beside it: at 250px the label is
   * all that fits, and the dialog footer already states the file count.
   */
  test("its label says the files do not exist yet, and carries no count", async ({
    configure,
  }) => {
    await expect(configure.roster.previewButton).toHaveText(
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

  test("draws one root, its two directories and every file under them", async ({
    configure,
  }) => {
    await configure.roster.previewButton.click()

    expect(await configure.outputPreviewDialog.rowNames()).toStrictEqual(
      GLOBAL_ONLY_TREE
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
   * no tab bar and no breadcrumb doing any of the work. The second root arrives
   * with it, carrying its own config pair, because a root is emitted the moment
   * it holds one agent or one skill.
   */
  test("flipping an agent's scope moves its markdown between the roots", async ({
    configure,
  }) => {
    await configure.roster.previewButton.click()
    await expect(
      configure.outputPreviewDialog.row(GLOBAL_DEVELOPER_PATH)
    ).toBeVisible()
    await configure.outputPreviewDialog.close()

    await configure.roster.scopeControl(DEVELOPER).click()
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    expect(await preview.rowNames()).toStrictEqual(SPLIT_TREE)
    await expect(
      preview.row(projectPath(`.claude/agents/${DEVELOPER}.md`))
    ).toBeVisible()
    await expect(preview.row(GLOBAL_DEVELOPER_PATH)).toHaveCount(0)
  })

  /**
   * Both roots carry the config pair, always. `.claude-src/` is the one
   * directory an emitted root cannot be without, which is what makes "a root
   * holding neither an agent nor a skill is ABSENT, not empty" a rule worth
   * having: an empty root would show two files an install does not write there.
   */
  test("every emitted root holds the config pair", async ({ configure }) => {
    await configure.roster.scopeControl(DEVELOPER).click()
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    await expect(preview.row(GLOBAL_CONFIG_PATH)).toBeVisible()
    await expect(
      preview.row(globalPath(`.claude-src/${CONFIG_TYPES_TS}`))
    ).toBeVisible()
    await expect(preview.row(PROJECT_CONFIG_PATH)).toBeVisible()
    await expect(
      preview.row(projectPath(`.claude-src/${CONFIG_TYPES_TS}`))
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
   * B3.2's "absent, not empty", asked of the browser rather than of the model:
   * a configuration written entirely into the project has no global root at
   * all. The scope words are flipped on the agents FIRST, so the skill's own
   * flip never leaves a pair whose two scopes cannot meet — the error state is
   * a different subject and would only be noise here.
   */
  test("omits a root entirely when nothing is written there", async ({
    configure,
  }) => {
    for (const agent of REACHED_AGENTS) {
      await configure.roster.scopeControl(agent).click()
    }
    await configure.skillIn(web, CATEGORY, REACT).flipScope()

    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    await expect(preview.row(PROJECT_CONFIG_PATH)).toBeVisible()
    await expect(preview.row(GLOBAL_CONFIG_PATH)).toHaveCount(0)
    await expect(preview.row(GLOBAL)).toHaveCount(0)
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
    { path: GLOBAL, level: "1", posinset: "1", setsize: "1" },
    {
      path: globalPath(".claude-src/"),
      level: "2",
      posinset: "1",
      setsize: "2",
    },
    { path: GLOBAL_CONFIG_PATH, level: "3", posinset: "1", setsize: "2" },
    {
      path: globalPath(`.claude-src/${CONFIG_TYPES_TS}`),
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
    await configure.roster.scopeControl(DEVELOPER).click()
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
    // order and read the same from the selected row's side.
    expect(await preview.rowTabStops()).toStrictEqual(
      (await preview.rowPaths()).map((path) => ({
        path,
        tabIndex: path === GLOBAL_CONFIG_PATH ? 0 : -1,
      }))
    )

    await preview.row(GLOBAL_CONFIG_PATH).focus()

    await page.keyboard.press("ArrowDown")
    expect(await preview.focusedRowPath()).toStrictEqual(
      globalPath(`.claude-src/${CONFIG_TYPES_TS}`)
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
    // which is also what a broken tree looks like.
    expect(
      [(await preview.rowPaths()).at(0), (await preview.rowPaths()).at(-1)],
      "the ends of the tree are not the rows these presses are aimed at"
    ).toStrictEqual([GLOBAL, REACT_ID])

    await preview.row(GLOBAL).focus()
    await page.keyboard.press("ArrowUp")
    expect(await preview.focusedRowPath()).toStrictEqual(GLOBAL)

    await preview.row(REACT_ID).focus()
    await page.keyboard.press("ArrowDown")
    expect(await preview.focusedRowPath()).toStrictEqual(REACT_ID)
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

    await configure.roster.scopeControl(DEVELOPER).click()
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
    const model = await buildOutputPreview({
      v: SEED_VERSION,
      matrixVersion: "0.0.0-test",
      stackId: null,
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
    })

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

test.describe("the footer", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.previewButton.click()
  })

  /**
   * Criterion 12. The preview cannot see disk: it cannot run
   * `resolveEffectiveGlobalConfig`, cannot reconcile a project split against a
   * global one, cannot mask a tombstone, and cannot populate the global
   * config's `projects` array. None of that is fixed by sharing the renderer,
   * so it is scoped out and SAID — as a claim rather than a hedge, which is the
   * difference between an honest preview and a wrong one.
   */
  test("states what it is a preview of", async ({ configure }) => {
    await expect(configure.outputPreviewDialog.footerNote).toContainText(
      CLEAN_MACHINE_CLAIM
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
   * per emitted root, plus one per compiled sub-agent. A plugin reference is
   * not a file, and an ejected catalogue directory is copied rather than
   * generated — the preview does not know what is in it, so it cannot count it.
   */
  test("counts the files an install writes and nothing else", async ({
    configure,
  }) => {
    const CONFIG_FILES_PER_ROOT = 2
    const written = CONFIG_FILES_PER_ROOT + REACHED_AGENTS.length

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
  const ADDED_SKILL_PATH = `${GLOBAL}.claude/skills/${externalSkillId(
    CHOSEN_CATEGORY_ID,
    SKILL_NAME
  )}/${MANIFEST}`

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
    // carrying it would fail here rather than passing vacuously.
    expect(MANIFEST_TEXT).toContain("<script>")
    expect(MANIFEST_TEXT).toContain("onerror=")

    await preview.select(ADDED_SKILL_PATH)

    expect(await preview.lines()).toStrictEqual(MANIFEST_TEXT.split("\n"))
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

    await preview.select(ADDED_SKILL_PATH)
    const strangerTokens = await preview.contentPane.evaluate(
      (node) => node.querySelectorAll("[data-slot='preview-token']").length
    )

    await preview.select(GLOBAL_CONFIG_PATH)
    const generatedTokens = await preview.contentPane.evaluate(
      (node) => node.querySelectorAll("[data-slot='preview-token']").length
    )

    expect(strangerTokens).toBe(0)
    expect(generatedTokens).toBeGreaterThan(0)
  })
})
