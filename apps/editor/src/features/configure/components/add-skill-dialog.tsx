import { CATALOG } from "@workspace/matrix"
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
  fetchSkillIndex,
  formatStars,
  type IndexFreshness,
} from "@/lib/api/skill-index"
import {
  addedSkillId,
  categoriseRepo,
  monogramFor,
  useAddedSkillsStore,
  type AddedSkill,
} from "@/stores/added-skills-store"
import { useUiStore } from "@/stores/ui-store"

import type { SkillIndexEntry } from "@workspace/matrix/skill-index"

// Filtering is instant — the whole index is in memory — so this delay is the
// analytics' own rather than the search's: a funnel wants one event per
// search, not one per keystroke.
const SEARCH_SETTLE_MS = 350

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
}: {
  children: ReactNode
  alert?: boolean
}) {
  return (
    <p
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

const toAddedSkill = (entry: SkillIndexEntry): AddedSkill => ({
  id: addedSkillId(skillCoordinate(entry)),
  displayName: entry.name,
  // The index serves an empty description where the SKILL.md offered neither
  // frontmatter nor a heading — a thin result rather than an invalid one.
  description: entry.description || "Added from GitHub",
  monogram: monogramFor(entry.name),
  repo: entry.repo,
  path: entry.path,
  ...categoriseRepo(entry.repo),
})

const categoryLabel = (skill: AddedSkill) => {
  if (!skill.categoryId) return "uncategorized"

  const category = CATALOG.categoriesById[skill.categoryId]
  return `${skill.domainId} / ${category?.displayName.toLowerCase() ?? skill.categoryId}`
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

// The whole external index arrives in one response and is filtered here, in
// the browser — which is what removes the request per keystroke, the debounce
// and the rate limit the old repository search had to design around.
//
// The destination category comes from the marketplace index and is not
// editable. Added skills live for this session only.
export function AddSkillDialog() {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)
  const addSkills = useAddedSkillsStore((state) => state.add)

  const [query, setQuery] = useState("")
  const [staged, setStaged] = useState<AddedSkill[]>([])
  const [index, setIndex] = useState<IndexState>({ status: "loading" })

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
  }

  const toggleStage = (entry: SkillIndexEntry) => {
    const skill = toAddedSkill(entry)
    setStaged((current) =>
      current.some((item) => item.id === skill.id)
        ? current.filter((item) => item.id !== skill.id)
        : [...current, skill]
    )
  }

  const commit = () => {
    addSkills(staged)
    // Repository names, which are public by definition — this is what the
    // catalog is missing, in the words of the people reaching outside it.
    for (const skill of staged) {
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
            <div className="flex flex-wrap gap-[0.3125rem] pb-3">
              {staged.map((skill) => (
                <span
                  key={skill.id}
                  className={`flex items-center gap-[0.4375rem] border border-brand-border bg-wash px-[0.4375rem] py-1 font-mono text-9 font-medium tracking-[.04em] text-brand-ink`}
                >
                  {skill.displayName}
                  <em
                    className={`text-8_5 not-italic ${
                      skill.categoryId
                        ? "text-muted-foreground"
                        : "text-brand-ink"
                    }`}
                  >
                    · {categoryLabel(skill)}
                  </em>
                  <button
                    type="button"
                    aria-label={`Remove ${skill.displayName}`}
                    onClick={() =>
                      setStaged((current) =>
                        current.filter((item) => item.id !== skill.id)
                      )
                    }
                    className="cursor-pointer text-brand-dim hover:text-ink"
                  >
                    ✕
                  </button>
                </span>
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

          {index.status === "ready" && (
            <>
              {index.freshness === "stale" && (
                <Note>index still filling — more skills may appear</Note>
              )}

              {results.length === 0 ? (
                <Note>no skills match</Note>
              ) : (
                <LatticeRows className="mt-3.5">
                  {results.map((entry) => {
                    const id = addedSkillId(skillCoordinate(entry))
                    const isStaged = staged.some((item) => item.id === id)
                    return (
                      <LatticeRow
                        key={id}
                        selected={isStaged}
                        onClick={() => toggleStage(entry)}
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
                              button. The shared CVA keeps the two in step. */}
                          <span
                            className={chipVariants({
                              size: "stage",
                              active: isStaged,
                            })}
                          >
                            {isStaged ? "staged" : "＋ stage"}
                          </span>
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
            category comes from the marketplace index; anything unmatched lands
            in <em className="text-ink not-italic">Uncategorized</em>
          </DialogFooterNote>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={staged.length === 0}
            onClick={commit}
          >
            Add {staged.length} skill{staged.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
