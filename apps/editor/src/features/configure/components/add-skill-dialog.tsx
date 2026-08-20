import { Button } from "@workspace/ui/components/button"
import { chipVariants } from "@workspace/ui/components/chip"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { LatticeRow, LatticeRows } from "@workspace/ui/components/lattice"
import { useEffect, useState, type ReactNode } from "react"

import { track } from "@/lib/analytics/track"
import {
  carryLimitRefusal,
  fetchSkillContents,
  isPastCarryLimit,
} from "@/lib/api/skill-contents"
import {
  fetchSkillIndex,
  formatStars,
  type IndexFreshness,
} from "@/lib/api/skill-index"
import {
  activeCatalog,
  externalSkillId,
  useCatalogStore,
  type ExternalSkill,
} from "@/stores/catalog-store"
import { useUiStore } from "@/stores/ui-store"

import type { Catalog, SeedSkillTree } from "@workspace/matrix"
import type { SkillIndexEntry } from "@workspace/matrix/skill-index"

// Filtering is instant — the whole index is in memory — so this delay is the
// analytics' own rather than the search's: a funnel wants one event per
// search, not one per keystroke.
const SEARCH_SETTLE_MS = 350

// The dropdown's resting option. A category is a decision the user makes
// (CLI-412), so nothing is pre-chosen and nothing can be added without one —
// `categoriseRepo` used to guess from the repository name and file everything
// it could not match under Uncategorized, which is the multi-tier fallback the
// repository bans.
const NO_CATEGORY = ""

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Keeps the term itself in the result, so the matches can be wrapped.
const splitAroundTerm = (text: string, term: string) =>
  text.split(new RegExp(`(${escapeRegExp(term)})`, "ig"))

const equalsIgnoringCase = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase()

function Highlight({ text, term }: { text: string; term: string }): ReactNode {
  const needle = term.trim()
  if (!needle) return text

  return splitAroundTerm(text, needle).map((part, index) =>
    equalsIgnoringCase(part, needle) ? (
      <span key={index} className="bg-wash text-brand-ink">
        {part}
      </span>
    ) : (
      part
    )
  )
}

// The dialog's one status line, in the treatment the search already used for
// "searching…". Loading, a failure, an index still filling and a filter that
// matched nothing are all the same statement — why the list below is missing,
// or shorter than it might be.
function Note({
  children,
  alert = false,
  slot,
}: {
  children: ReactNode
  alert?: boolean
  slot?: string
}) {
  return (
    <p
      data-slot={slot}
      className={`pt-3.5 font-mono text-10_5 ${
        alert ? "text-brand-ink" : "text-muted-foreground"
      }`}
    >
      {children}
    </p>
  )
}

// One repository holds many skills — the real index carries dozens across
// three — so the repository alone would hand every skill in it the same id.
// The directory within it is what tells two apart.
const skillCoordinate = (entry: SkillIndexEntry) =>
  `${entry.repo}/${entry.path}`

/**
 * Whether this result can be added at all.
 *
 * Five of the fifty-eight indexed skills cannot — `canvas-design` is 5.4 MB and
 * `docx`, `xlsx` and `pptx` are around 1.1 MB each, against the 256 KB a shared
 * link carries per skill. The refusal was always correct and always arrived
 * last, because nothing here knew a skill's weight until the editor had listed
 * the repository itself; the index carries it now.
 *
 * It does not replace the late refusal in `skill-contents.ts`. That one reads a
 * listing made just now and is the authority; this reads a crawl's snapshot,
 * and its job is to stop a visitor spending the whole funnel on a row that was
 * never addable.
 */
const isTooLargeToAdd = (entry: SkillIndexEntry) =>
  isPastCarryLimit(entry.bytes)

// A skill staged for adding: the index entry it came from, and the category the
// user has picked for it. Its id follows from the two, so it does not exist
// until the placement does.
type StagedSkill = { entry: SkillIndexEntry; categoryId: string }

