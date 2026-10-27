import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { useId, useRef, useState, type FormEvent, type RefObject } from "react"

import type { ConfigSelection } from "@/features/configure/lib/derive"
import {
  validateSaveName,
  type SaveNameProblem,
} from "@/features/configure/lib/save-name"
import {
  SAVE_NARRATIONS,
  saveStack,
  useLocalSavesOnGrid,
  type SaveOutcome,
  type SaveRefusal,
} from "@/features/configure/lib/save-stack"
import { toSeedPayload } from "@/features/configure/lib/seed"
import { useAccountStore } from "@/stores/account-store"
import { useCatalogStore } from "@/stores/catalog-store"
import { useSavedStackStore, type SavedStack } from "@/stores/saved-stack-store"
import { useUiStore } from "@/stores/ui-store"

import { FIELD_INSET, Field, Note } from "./dialog-field"
import {
  CLEARED_SCRATCH_NAME,
  SCRATCH_NAME,
  STACKS_GRID,
  StackListNotice,
} from "./stack-grid"

const PROBLEM_SENTENCES = {
  empty: () => "Give this stack a name.",
  "too-long": () => "Keep the name to 80 characters or fewer.",
  taken: (name: string) =>
    `Names must be unique. There's already a stack called “${name}”.`,
} as const satisfies Record<SaveNameProblem, (name: string) => string>

type Failure = SaveNameProblem | SaveRefusal

const failureOf = (outcome: Exclude<SaveOutcome, { ok: true }>): Failure =>
  "refusal" in outcome ? outcome.refusal : outcome.problem

const isProblem = (failure: Failure): failure is SaveNameProblem =>
  failure in PROBLEM_SENTENCES

const sentenceFor = (failure: Failure, typed: string) =>
  isProblem(failure)
    ? PROBLEM_SENTENCES[failure](typed.trim())
    : SAVE_NARRATIONS[failure]

// Save waits for the account's list only until one is read.
const standingRefusal = (refused: Failure | null, listUnread: boolean) =>
  refused === "list-unread" && !listUnread ? null : refused

// An owed save is renamed locally too, so every local name is taken then.
const useTakenNames = (owed: SavedStack | undefined) => {
  const onGrid = useLocalSavesOnGrid()
  const everyLocal = useSavedStackStore((state) => state.saves)
  const accountStacks = useAccountStore((state) => state.stacks)
  const catalogue = useCatalogStore((state) => state.stacks)
  const localSaves = owed ? everyLocal : onGrid

  return [
    SCRATCH_NAME,
    CLEARED_SCRATCH_NAME,
    ...[...localSaves, ...accountStacks, ...catalogue].map(
      (stack) => stack.name
    ),
  ]
}

// The two switch confirms open outside `dialog`.
const useOwedToAsk = () => {
  const firstClash = useAccountStore((state) => state.clashes[0])
  const clashing = useSavedStackStore((state) =>
    state.saves.find((save) => save.id === firstClash)
  )
  const anotherModalOpen = useUiStore(
    (state) =>
      state.dialog !== "none" ||
      state.pendingStack !== null ||
      state.pendingMarketplace !== null
  )

  return anotherModalOpen ? undefined : clashing
}

// An owed save has no opener to go back to. Base UI would pass over the grid,
// no Tab stop, to its first cell, which may clear the selection; so the grid
// is focused here and Base UI moves nothing. Folded away, its default stands.
const handKeyboardToStacks = () => {
  const grid = document.querySelector<HTMLElement>(`[${STACKS_GRID}]`)
  if (!grid) return true

  grid.focus()
  return false
}

