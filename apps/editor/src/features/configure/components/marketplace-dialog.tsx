import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
} from "@workspace/ui/components/dialog"
import { MATRIX } from "@workspace/matrix"
import { Input } from "@workspace/ui/components/input"
import { useRef, useState, type RefObject } from "react"

import {
  dropsSelection,
  switchConsequence,
} from "@/features/configure/lib/marketplace-switch"
import {
  canonicalMarketplaceRef,
  fetchCatalog,
  type CatalogFailure,
  type CatalogFailureKind,
} from "@/lib/api/catalog"
import { useCatalogStore } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { tokenFor, useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"

import { FIELD_INSET, Field, Note } from "./dialog-field"

import type { MarketplaceRecovery } from "@/features/configure/lib/use-catalog-first"
import type { Matrix } from "@workspace/matrix/matrix-schema"

// Which marketplace the grid runs on. The marketplace identifies; the token
// only authorizes, so its field appears only once an answer says a token could
// help. Both live in localStorage, never on our worker or in a `VITE_`
// variable. Each token is filed under the marketplace it authorizes
// (EDITOR-39).

// `invalid` is not offered a token: a catalogue that will not parse fails the
// same however it is authorized.
const OFFERS_TOKEN: CatalogFailureKind = "unauthorized"

// A catalogue read and not yet seated, carried so confirming seats what was
// described rather than whatever the field says by then. `""` is public.
type Target = { marketplace: string; matrix: Matrix }

const PUBLIC_TARGET: Target = { marketplace: "", matrix: MATRIX }

const isPublic = ({ marketplace }: Target) => marketplace === ""

const catalogueName = (target: Target) =>
  isPublic(target) ? "the public catalogue" : target.marketplace

const PRESS_AGAIN = "Nothing has changed yet — press Load again to switch."

const consequenceOf = (target: Target, selectedIds: string[]) =>
  `${switchConsequence(catalogueName(target), target.matrix, selectedIds)} ${PRESS_AGAIN}`

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  // Read and described, waiting on the press that seats it.
  | { status: "confirming"; target: Target; consequence: string }
  // The shape a recovery arrives in, so a payload's dialog opens where a
  // failed manual attempt would have got to.
  | ({ status: "failed" } & CatalogFailure)

// Shown once an answer says a token might help, and kept while one is held.
const offersToken = (state: LoadState, token: string) =>
  (state.status === "failed" && state.kind === OFFERS_TOKEN) || token !== ""

/**
 * The shell owns only whether it is open, however it was reached (the rail,
 * an arriving payload, or a saved marketplace failing at startup, EDITOR-36),
 * so cancelling a recovery leaves it parked. The form mounts only while open,
 * so its initial state is read fresh each time.
 */
export function MarketplaceDialog({
  recovery,
}: {
  recovery: MarketplaceRecovery | null
}) {
  const dialog = useUiStore((state) => state.dialog)
  const setDialog = useUiStore((state) => state.setDialog)

  const open = dialog === "marketplace"
  const close = () => setDialog("none")

  // Handed to the dialog rather than `autoFocus`-ed: a field focused as it
  // mounts is focused before the dialog records where focus goes back to.
  const openQuestion = useRef<HTMLInputElement>(null)
  // Once open, a field that arrives later (the token) may take focus on mount.
  const [opened, setOpened] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      onOpenChangeComplete={setOpened}
    >
      <DialogContent initialFocus={openQuestion}>
        <DialogHeader title="Marketplace" subtitle="load a skill catalogue" />
        {/* Keyed on the recovery, so one landing while the form is open
            rebuilds it. */}
        {open && (
          <MarketplaceForm
            key={recovery?.marketplace ?? ""}
            recovery={recovery}
            onDone={close}
            openQuestion={openQuestion}
            focusOnArrival={opened}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MarketplaceForm({
  recovery,
  onDone,
  openQuestion,
  focusOnArrival,
}: {
  recovery: MarketplaceRecovery | null
  onDone: () => void
  openQuestion: RefObject<HTMLInputElement | null>
  focusOnArrival: boolean
}) {
  const remember = useMarketplaceStore((state) => state.remember)
  const choosePublic = useMarketplaceStore((state) => state.choosePublic)
  const load = useCatalogStore((state) => state.load)
  const reset = useCatalogStore((state) => state.reset)
  const pruneToCatalog = useConfigStore((state) => state.pruneToCatalog)
  // The map, not `Object.keys(...)`: a fresh array per call never compares
  // equal and loops the subscription.
  const skills = useConfigStore((state) => state.skills)

  const [marketplace, setMarketplace] = useState(
    () => recovery?.marketplace ?? useMarketplaceStore.getState().current
  )
  // The token for the marketplace in the field, which on a recovery is not
  // the one this browser last used.
  const [token, setToken] = useState(() => tokenFor(marketplace))
  const [state, setState] = useState<LoadState>(() =>
    recovery ? { status: "failed", ...recovery.failure } : { status: "idle" }
  )

  const showToken = offersToken(state, token)

  // A different repository gets its own filed token or none, so a credential
  // is never filed under a repository it was not issued for. Looked up by the
  // canonical ref, the key tokens are filed under. A described consequence no
  // longer describes anything; a refusal stays.
  const nameMarketplace = (named: string) => {
    setMarketplace(named)
    setToken(tokenFor(canonicalMarketplaceRef(named)))
    setState((current) =>
      current.status === "confirming" ? { status: "idle" } : current
    )
  }

  // Never touches saved tokens: a PAT cannot be read back from anywhere.
  const seatPublic = () => {
    choosePublic()
    reset()
  }

  // The only place a marketplace is remembered, and only once it has loaded
  // (EDITOR-37, EDITOR-38).
  const seatNamed = ({ marketplace: named, matrix }: Target) => {
    remember(named, token)
    load(matrix, named)
  }

  // A saved configuration's marketplace was the slot just cleared, so public
  // finishes it; an arriving payload names its own and stays parked
  // (EDITOR-38).
  const finishRecovery = (target: Target) =>
    isPublic(target) ? recovery?.onPublic() : recovery?.onSeated()

  // Naming a consequence and dropping the skills it names travel together
  // (EDITOR-41).
  const seat = (target: Target) => {
    if (isPublic(target)) seatPublic()
    else seatNamed(target)

    pruneToCatalog()
    finishRecovery(target)
    onDone()
  }

  // A load that drops nothing seats at once; one that would asks first.
  const readCatalogue = (target: Target) => {
    const selectedIds = Object.keys(skills)
    if (!dropsSelection(target.matrix, selectedIds)) {
      seat(target)
      return
    }

    setState({
      status: "confirming",
      target,
      consequence: consequenceOf(target, selectedIds),
    })
  }

  // An empty field is the public catalogue.
  const submit = async () => {
    const named = canonicalMarketplaceRef(marketplace)
    if (!named) {
      readCatalogue(PUBLIC_TARGET)
      return
    }

    setState({ status: "loading" })
    const result = await fetchCatalog(named, token || undefined)

    if (!result.ok) {
      setState({ status: "failed", kind: result.kind, error: result.error })
      return
    }

    readCatalogue({ marketplace: named, matrix: result.matrix })
  }

  const press = () => {
    if (state.status === "confirming") {
      seat(state.target)
      return
    }

    void submit()
  }

  return (
    <>
      <DialogBody>
        <Field label="Marketplace">
          <Input
            variant="dialog"
            className={FIELD_INSET}
            ref={showToken ? undefined : openQuestion}
            autoFocus={focusOnArrival && !showToken}
            value={marketplace}
            placeholder="owner/repo"
            aria-label="Marketplace"
            onChange={(event) => nameMarketplace(event.target.value)}
          />
        </Field>

        {showToken && (
          <Field label="Access token">
            <Input
              variant="dialog"
              className={FIELD_INSET}
              ref={openQuestion}
              autoFocus={focusOnArrival}
              type="password"
              autoComplete="off"
              value={token}
              placeholder="ghp_… (repo scope)"
              aria-label="Access token"
              onChange={(event) => setToken(event.target.value)}
            />
          </Field>
        )}

        {state.status === "loading" && (
          <p className="pt-3.5 font-mono text-10_5 text-muted-foreground">
            loading catalogue…
          </p>
        )}

        {state.status === "confirming" && <Note>{state.consequence}</Note>}
        {state.status === "failed" && <Note>{state.error}</Note>}
      </DialogBody>

      <DialogFooter>
        <DialogFooterNote>
          fetched straight from GitHub — the token stays in this browser and
          never reaches our servers
        </DialogFooterNote>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        {/* One Load for both presses; the line above says which happened. */}
        <Button
          variant="primary"
          disabled={state.status === "loading"}
          onClick={press}
        >
          Load
        </Button>
      </DialogFooter>
    </>
  )
}
