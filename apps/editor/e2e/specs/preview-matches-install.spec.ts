import { seedPayload } from "@workspace/api-mocks/fixtures"

import { externalSkillId } from "@/stores/catalog-store"

import { expect, test as base } from "../fixtures"
import {
  HARBOR_STACK,
  HARBOR_STORE,
  HARBOR_WIDGETS,
  MARKETPLACE_REF,
  buildMarketplace,
  installFrom,
  startStandIns,
  stubBuiltMarketplace,
} from "../support/install"
import { stubGetConfig } from "../support/sharing"

import type { BuiltMarketplace, StandIns } from "../support/install"
import type { SeedPayload } from "@workspace/matrix"

/**
 * THE PREVIEW DRAWS WHAT `init --from <id>` WRITES — HELD AGAINST THE INSTALL
 * ITSELF, NOT AGAINST A SECOND OPINION OF IT.
 *
 * Journey 48. `output-preview.spec.ts` holds the pane against the model, and
 * the model's unit tests hold it against `@workspace/compile`; packages/cli's
 * `lifecycle/preview-matches-install` holds `@workspace/compile` against a
 * real install. Each link was green while the chain was broken (u03, u04):
 * the links meet at the renderers, and the defects were in what each side
 * handed them. So this spec opens an id in the browser, runs the CLI this
 * repository builds on the same id, and compares the two outputs whole — the
 * file set, then every file's bytes.
 *
 * Every install here is run from a project directory on a machine with
 * nothing installed, which is the premise the preview's footer states. One
 * of them names no marketplace, as every configuration minted on the public
 * catalogue does, so the CLI installs it from its default.
 *
 * WHAT IS NOT COMPARED, AND WHY — each one a thing the preview names rather
 * than guesses, so each is a stated gap rather than a tolerance:
 *
 *   · a line the preview draws with `<computed at install time>` — a value
 *     only the installing machine knows, such as the project's name or the
 *     project `config-types.ts` import specifier. The installed line must
 *     still have the preview line's shape, with a value where the placeholder
 *     stands;
 *   · the global config's `projects` list, which is the machine's own paths;
 *   · the files of a skill ejected out of the marketplace, which the install
 *     copies verbatim and the preview deliberately does not draw: its
 *     directory row is held to the directory the install wrote instead.
 *
 * `marketplaceName` IS compared: the preview draws it in every `config.ts`
 * the install writes it into, and in no other. A name the browser cannot read
 * is the first case above — a placeholder on a line of the installed line's
 * shape — and never an absent line.
 *
 * Plugin installs are not crossed: `claude plugin install` reaches the
 * network, and a plugin skill writes no file under either root for the
 * preview to draw.
 */

type Crossing = { marketplace: BuiltMarketplace; standIns: StandIns }

// One marketplace and one stand-in server per worker: building the
// marketplace runs the CLI twice, and nothing an install does changes either.
const test = base.extend<object, { crossing: Crossing }>({
  crossing: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies off this pattern, and this one has none
    async ({}, use) => {
      const marketplace = await buildMarketplace()
      const standIns = await startStandIns(marketplace)
      await use({ marketplace, standIns })
      await standIns.close()
      await marketplace.cleanup()
    },
    { scope: "worker", timeout: 60_000 },
  ],
})

// The placeholder the preview draws for a value only the installing machine
// knows — mirrored rather than imported, like every string this suite reads
// back off the screen.
const COMPUTED_AT_INSTALL = "<computed at install time>"

const CARRIED_ID = externalSkillId(HARBOR_STORE.category, "brainstorming")

/** One configuration, minted as an id the browser opens and the CLI installs. */
type Install = {
  title: string
  id: string
  payload: SeedPayload
  /** A skill cell the grid presses once the configuration has arrived. */
  shows: string
}

const harbor = (overrides: Partial<SeedPayload>) =>
  seedPayload({ marketplace: MARKETPLACE_REF, ...overrides })

// Two public catalogue skills in two exclusive categories, so a payload can
// hold both — and the one loading on demand is what puts a SKILL.md sentence
// in the compiled sub-agent.
const PUBLIC_REACT = "web-framework-react"
const PUBLIC_ZUSTAND = "web-state-zustand"

