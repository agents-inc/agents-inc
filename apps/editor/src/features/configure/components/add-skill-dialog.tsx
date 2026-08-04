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
  abbreviateLanguage,
  formatStars,
  searchSkillRepos,
  type SkillRepo,
} from "@/lib/api/github-skills"
import {
  addedSkillId,
  categoriseRepo,
  monogramFor,
  useAddedSkillsStore,
  type AddedSkill,
} from "@/stores/added-skills-store"
import { useUiStore } from "@/stores/ui-store"

const DEBOUNCE_MS = 350

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

const repoName = (fullName: string) => fullName.split("/").pop() ?? fullName

const toAddedSkill = (repo: SkillRepo): AddedSkill => {
  const name = repoName(repo.fullName)

  return {
    id: addedSkillId(repo.fullName),
    displayName: name,
    description: repo.description || "Added from GitHub",
    monogram: monogramFor(name),
    repo: repo.fullName,
    ...categoriseRepo(repo.fullName),
  }
}

const categoryLabel = (skill: AddedSkill) => {
  if (!skill.categoryId) return "uncategorized"

  const category = CATALOG.categoriesById[skill.categoryId]
  return `${skill.domainId} / ${category?.displayName.toLowerCase() ?? skill.categoryId}`
}

// The destination category comes from the marketplace index and is not
// editable. Added skills live for this session only.
export function AddSkillDialog() {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)
  const addSkills = useAddedSkillsStore((state) => state.add)

  const [query, setQuery] = useState("")
  const [staged, setStaged] = useState<AddedSkill[]>([])
  // Results carry the query they answered, which removes the need for a
  // `loading` flag and stops a slow response landing under a newer query.
  const [results, setResults] = useState<{
    query: string
    repos: SkillRepo[]
    error: string | null
  }>({ query: "", repos: [], error: null })

  const open = dialog === "add"
  const trimmed = query.trim()
  const settled = results.query === trimmed
  const loading = trimmed !== "" && !settled

  useEffect(() => {
    if (!open || !trimmed) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      void searchSkillRepos(trimmed, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        setResults(
          result.ok
            ? { query: trimmed, repos: result.repos, error: null }
            : { query: trimmed, repos: [], error: result.error }
        )

        // The count, never the query. A search that returns nothing is
        // someone asking the catalog for a skill it does not have, which is
        // the closest thing here to a feature request — but the words they
        // typed are theirs, and are the one free-text field in the app.
        if (result.ok) {
          track({ name: "skill_searched", resultCount: result.repos.length })
        }
      })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, open])

  const close = () => {
    setDialog("none")
    setQuery("")
    setStaged([])
    setResults({ query: "", repos: [], error: null })
  }

  const toggleStage = (repo: SkillRepo) => {
    const skill = toAddedSkill(repo)
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
              placeholder="search github"
              aria-label="Search GitHub"
              onChange={(event) => setQuery(event.target.value)}
            />
            <span aria-hidden className="h-[0.9375rem] w-px bg-brand" />
          </div>

          {loading && (
            <p className="pt-3.5 font-mono text-10_5 text-muted-foreground">
              searching…
            </p>
          )}

          {settled && results.error && (
            <p className="pt-3.5 font-mono text-10_5 text-brand-ink">
              {results.error}
            </p>
          )}

          {settled && !results.error && results.repos.length > 0 && (
            <LatticeRows className="mt-3.5">
              {results.repos.map((repo) => {
                const id = addedSkillId(repo.fullName)
                const isStaged = staged.some((item) => item.id === id)
                return (
                  <LatticeRow
                    key={repo.fullName}
                    selected={isStaged}
                    onClick={() => toggleStage(repo)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-11_5 font-semibold text-ink">
                        <Highlight text={repo.fullName} term={query} />
                      </div>
                      {repo.description && (
                        <div className="pt-[0.1875rem] text-10_5 leading-[1.4] text-muted-foreground">
                          {repo.description}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-none items-center gap-3 pt-0.5">
                      <span className="font-mono text-9 font-medium whitespace-nowrap text-muted-foreground">
                        {formatStars(repo.stars)} ★
                      </span>
                      {repo.language && (
                        <span className="flex items-center gap-[0.3125rem] font-mono text-9 font-medium whitespace-nowrap text-muted-foreground">
                          <span
                            aria-hidden
                            className="block size-[0.4375rem] bg-brand"
                          />
                          {abbreviateLanguage(repo.language)}
                        </span>
                      )}
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
