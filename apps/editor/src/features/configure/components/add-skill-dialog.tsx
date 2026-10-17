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
import { Glyph } from "@workspace/ui/components/glyph"
import { Input } from "@workspace/ui/components/input"
import { LatticeRow, LatticeRows } from "@workspace/ui/components/lattice"
import { useEffect, useRef, useState, type ReactNode } from "react"

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

// Analytics only: one event per search, not per keystroke.
const SEARCH_SETTLE_MS = 350

// Nothing is pre-chosen: a category is the user's decision.
const NO_CATEGORY = ""

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// The capture group keeps the term in the result, so matches can be wrapped.
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

// One repository holds many skills; the path tells them apart.
const skillCoordinate = (entry: SkillIndexEntry) =>
  `${entry.repo}/${entry.path}`

// An early refusal from the index's snapshot; `skill-contents.ts` stays the
// authority.
const isTooLargeToAdd = (entry: SkillIndexEntry) =>
  isPastCarryLimit(entry.bytes)

// Its id follows from entry and category, so it has none until placed.
type StagedSkill = { entry: SkillIndexEntry; categoryId: string }

const stagedId = (staged: StagedSkill) =>
  staged.categoryId === NO_CATEGORY
    ? undefined
    : externalSkillId(staged.categoryId, staged.entry.name)

// Labelled with the domain: a bare "Framework" appears in several.
const categoryOptions = () =>
  activeCatalog().domains.flatMap((domain) =>
    domain.categories.map((category) => ({
      id: category.id,
      label: `${domain.label.toLowerCase()} · ${category.displayName.toLowerCase()}`,
    }))
  )

// Two skills of one name in one category share an id; caught here, or the CLI
// writes one over the other.
const holderOf = (
  staging: StagedSkill,
  staged: StagedSkill[],
  catalog: Catalog
): string | undefined => {
  const id = stagedId(staging)
  if (id === undefined) return undefined

  // Added skills are catalogue entries, so one lookup covers both.
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
  description: entry.description || "Added from GitHub",
  categoryId,
  repo: entry.repo,
  path: entry.path,
  files,
})

type Resolution =
  { ok: true; skills: ExternalSkill[] } | { ok: false; error: string }

// All or nothing: a partial add would show a skill the payload cannot carry.
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

type CommitState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "failed"; error: string }

// The whole index is filtered in the browser. Adding fetches each skill's
// directory so the payload carries it and `--from` never reaches GitHub.
export function AddSkillDialog() {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)
  const addExternal = useCatalogStore((state) => state.addExternal)
  // Subscribed: a marketplace swap changes the categories.
  const catalog = useCatalogStore((state) => state.catalog)

  const [query, setQuery] = useState("")
  const [staged, setStaged] = useState<StagedSkill[]>([])
  const [index, setIndex] = useState<IndexState>({ status: "loading" })
  const [commit, setCommit] = useState<CommitState>({ status: "idle" })
  // Not `autoFocus`, or focus would not return to Add skill on close.
  const searchField = useRef<HTMLInputElement>(null)

  const open = dialog === "add"
  const trimmed = query.trim()
  const results =
    index.status === "ready" ? filterIndex(index.skills, trimmed) : []

  // A fresh index is kept for the session; a stale or failed one is refetched
  // on the next open, never while open.
  const settled = index.status === "ready" && index.freshness === "fresh"

  useEffect(() => {
    if (!open || settled) return

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

    // Ignored, not aborted: finishing warms the cache for the next open.
    return () => {
      live = false
    }
  }, [open, settled])

  const resultCount = results.length

  useEffect(() => {
    if (!open || !trimmed || index.status !== "ready") return

    const timer = setTimeout(() => {
      // The count, never the query: what users type stays theirs.
      track({ name: "skill_searched", resultCount })
    }, SEARCH_SETTLE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [open, trimmed, index.status, resultCount])

  // The index is kept: its freshness decides whether it is refetched.
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
    for (const skill of resolved.skills) {
      track({ name: "skill_added", fullName: skill.id })
    }
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent initialFocus={searchField}>
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

          {/* A label, so a press anywhere in the box reaches the field. */}
          <label className="mb-0.5 flex items-center gap-[0.5625rem] border border-field-border px-3">
            <span aria-hidden className="font-mono text-11 text-faint">
              ⌕
            </span>
            <Input
              variant="dialog"
              className="py-2.5"
              ref={searchField}
              value={query}
              placeholder="search external skills"
              aria-label="Search external skills"
              onChange={(event) => setQuery(event.target.value)}
            />
            <span aria-hidden className="h-[0.9375rem] w-px bg-brand" />
          </label>

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
                        // Two repositories can carry a skill of the same name.
                        aria-label={`${entry.name} from ${entry.repo}`}
                        aria-disabled={tooLarge || undefined}
                        // `title` carries the refusal the button hides.
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
                            /* Not `role="alert"`: standing content on a list. */
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
                          <span className="flex items-center gap-[0.3125rem] font-mono text-9 font-medium whitespace-nowrap text-muted-foreground">
                            <span
                              aria-hidden
                              className="block size-[0.4375rem] bg-brand"
                            />
                            {entry.repo}
                          </span>
                          {/* Chip styling without a button: the row is one. */}
                          {!tooLarge && (
                            <span
                              className={chipVariants({
                                size: "stage",
                                active: stagedHere,
                                className:
                                  "inline-flex items-center gap-[0.1875rem]",
                              })}
                            >
                              {stagedHere ? (
                                "staged"
                              ) : (
                                <>
                                  <Glyph name="plus" size={11} />
                                  stage
                                </>
                              )}
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

// A native `<select>`: the design system has no dropdown.
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