export function SaveStackDialog({ config }: { config: ConfigSelection }) {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)
  const signedIn = useAccountStore((state) => state.session !== null)
  const defer = useAccountStore((state) => state.defer)
  const owed = useOwedToAsk()
  // Not `autoFocus`, or focus would not return to Save on close.
  const nameInput = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const asksOwed = owed !== undefined
  const open = dialog === "save" || asksOwed
  // Held past the close, which takes the save off the queue before Base UI
  // asks where the keyboard goes.
  const [closesOnStacks, setClosesOnStacks] = useState(asksOwed)
  if (open && closesOnStacks !== asksOwed) setClosesOnStacks(asksOwed)

  const cancel = () => (owed ? defer(owed.id) : setDialog("none"))
  // A carried owed save has already left the queue.
  const done = () => {
    if (!owed) setDialog("none")
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && cancel()}>
      <DialogContent
        initialFocus={nameInput}
        finalFocus={closesOnStacks ? handKeyboardToStacks : true}
      >
        <DialogHeader title="Save stack" subtitle="keep this setup by name" />
        {open && (
          <SaveStackForm
            config={config}
            owed={owed}
            nameInput={nameInput}
            saving={saving}
            onSaving={setSaving}
            onDone={done}
            onCancel={cancel}
            footerNote={
              signedIn ? "kept in your account" : "kept in this browser"
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type Draft = {
  typed: string
  // Off while a save runs, or the name it just took would read as taken.
  checking: boolean
  refused: Failure | null
}

const draftFor = (owed: SavedStack | undefined): Draft => ({
  typed: owed?.name ?? "",
  checking: owed !== undefined,
  refused: null,
})

function SaveStackForm({
  config,
  owed,
  nameInput,
  saving,
  onSaving,
  onDone,
  onCancel,
  footerNote,
}: {
  config: ConfigSelection
  owed: SavedStack | undefined
  nameInput: RefObject<HTMLInputElement | null>
  saving: boolean
  onSaving: (saving: boolean) => void
  onDone: () => void
  onCancel: () => void
  footerNote: string
}) {
  const taken = useTakenNames(owed)
  const carryRenamed = useAccountStore((state) => state.carryRenamed)
  const listUnread = useAccountStore((state) => state.listRefusal !== null)
  const messageId = useId()
  const [draft, setDraft] = useState(() => draftFor(owed))
  // Reset in place, not remounted, so focus stays in the field.
  const [askingAbout, setAskingAbout] = useState(owed?.id)
  if (askingAbout !== owed?.id) {
    setAskingAbout(owed?.id)
    setDraft(draftFor(owed))
  }

  const { typed, checking, refused } = draft
  const checked = validateSaveName(typed, taken)
  const problem = checking && !checked.ok ? checked.problem : null
  const failure = problem ?? standingRefusal(refused, listUnread)
  const waitsForList = failure === "list-unread"
  // Every failure but the wait is a sentence describing the field; a name the
  // account refused marks it invalid, as one refused here does.
  const said = waitsForList ? null : failure

  const rename = (next: string) =>
    setDraft((current) => ({ ...current, typed: next, refused: null }))

  const saveUnder = (name: string): Promise<SaveOutcome> =>
    owed ? carryRenamed(owed, name) : saveStack(name, toSeedPayload(config))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return

    setDraft({ ...draft, checking: !checked.ok, refused: null })
    if (!checked.ok) return

    onSaving(true)
    const outcome = await saveUnder(checked.name)
    onSaving(false)
    if (outcome.ok) return onDone()

    setDraft({ ...draft, checking: true, refused: failureOf(outcome) })
  }

  return (
    <form className="contents" onSubmit={(event) => void submit(event)}>
      <DialogBody>
        <Field label="Name">
          <Input
            ref={nameInput}
            variant="dialog"
            className={FIELD_INSET}
            value={typed}
            placeholder="e.g. client work"
            aria-label="Name"
            aria-invalid={said !== null && isProblem(said)}
            aria-describedby={said ? messageId : undefined}
            autoComplete="off"
            readOnly={saving}
            onChange={(event) => rename(event.target.value)}
          />
        </Field>

        {said && (
          <div id={messageId}>
            <Note>{sentenceFor(said, typed)}</Note>
          </div>
        )}
        {/* The grid's Retry, since the modal hides it. The field takes the
            keyboard once the list reads, so it stays in the dialog. */}
        {waitsForList && (
          <StackListNotice
            slot="save-list-notice"
            className="pt-3.5"
            words={SAVE_NARRATIONS["list-unread"]}
            handsKeyboardTo={nameInput}
          />
        )}
      </DialogBody>

      <DialogFooter>
        <DialogFooterNote>{footerNote}</DialogFooterNote>
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}
