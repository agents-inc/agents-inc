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
import { useId, useState } from "react"

import {
  toSkillContents,
  type SkillContents,
} from "@/features/configure/lib/derive"
import { useCatalogStore } from "@/stores/catalog-store"
import { useUiStore } from "@/stores/ui-store"

// An added skill's files are untrusted third-party text, so they render as
// escaped text in a `<pre>`: no markdown renderer, no
// `dangerouslySetInnerHTML`, and nothing hidden from what the CLI will write.

export function SkillContentsDialog() {
  const skillId = useUiStore((state) => state.previewSkillId)
  const previewSkill = useUiStore((state) => state.previewSkill)
  // Subscribed, so a marketplace load that drops external skills closes this.
  const skill = useCatalogStore((state) =>
    skillId === null ? undefined : state.external[skillId]
  )

  return (
    <Dialog
      open={skill !== undefined}
      onOpenChange={(next) => !next && previewSkill(null)}
    >
      {/* Wider than `wide`: a SKILL.md wraps too often at narrower widths. */}
      <DialogContent className="w-[46rem]">
        {/* Keyed, so a second skill opens at its own SKILL.md. */}
        {skill && <Contents key={skill.id} contents={toSkillContents(skill)} />}
      </DialogContent>
    </Dialog>
  )
}

function Contents({ contents }: { contents: SkillContents }) {
  const { displayName, coordinate, files } = contents
  const [chosenPath, setChosenPath] = useState<string | null>(null)
  const openPathId = useId()
  // `inReadingOrder` puts SKILL.md first.
  const openFile = files.find((file) => file.path === chosenPath) ?? files[0]

  return (
    <>
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

      {/* A floor, not a height (the flex basis wins), so Close stays put as
          files are picked. Each pane scrolls on its own. */}
      <DialogPanes className="min-h-[26rem] overflow-hidden">
        {/* The text holds nothing to focus, so the pane is what the keyboard
            scrolls, named by the path it shows. */}
        <DialogPane
          side="left"
          role="region"
          aria-labelledby={openPathId}
          tabIndex={0}
          className="overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {/* Not uppercased: a path is case-sensitive. */}
          <DialogPaneHeading className="normal-case">
            <span id={openPathId} data-slot="contents-open-path">
              {openFile?.path}
            </span>
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
                  // Wrapped, never truncated: truncation makes sibling paths
                  // with a shared prefix read the same.
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
        {/* No "install" here: specs tell the two dialogs apart by text. */}
        <DialogFooterNote>
          <em className="text-ink not-italic">{files.length}</em> files ·
          somebody else&apos;s content, shown exactly as it will be ejected
        </DialogFooterNote>
        <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
      </DialogFooter>
    </>
  )
}
