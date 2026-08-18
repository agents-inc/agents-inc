import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogPane,
  DialogPaneHeading,
  DialogPanes,
} from "@workspace/ui/components/dialog"
import { useState } from "react"

import {
  toSkillContents,
  type SkillContents,
} from "@/features/configure/lib/derive"
import { useCatalogStore } from "@/stores/catalog-store"
import { useUiStore } from "@/stores/ui-store"

// What an added skill actually holds, before anyone installs it.
//
// This is a REQUIREMENT of the EDITOR-03 inline-content ruling rather than a
// nicety. A shared id carries a third party's files and the CLI writes them to
// disk, so someone opening a colleague's link is about to put a stranger's
// content on their machine — and being able to READ it first is what makes
// carrying it acceptable. The reader this is designed for is that person.
//
// A pure rendering surface: the bytes are seated by the time anything renders,
// whether the skill was added this session or arrived in a payload
// (`adoptSeedPayload` seats a payload's `external` map before the first paint),
// so there is no fetch here, no state of its own and no schema to extend.
//
// ── The rendering-safety decision ────────────────────────────────────────
//
// The content is UNTRUSTED THIRD-PARTY TEXT, and it is rendered as text: a
// `<pre>` holding one JSX expression, which React escapes. No markdown
// renderer, no sanitiser to configure and get wrong, and no
// `dangerouslySetInnerHTML` anywhere on this path. A SKILL.md carrying
// `<img src=x onerror=…>` renders those characters and nothing happens.
//
// Plain monospace is not a compromise here, it is the better answer twice
// over: a markdown renderer would be a new dependency whose escaping is the
// only thing standing between a stranger's repository and this origin, and it
// would also HIDE things — a rendered `[text](javascript:…)` shows its label
// and not its target, and rendered frontmatter disappears into a rule. What
// the CLI will write to disk is exactly what is on screen.

export function SkillContentsDialog() {
  const skillId = useUiStore((state) => state.previewSkillId)
  const previewSkill = useUiStore((state) => state.previewSkill)
  // Subscribed rather than read through `activeExternalSkill`: that is the
  // non-React reader, and the seat's arrangement is that components subscribe
  // with a selector and re-render on a swap. Atomic, so the reference is
  // stable — a marketplace load drops external skills, and this closes with
  // them rather than showing content the catalogue no longer has.
  const skill = useCatalogStore((state) =>
    skillId === null ? undefined : state.external[skillId]
  )

  return (
    <Dialog
      open={skill !== undefined}
      onOpenChange={(next) => !next && previewSkill(null)}
    >
      {/* Wider than `wide`, which is the widest the shell otherwise goes, and
          the reason is measure. A SKILL.md is a DOCUMENT: at the install
          dialog's width the body column takes about 74 monospace characters,
          which wraps roughly every second line of real markdown — checked by
          hand against `obra/superpowers`. This is the one dialog whose whole
          job is to be read, so it gets the width to be read at. */}
      <DialogContent className="w-[46rem]">
        {/* Keyed by the skill, so opening a second one starts at its own
            SKILL.md rather than at whichever file the last reader left open. */}
        {skill && <Contents key={skill.id} contents={toSkillContents(skill)} />}
      </DialogContent>
    </Dialog>
  )
}

function Contents({ contents }: { contents: SkillContents }) {
  const { displayName, coordinate, files } = contents
  const [chosenPath, setChosenPath] = useState<string | null>(null)
  // The head of the list is SKILL.md — `inReadingOrder` puts it there — so
  // "what opens first" is answered by the order and not named twice.
  const openFile = files.find((file) => file.path === chosenPath) ?? files[0]

  return (
    <>
      {/* Provenance in the subtitle, where the install dialog puts the
          marketplace and the stack: it is the standing fact about what is on
          screen, and it is what a reader deciding whether to trust this is
          actually asking. The whole coordinate, because one repository holds
          many skills and the owner is the informative half. */}
      <DialogHeader
        title="Contents"
        subtitle={
          <>
            <em className="text-ink not-italic">{displayName}</em>
            {" · "}
            {coordinate}
          </>
        }
      />

      {/* A floor rather than a height: `flex-1` grows this to whatever the
          shell's `max-h` allows, which is what a document wants, and the
          minimum stops a two-file skill collapsing the sheet — otherwise the
          Close button moves under the cursor as files are picked. `h-` alone
          would be dead code here; the flex basis wins, which the hand-drive is
          how I found out.

          Each pane then scrolls on its own: a long SKILL.md must not carry the
          file list off the top of the dialog with it. */}
      <DialogPanes className="min-h-[26rem] overflow-hidden">
        <DialogPane side="left" className="overflow-auto">
          {/* Not uppercased, unlike every other pane heading — a path is
              case-sensitive and `REFERENCE/PROMPTS.MD` names no file. */}
          <DialogPaneHeading className="normal-case">
            <span data-slot="contents-open-path">{openFile?.path}</span>
          </DialogPaneHeading>

          {openFile && (
            <pre
              data-slot="contents-body"
              className="font-mono text-10 leading-[1.7] wrap-break-word whitespace-pre-wrap text-ink-2"
            >
              {openFile.text}
            </pre>
          )}
        </DialogPane>

        <DialogPane side="right" className="overflow-auto">
          <DialogPaneHeading>Files</DialogPaneHeading>
          {/* Named, so the set is delimited for a reader who cannot see the
              heading beside it — the same treatment a category gets in the
              grid. Buttons rather than tabs: each is independently reachable,
              which is what an eight-file directory wants, and `aria-current`
              is the one thing a tablist would add that this needs. */}
          <div role="group" aria-label="Files" className="flex flex-col">
            {files.map((file) => {
              const showing = file.path === openFile?.path
              return (
                <button
                  key={file.path}
                  type="button"
                  data-slot="contents-file"
                  aria-current={showing}
                  onClick={() => setChosenPath(file.path)}
                  // Wrapped, never truncated. A real directory holds
                  // `condition-based-waiting.md` beside
                  // `condition-based-waiting-example.ts`, and truncation renders
                  // those two as the same string — a file list nobody can pick
                  // from, in a dialog that exists to be read. Found by hand
                  // against the real repository.
                  className={`cursor-pointer py-[0.1875rem] text-left font-mono text-10 leading-[1.5] wrap-break-word outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                    showing
                      ? "text-brand-ink"
                      : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {file.path}
                </button>
              )
            })}
          </div>
        </DialogPane>
      </DialogPanes>

      <DialogFooter>
        {/* One line, like every other footer note, and the word "install" is
            deliberately not in it: two dialogs are open at once whenever this
            was reached from Install, and the specs tell them apart by text. */}
        <DialogFooterNote>
          <em className="text-ink not-italic">{files.length}</em> files ·
          somebody else&apos;s content, shown exactly as it will be ejected
        </DialogFooterNote>
        <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
      </DialogFooter>
    </>
  )
}