const stagedId = (staged: StagedSkill) =>
  staged.categoryId === NO_CATEGORY
    ? undefined
    : externalSkillId(staged.categoryId, staged.entry.name)

// Every category of the loaded catalogue, in the grid's own order, labelled by
// the domain it sits under — `web · framework` — because a bare "Framework"
// appears in more than one domain and the two are different placements.
const categoryOptions = () =>
  activeCatalog().domains.flatMap((domain) =>
    domain.categories.map((category) => ({
      id: category.id,
      label: `${domain.label.toLowerCase()} · ${category.displayName.toLowerCase()}`,
    }))
  )

/**
 * What already answers to the id this staging would mint, if anything does.
 *
 * Journey 26: `external-` separates these from marketplaces, not from one
 * another, so two skills of one name in one category really is one id. It is
 * detectable here with the id in hand — which is the moment the ruling names —
 * and the alternative is discovering it when the CLI writes the second one over
 * the first.
 */
const holderOf = (
  staging: StagedSkill,
  staged: StagedSkill[],
  catalog: Catalog
): string | undefined => {
  const id = stagedId(staging)
  if (id === undefined) return undefined

  // The catalogue covers both the skills already added and the ids it shipped:
  // an added skill IS a catalogue entry, so one lookup answers both.
  const seated = catalog.skillsById[id]
  if (seated) return seated.displayName

  const twin = staged.find(
    (other) =>
      skillCoordinate(other.entry) !== skillCoordinate(staging.entry) &&
      stagedId(other) === id
  )
  return twin?.entry.name
}

const toExternalSkill = (
  { entry, categoryId }: StagedSkill,
  files: SeedSkillTree
): ExternalSkill => ({
  id: externalSkillId(categoryId, entry.name),
  displayName: entry.name,
  // The index serves an empty description where the SKILL.md offered neither
  // frontmatter nor a heading — a thin result rather than an invalid one.
  description: entry.description || "Added from GitHub",
  categoryId,
  repo: entry.repo,
  path: entry.path,
  files,
})

type Resolution =
  { ok: true; skills: ExternalSkill[] } | { ok: false; error: string }

/**
 * Every staged skill's directory, or the first reason one could not be read.
 *
 * In parallel, because they are independent reads off a CDN. All or nothing,
 * because adding the ones that resolved would leave the grid showing a skill
 * the payload cannot carry — which is the exact shape of the defect this whole
 * row exists to close.
 */
const resolveStaged = async (staged: StagedSkill[]): Promise<Resolution> => {
  const fetched = await Promise.all(
    staged.map(async (item) => ({
      item,
      contents: await fetchSkillContents(item.entry.repo, item.entry.path),
    }))
  )

  const skills: ExternalSkill[] = []
  for (const { item, contents } of fetched) {
    if (!contents.ok) return { ok: false, error: contents.error }
    skills.push(toExternalSkill(item, contents.files))
  }

  return { ok: true, skills }
}

// Name and description — the same two fields the grid's own search reads. Not
// the repository: this dialog searches skills rather than repositories, which
// is the whole reason it stopped calling GitHub's repository search.
const matchesTerm = (entry: SkillIndexEntry, needle: string) =>
  entry.name.toLowerCase().includes(needle) ||
  entry.description.toLowerCase().includes(needle)

const filterIndex = (skills: SkillIndexEntry[], term: string) => {
  const needle = term.toLowerCase()
  if (!needle) return skills
  return skills.filter((entry) => matchesTerm(entry, needle))
}

type IndexState =
  | { status: "loading" }
  | { status: "ready"; skills: SkillIndexEntry[]; freshness: IndexFreshness }
  | { status: "failed"; error: string }

// What is happening while the confirm is pressed: the directories are being
// fetched, or one of them could not be.
type CommitState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "failed"; error: string }