const INSTALLS: Install[] = [
  {
    title: "a configuration written wholly to global scope",
    id: "HbrGlob1",
    payload: harbor({
      skills: {
        [HARBOR_WIDGETS.id]: {
          install: "eject",
          scope: "global",
          assignments: { "web-developer": "preloaded" },
        },
        [HARBOR_STORE.id]: {
          install: "eject",
          scope: "global",
          assignments: { "web-developer": "lazy" },
        },
      },
      agents: {},
    }),
    shows: HARBOR_WIDGETS.displayName,
  },
  {
    title: "a configuration written wholly into the project",
    id: "HbrProj2",
    payload: harbor({
      skills: {
        [HARBOR_WIDGETS.id]: {
          install: "eject",
          scope: "project",
          assignments: { "web-developer": "preloaded" },
        },
        [HARBOR_STORE.id]: {
          install: "eject",
          scope: "project",
          assignments: { "web-developer": "lazy" },
        },
      },
      agents: { "web-developer": { scope: "project" } },
    }),
    shows: HARBOR_WIDGETS.displayName,
  },
  {
    title: "a configuration built from a described stack, across both scopes",
    id: "HbrStak3",
    payload: harbor({
      stackId: HARBOR_STACK.id,
      skills: {
        [HARBOR_WIDGETS.id]: {
          install: "eject",
          scope: "global",
          assignments: { "web-developer": "preloaded" },
        },
        [HARBOR_STORE.id]: {
          install: "eject",
          scope: "project",
          assignments: { "web-developer": "lazy" },
        },
      },
      agents: { "web-developer": { scope: "project" } },
    }),
    shows: HARBOR_WIDGETS.displayName,
  },
  {
    title: "a configuration carrying a skill added in the editor",
    id: "HbrCarr4",
    payload: harbor({
      skills: {
        [HARBOR_WIDGETS.id]: {
          install: "eject",
          scope: "project",
          assignments: { "web-developer": "preloaded" },
        },
        [CARRIED_ID]: {
          install: "eject",
          scope: "global",
          assignments: { "web-developer": "lazy" },
        },
      },
      agents: { "web-developer": { scope: "project" } },
      external: {
        [CARRIED_ID]: {
          displayName: "brainstorming",
          description: "Explores user intent before implementation.",
          categoryId: HARBOR_STORE.category,
          repo: "obra/superpowers",
          path: "skills/brainstorming",
          files: {
            "SKILL.md":
              "---\nname: brainstorming\ndescription: Explores user intent before implementation.\n---\n\n# Brainstorming\n",
            "visual-companion.md": "# Visual companion\n",
          },
        },
      },
    }),
    shows: HARBOR_WIDGETS.displayName,
  },
  {
    title:
      "a configuration minted on the public catalogue, naming no marketplace",
    id: "PubDflt5",
    payload: seedPayload({
      skills: {
        [PUBLIC_REACT]: {
          install: "eject",
          scope: "global",
          assignments: { "web-developer": "preloaded" },
        },
        [PUBLIC_ZUSTAND]: {
          install: "eject",
          scope: "project",
          assignments: { "web-developer": "lazy" },
        },
      },
      agents: { "web-developer": { scope: "project" } },
    }),
    shows: "Zustand",
  },
]

/**
 * The directories of the skills a payload ejects out of the marketplace, under
 * the root each is written to. A skill the payload carries is not one of
 * them: its bytes travel in the payload, so the preview draws every file.
 */
const catalogueEjectDirectories = (payload: SeedPayload) =>
  Object.entries(payload.skills)
    .filter(
      ([id, skill]) =>
        skill.install === "eject" && !(id in (payload.external ?? {}))
    )
    .map(
      ([id, skill]) =>
        `${skill.scope === "global" ? "~/" : "./"}.claude/skills/${id}/`
    )

const escapeForPattern = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// The one `config.ts` entry the install writes from something no browser can
// know: the machine's own project paths — a list the writer folds onto one
// line or several depending on how long the paths are.
const PROJECTS_LIST = /^[ \t]*projects: \[[^\]]*\],\n/m

/**
 * The installed file in the terms the preview can be held to: the gaps it
 * names taken out, and each line it draws with a placeholder answered by the
 * installed line of the same shape. Anything else that differs is left to
 * differ.
 */
const asThePreviewCanKnowIt = (
  file: string,
  installed: string,
  drawn: string
) => {
  const withoutGaps = file.endsWith("/config.ts")
    ? installed.replace(PROJECTS_LIST, "")
    : installed

  const lines = withoutGaps.split("\n")
  const answered = new Set<number>()

  for (const drawnLine of drawn.split("\n")) {
    if (!drawnLine.includes(COMPUTED_AT_INSTALL)) continue

    const shape = new RegExp(
      `^${drawnLine
        .split(COMPUTED_AT_INSTALL)
        .map(escapeForPattern)
        .join(".+")}$`
    )
    const at = lines.findIndex(
      (line, index) => !answered.has(index) && shape.test(line)
    )
    if (at === -1) continue

    answered.add(at)
    lines[at] = drawnLine
  }

  return lines.join("\n")
}

test.describe("the preview is the install", () => {
  test.describe.configure({ timeout: 120_000 })

  for (const install of INSTALLS) {
    test(`${install.title}: the files and their bytes are the ones init --from writes`, async ({
      configure,
      crossing,
      page,
    }) => {
      await crossing.standIns.publish(install.id, install.payload)
      const installed = await installFrom(crossing.standIns, install.id)

      // Subject guard: an install that refused leaves nothing to compare, and
      // every difference below would be a report about the refusal.
      expect(installed.exitCode, installed.output).toBe(0)

      stubBuiltMarketplace(page, crossing.marketplace.catalog)
      stubGetConfig(page, install.id, install.payload)
      await page.goto(`/?fromId=${install.id}`)
      await expect(configure.skill(install.shows).root).toHaveAttribute(
        "aria-pressed",
        "true"
      )

      await configure.roster.previewButton.click()
      const preview = configure.outputPreviewDialog
      const drawn = await preview.writtenFiles()

      const ejected = catalogueEjectDirectories(install.payload)
      const isCopiedVerbatim = (file: string) =>
        ejected.some((directory) => file.startsWith(directory))

      for (const directory of ejected) {
        expect
          .soft(
            await preview.markerOf(directory),
            `the preview drew no ejected directory at ${directory}`
          )
          .toBe("eject")
        expect
          .soft(
            Object.keys(installed.files).some((file) =>
              file.startsWith(directory)
            ),
            `the install wrote nothing under ${directory}`
          )
          .toBe(true)
      }

      const installedFiles = Object.keys(installed.files)
        .filter((file) => !isCopiedVerbatim(file))
        .sort()

      expect
        .soft(
          Object.keys(drawn).sort(),
          "the preview's files are not the files the install wrote"
        )
        .toStrictEqual(installedFiles)

      // A file only one side has is the assertion above's to report, so each
      // file both sides have is compared on its own — the install the
      // expectation, as the file set's is.
      for (const file of installedFiles) {
        const drawnText = drawn[file]
        if (drawnText === undefined) continue

        expect
          .soft(drawnText, `the preview draws ${file} differently`)
          .toBe(asThePreviewCanKnowIt(file, installed.files[file]!, drawnText))
      }
    })
  }
})