// The whole external index arrives in one response and is filtered here, in
// the browser — which is what removes the request per keystroke, the debounce
// and the rate limit the old repository search had to design around.
//
// Adding ends with two things the old dialog had neither of: a CATEGORY the
// user confirmed, which is what makes the skill a real catalogue entry rather
// than an orphan, and the skill's whole DIRECTORY, fetched here so the shared
// payload can carry it and `--from` never has to reach GitHub at all.
export function AddSkillDialog() {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)
  const addExternal = useCatalogStore((state) => state.addExternal)
  // Subscribed rather than read once: the category list is the loaded
  // catalogue's, so swapping the marketplace changes what may be chosen.
  const catalog = useCatalogStore((state) => state.catalog)

  const [query, setQuery] = useState("")
  const [staged, setStaged] = useState<StagedSkill[]>([])
  const [index, setIndex] = useState<IndexState>({ status: "loading" })
  const [commit, setCommit] = useState<CommitState>({ status: "idle" })

  const open = dialog === "add"
  const trimmed = query.trim()
  const results =
    index.status === "ready" ? filterIndex(index.skills, trimmed) : []

  // A fresh index is the current whole picture, so it is fetched once and
  // reused for the rest of the session. A stale one explicitly is not — "this
  // list is not everything, ask again later" is the header's whole meaning —
  // so the next open asks again, as does an open after a failure. Nothing
  // refetches while the dialog is open: the list would move under the pointer
  // for no reason.
  const settled = index.status === "ready" && index.freshness === "fresh"

  useEffect(() => {
    if (!open || settled) return

    // What is on screen stays on screen while this runs. A reopen that has to
    // ask again already has a list to show, and blanking it to "loading" would
    // be a flash rather than information.
    let live = true

    void fetchSkillIndex().then((result) => {
      if (!live) return
      setIndex(
        result.ok
          ? {
              status: "ready",
              skills: result.index.skills,
              freshness: result.freshness,
            }
          : { status: "failed", error: result.error }
      )
    })

    // The request is not aborted, only ignored: it is one small GET, and
    // letting it finish warms the browser cache for the next open.
    return () => {
      live = false
    }
  }, [open, settled])

  const resultCount = results.length

  useEffect(() => {
    if (!open || !trimmed || index.status !== "ready") return

    const timer = setTimeout(() => {
      // The count, never the query. A search that returns nothing is someone
      // asking the catalog for a skill it does not have, which is the closest
      // thing here to a feature request — but the words they typed are theirs,
      // and are the one free-text field in the app.
      track({ name: "skill_searched", resultCount })
    }, SEARCH_SETTLE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [open, trimmed, index.status, resultCount])

  // The index is deliberately not cleared. It is the same list next time, and
  // whether it is asked for again is decided by its freshness rather than by
  // the dialog closing.
  const close = () => {
    setDialog("none")
    setQuery("")
    setStaged([])
    setCommit({ status: "idle" })
  }

  const isStaged = (entry: SkillIndexEntry) =>
    staged.some(
      (item) => skillCoordinate(item.entry) === skillCoordinate(entry)
    )

  const unstage = (entry: SkillIndexEntry) =>
    setStaged((current) =>
      current.filter(
        (item) => skillCoordinate(item.entry) !== skillCoordinate(entry)
      )
    )

  const toggleStage = (entry: SkillIndexEntry) => {
    setCommit({ status: "idle" })
    if (isStaged(entry)) {
      unstage(entry)
      return
    }
    setStaged((current) => [...current, { entry, categoryId: NO_CATEGORY }])
  }

  const categorise = (entry: SkillIndexEntry, categoryId: string) =>
    setStaged((current) =>
      current.map((item) =>
        skillCoordinate(item.entry) === skillCoordinate(entry)
          ? { ...item, categoryId }
          : item
      )
    )

  const holder = (item: StagedSkill) => holderOf(item, staged, catalog)

  const placed = staged.filter(
    (item) => item.categoryId !== NO_CATEGORY && holder(item) === undefined
  )
  const ready = staged.length > 0 && placed.length === staged.length

  const confirm = async () => {
    setCommit({ status: "resolving" })
    const resolved = await resolveStaged(placed)

    if (!resolved.ok) {
      setCommit({ status: "failed", error: resolved.error })
      return
    }

    addExternal(resolved.skills)
    // Repository names, which are public by definition — this is what the
    // catalog is missing, in the words of the people reaching outside it.
    for (const skill of resolved.skills) {
      track({ name: "skill_added", fullName: skill.id })
    }
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader title="Add skill" subtitle="from github" />

        <DialogBody scroll>
          {staged.length > 0 && (
            <div className="flex flex-col gap-1.5 pb-3">
              {staged.map((item) => (
                <StagedRow
                  key={skillCoordinate(item.entry)}
                  staged={item}
                  holder={holder(item)}
                  categories={categoryOptions()}
                  onCategorise={(categoryId) =>
                    categorise(item.entry, categoryId)
                  }
                  onRemove={() => unstage(item.entry)}
                />
              ))}
            </div>
          )}

          <div className="mb-0.5 flex items-center gap-[0.5625rem] border border-field-border px-3 py-2.5">
            <span aria-hidden className="font-mono text-11 text-faint">
              ⌕
            </span>
            <Input
              variant="dialog"
              autoFocus
              value={query}
              placeholder="search external skills"
              aria-label="Search external skills"
              onChange={(event) => setQuery(event.target.value)}
            />
            <span aria-hidden className="h-[0.9375rem] w-px bg-brand" />
          </div>

          {index.status === "loading" && <Note>loading skills…</Note>}

          {index.status === "failed" && <Note alert>{index.error}</Note>}

          {commit.status === "resolving" && <Note>reading skill files…</Note>}

          {commit.status === "failed" && (
            <Note alert slot="dialog-error">
              {commit.error}
            </Note>
          )}

          {index.status === "ready" && (
            <>
              {index.freshness === "stale" && (
                <Note>index still filling — more skills may appear</Note>
              )}

              {results.length === 0 ? (
                <Note>no skills match</Note>
              ) : (
                <LatticeRows
                  className="mt-3.5"
                  // A named group, so the rows inside it can be asked for by
                  // role: the staged half of the dialog names the same skills,
                  // and `Remove docx` is a button whose name holds `docx` too.
                  role="group"
                  aria-label="Search results"
                >
                  {results.map((entry) => {
                    const stagedHere = isStaged(entry)
                    const tooLarge = isTooLargeToAdd(entry)
                    return (
                      <LatticeRow
                        key={skillCoordinate(entry)}
                        selected={stagedHere}
                        // Otherwise the name is every string in the row run
                        // together — including the stage marker, so it would
                        // change under the visitor as they staged. The
                        // repository is in it because the row is a button and
                        // therefore a leaf: one name can be all assistive
                        // technology is given, and two repositories can carry a
                        // skill of the same name.
                        aria-label={`${entry.name} from ${entry.repo}`}
                        // Shown and not hidden, the way an incompatible skill is
                        // in the grid: a result missing without explanation is
                        // the search failing, and the whole point is that the
                        // reason is legible. `aria-disabled` rather than
                        // removing the handler alone, so the row announces that
                        // it cannot be acted on rather than quietly ignoring a
                        // click.
                        aria-disabled={tooLarge || undefined}
                        // The refusal is printed in the row, which the leaf
                        // above hides — `title` is the accessible DESCRIPTION,
                        // which is where a reason belongs.
                        title={
                          tooLarge ? carryLimitRefusal(entry.bytes) : undefined
                        }
                        className={
                          tooLarge ? "cursor-default hover:bg-cell" : undefined
                        }
                        onClick={
                          tooLarge ? undefined : () => toggleStage(entry)
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-11_5 font-semibold text-ink">
                            <Highlight text={entry.name} term={query} />
                          </div>
                          {entry.description && (
                            <div className="pt-[0.1875rem] text-10_5 leading-[1.4] text-muted-foreground">
                              {entry.description}
                            </div>
                          )}
                          {tooLarge && (
                            /* The weight and the limit, in the words the late
                               refusal uses for the same skill — shared from
                               `skill-contents.ts` so the two cannot drift. Not
                               `role="alert"`: this is standing content on a
                               list, and a dozen alerts firing as the list
                               renders would say nothing anyone could follow. */
                            <div
                              data-slot="too-large"
                              className="pt-[0.1875rem] font-mono text-9 font-medium text-brand-ink"
                            >
                              {carryLimitRefusal(entry.bytes)}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-none items-center gap-3 pt-0.5">
                          <span className="font-mono text-9 font-medium whitespace-nowrap text-muted-foreground">
                            {formatStars(entry.stars)} ★
                          </span>
                          {/* Provenance: which repository this skill was
                              crawled from, in the slot the language pip used to
                              hold. GitHub's whole `owner/name` — the owner is
                              the informative half for `anthropics/skills`, and
                              it is who a reader is deciding whether to trust.
                              At text-9 mono it fits the one-line row. */}
                          <span className="flex items-center gap-[0.3125rem] font-mono text-9 font-medium whitespace-nowrap text-muted-foreground">
                            <span
                              aria-hidden
                              className="block size-[0.4375rem] bg-brand"
                            />
                            {entry.repo}
                          </span>
                          {/* Looks like a Chip but cannot be one — the whole row is
                              already the click target, so this must not nest a
                              button. The shared CVA keeps the two in step.
                              Absent entirely on a row nothing can add: an
                              affordance that does nothing is worse than none,
                              and the reason is already on the row. */}
                          {!tooLarge && (
                            <span
                              className={chipVariants({
                                size: "stage",
                                active: stagedHere,
                              })}
                            >
                              {stagedHere ? "staged" : "＋ stage"}
                            </span>
                          )}
                        </div>
                      </LatticeRow>
                    )
                  })}
                </LatticeRows>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogFooterNote>
            <em className="text-ink not-italic">{staged.length}</em> staged ·
            choose where each one belongs · a skill from outside the catalogue
            always installs by <em className="text-ink not-italic">ejecting</em>
          </DialogFooterNote>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ready || commit.status === "resolving"}
            onClick={() => void confirm()}
          >
            Add {staged.length} skill{staged.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// One staged skill, waiting on its placement. A native `<select>`: the design
// system has no dropdown, and the platform's own is keyboard-navigable,
// screen-reader-announced and typeahead-searchable for free — none of which a
// hand-rolled listbox would be without a great deal more code than a category
// picker is worth.
function StagedRow({
  staged,
  holder,
  categories,
  onCategorise,
  onRemove,
}: {
  staged: StagedSkill
  holder: string | undefined
  categories: { id: string; label: string }[]
  onCategorise: (categoryId: string) => void
  onRemove: () => void
}) {
  const { name } = staged.entry

  return (
    <div
      data-slot="staged-skill"
      className="flex flex-wrap items-center gap-[0.4375rem] border border-brand-border bg-wash px-[0.4375rem] py-1 font-mono text-9 font-medium tracking-[.04em] text-brand-ink"
    >
      <span className="truncate">{name}</span>

      <label className="flex items-center gap-1.5">
        {/* A real label rather than an `aria-label`, so the text is the
            accessible name once and clicking it reaches the control. */}
        <span className="sr-only">Category for {name}</span>
        <select
          value={staged.categoryId}
          onChange={(event) => onCategorise(event.target.value)}
          className="border border-field-border bg-transparent px-1.5 py-0.5 font-mono text-9 text-ink"
        >
          <option value={NO_CATEGORY}>choose a category…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="ml-auto cursor-pointer text-brand-dim hover:text-ink"
      >
        ✕
      </button>

      {holder !== undefined && (
        <p role="alert" className="basis-full pt-1 text-9 text-brand-ink">
          {holder} already answers to that id — file this one elsewhere or
          remove it
        </p>
      )}
    </div>
  )
}
