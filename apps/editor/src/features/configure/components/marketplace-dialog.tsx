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
import { useState, type ReactNode } from "react"

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

import type { MarketplaceRecovery } from "@/features/configure/lib/use-catalog-first"
import type { Matrix } from "@workspace/matrix/matrix-schema"

// Which marketplace the grid runs on.
//
// Two fields, and only ever one of them to start with. The marketplace
// IDENTIFIES — it names the repository, and it is what a shared payload carries
// so `--from` installs the skills these ids actually name. The token only
// AUTHORIZES, so it is not on screen until an answer arrives that a token could
// change: the public case, which is everyone until an org adopts this, never
// sees a credential field at all. That progression mirrors the CLI's
// `GIGET_AUTH` walk-up, where the variable is mentioned by the 404 rather than
// asked for up front.
//
// Both are kept in localStorage and nowhere else. Never on our worker — the
// catalogue is fetched browser-direct precisely so org content never transits
// it — and never in a `VITE_` variable, which bakes into the bundle and would
// ship one org's token to every visitor.
//
// A browser may hold several, each with its own token (EDITOR-39), so this
// dialog is where one is NAMED and the switcher below is where one already
// named is chosen between. Loading a second cannot cost the first its
// credential: the token is filed under the marketplace it authorizes, and this
// form can only ever write the key it just loaded.

// The failures a token might fix. `invalid` is deliberately not one of them: a
// catalogue that will not parse comes back identical however it is authorized,
// so offering a credential there would invite a retry that cannot work.
const OFFERS_TOKEN: CatalogFailureKind = "unauthorized"

// A catalogue read and not yet seated: the ref it came from — `""` is the
// public one, exactly as the empty field that asks for it means — and the
// matrix itself. Both are carried rather than re-read, so confirming seats the
// catalogue that was DESCRIBED and not whatever the field says by then.
type Target = { marketplace: string; matrix: Matrix }

// The public catalogue as a target like any other. Clearing the field seats it
// exactly as naming a repository seats one, so it costs the selection exactly
// as much — and the vendored matrix is the one `reset` below puts back, so
// saying what it costs needs no fetch at all.
const PUBLIC_TARGET: Target = { marketplace: "", matrix: MATRIX }

// `""` is the public catalogue, exactly as the empty field that asks for it
// means. Named because the emptiness IS the statement — a bare `=== ""` read
// three times over is three chances to take it for "not filled in yet".
const isPublic = ({ marketplace }: Target) => marketplace === ""

// What to call a catalogue in the sentence that names what it costs. The public
// one has no ref to be called by, and the empty field is not a name — the same
// answer `useCatalogFirst` gives when its notices have to name one.
const catalogueName = (target: Target) =>
  isPublic(target) ? "the public catalogue" : target.marketplace

// Both presses are the same button, so the sentence has to say which of them
// has happened. `Nothing has changed` is the switcher's own answer to the same
// question, in the place a refusal answers it.
const PRESS_AGAIN = "Nothing has changed yet — press Load again to switch."

// What the next press will do, and that it has not happened yet. Two sentences
// because they are two facts: the switcher's own description of the cost, said
// in the switcher's own words, and which press is still owed.
const consequenceOf = (target: Target, selectedIds: string[]) =>
  `${switchConsequence(catalogueName(target), target.matrix, selectedIds)} ${PRESS_AGAIN}`

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  // Read, described, and waiting on the press that performs it. The owner's
  // ruling on the switcher — name the concrete consequence, and switch only on
  // the CTA — reaching the other door to the same act.
  | { status: "confirming"; target: Target; consequence: string }
  // The same shape a recovery arrives in, so a dialog opened by an arriving
  // payload starts exactly where a manual attempt that failed would have.
  | ({ status: "failed" } & CatalogFailure)

// Progressive, in both directions. The field appears when an answer says a
// token might reach the repository, and stays for as long as one is held —
// re-editing a private marketplace must not hide the credential it needs.
const offersToken = (state: LoadState, token: string) =>
  (state.status === "failed" && state.kind === OFFERS_TOKEN) || token !== ""

// The dialog's one status line, in the treatment `AddSkillDialog` uses for its
// own. `role="alert"` because it arrives after a deliberate action and is the
// only thing on screen that explains why nothing changed.
function Note({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="pt-3.5 font-mono text-10_5 text-brand-ink">
      {children}
    </p>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="block pb-1.5 font-mono text-9 font-medium tracking-[.04em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="flex items-center gap-[0.5625rem] border border-field-border px-3 py-2.5">
        {children}
      </span>
    </label>
  )
}

/**
 * The floating entry point. It belongs to no section, because which marketplace
 * is loaded is a statement about everything in the column rather than about any
 * one part of it — so it floats over the whole of it and travels with the
 * scroll.
 *
 * Sticky to the foot of the skills column, and NOT fixed to the viewport
 * (EDITOR-35). Fixed put it in the viewport's bottom-left corner, which the nav
 * rail already owns: it covered the rail's Github link outright, leaving a
 * sliver of the Octocat showing past its right edge. A constant `left` cannot
 * fix that either, because the page grid is centred once the window passes its
 * max width — the rail slides right while anything pinned to the viewport stays
 * put, so a value that clears the rail on one monitor lands on it on the next,
 * or floats out in the margin beside the page. Sticky asks the column where it
 * is instead of guessing, so this tracks the grid at every width and carries no
 * layout constant of its own.
 *
 * The STICKY ITSELF now lives one level up, on the wrapper in
 * `configure-screen.tsx` that holds this row above the docked composer. The
 * composer docks to the same column foot, so the two float as one element with
 * this as the previous sibling — which is what keeps the dock's height
 * intrinsic instead of becoming an offset somebody has to maintain here. Every
 * word above still holds: the mechanism moved, the ruling did not.
 *
 * `w-fit` because the box is over the grid: any width it does not need is a
 * strip of skill cells that cannot be clicked — and `pointer-events-auto`
 * because that wrapper switches them off for exactly this reason, so the strip
 * beside this row falls through to the cells rather than merely looking as
 * though it does.
 */
export function MarketplaceButton() {
  const setDialog = useUiStore((state) => state.setDialog)
  const marketplace = useCatalogStore((state) => state.marketplace)

  return (
    <div className="pointer-events-auto flex w-fit items-center gap-[0.5625rem]">
      <Button variant="outline" onClick={() => setDialog("marketplace")}>
        {/* The name when one is loaded, so the button doubles as the answer to
            "which catalogue am I looking at?" — the only place on screen that
            says so. */}
        Marketplace{marketplace ? ` · ${marketplace}` : ""}
      </Button>
      <MarketplaceSwitcher />
    </div>
  )
}

/**
 * The other marketplaces this browser saved, one press away.
 *
 * Beside the button that names where you are rather than inside the dialog,
 * because it answers the same question the button does and answering it should
 * not cost a dialog. It lists what the visitor SAVED and never what a link
 * brought (EDITOR-37) — so a marketplace appearing here that nobody typed would
 * be a bug on screen rather than one in storage.
 *
 * Absent below two, and that is not a special case: with one saved marketplace
 * the button already names it and there is nowhere to switch to, so a switcher
 * would be furniture over the grid — which is a strip of skill cells that
 * cannot be clicked.
 */
function MarketplaceSwitcher() {
  const saved = useMarketplaceStore((state) => state.saved)
  const current = useMarketplaceStore((state) => state.current)
  const requestMarketplace = useUiStore((state) => state.requestMarketplace)

  // The owner's condition, and it is about what is SAVED rather than about
  // what is on screen: a switcher shown when more than one exists.
  const refs = Object.keys(saved)
  if (refs.length <= 1) return null

  const others = refs.filter((marketplace) => marketplace !== current)

  return (
    <div
      role="group"
      aria-label="Saved marketplaces"
      className="flex items-center gap-[0.5625rem]"
    >
      {others.map((marketplace) => (
        <Button
          key={marketplace}
          variant="outline"
          // Asking, never switching: the confirmation names what the switch
          // costs, and the CTA in it is the only thing that performs one.
          onClick={() => requestMarketplace(marketplace)}
        >
          Switch to {marketplace}
        </Button>
      ))}
    </div>
  )
}

/**
 * The dialog shell, which owns only whether it is open.
 *
 * It owns that whichever way it was reached — the floating button, an arriving
 * payload whose catalogue could not be read, or this browser's own saved
 * marketplace failing to load on startup (EDITOR-36). One owner is what makes
 * cancelling a recovery ordinary: the dialog closes and whatever was parked
 * stays parked, so re-opening it from the button offers the same pre-filled
 * form.
 *
 * The form is a separate component and is mounted only while open, which is
 * what makes a cancelled edit disappear: its `useState` initialisers read the
 * recovery — or the saved marketplace — fresh on every open, so there is no
 * effect resetting three fields and no cascading render to reset them in.
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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader title="Marketplace" subtitle="load a skill catalogue" />
        {/* Keyed on the recovery, so a form that was opened by hand while an
            import was still fetching its catalogue is rebuilt around the
            recovery when it lands. React's own way of resetting state, and the
            reason there is still no effect resetting three fields. */}
        {open && (
          <MarketplaceForm
            key={recovery?.marketplace ?? ""}
            recovery={recovery}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MarketplaceForm({
  recovery,
  onDone,
}: {
  recovery: MarketplaceRecovery | null
  onDone: () => void
}) {
  const remember = useMarketplaceStore((state) => state.remember)
  const choosePublic = useMarketplaceStore((state) => state.choosePublic)
  const load = useCatalogStore((state) => state.load)
  const reset = useCatalogStore((state) => state.reset)
  const pruneToCatalog = useConfigStore((state) => state.pruneToCatalog)
  // The map itself, with the keys taken where they are needed. A selector
  // returning `Object.keys(...)` is a new array every time it is called, which
  // is a snapshot that never compares equal and an update loop rather than a
  // subscription — the same reason the switch dialog subscribes to the map.
  const skills = useConfigStore((state) => state.skills)

  // A recovery arrives already knowing which marketplace and already knowing
  // why it failed, so the form opens where a manual attempt would have got to:
  // the name shown rather than asked for, and the answer on screen deciding —
  // through `offersToken` — whether a credential is even worth offering.
  const [marketplace, setMarketplace] = useState(
    () => recovery?.marketplace ?? useMarketplaceStore.getState().current
  )
  // The token for the marketplace in the field above, and not merely the one
  // this browser holds. On a recovery those are different questions: the field
  // names whichever marketplace failed, and offering it somebody else's
  // credential would be a retry that could only fail the same way.
  const [token, setToken] = useState(() => tokenFor(marketplace))
  const [state, setState] = useState<LoadState>(() =>
    recovery ? { status: "failed", ...recovery.failure } : { status: "idle" }
  )

  const showToken = offersToken(state, token)

  // Naming a different repository means the credential in the box is not for
  // it. The token field holds what is saved for the name beside it or nothing
  // at all, which is the keyed slot's own invariant said on screen — a token
  // that followed whatever was typed next would be FILED under a repository it
  // was never issued for, and then presented to that repository on every later
  // read. It was invisible while the slot held one of each; it is a lie the
  // shape can no longer tell.
  const nameMarketplace = (named: string) => {
    setMarketplace(named)
    // Asked of the CANONICAL ref, because that is the key the token was filed
    // under. The field takes several spellings of one repository, and a lookup
    // on the raw one would answer "no credential held" for a repository this
    // browser holds one for — then re-file the pasted PAT under a second key.
    setToken(tokenFor(canonicalMarketplaceRef(named)))
    // A consequence describes the catalogue that was READ. Naming a different
    // one stops it describing anything, so the next press has to read again
    // rather than seat what the last press found. A refusal is left where it
    // is: it names what is wrong with the attempt being corrected.
    setState((current) =>
      current.status === "confirming" ? { status: "idle" } : current
    )
  }

  // A statement about which catalogue to show, and NEVER one about credentials.
  // Those were the same sentence while the slot held one of each, and are two
  // now: every saved token stays exactly where it was filed, because going back
  // to the public catalogue is not a reason to lose a PAT that cannot be
  // re-read anywhere.
  const seatPublic = () => {
    choosePublic()
    reset()
  }

  // Saved only once it has actually loaded. A marketplace that never resolved
  // is not one to restore on the next visit, and a token that never authorized
  // anything is a credential kept for nothing.
  //
  // And this is the ONLY place anything is saved here, which is the whole of
  // EDITOR-37 on this side: the opening seats whatever catalogue it needs and
  // stores none of it, so a marketplace reaches the slot only by someone typing
  // it into the field above. Filed UNDER the marketplace it just authorized, so
  // an address a visitor was sent cannot cost them a PAT they hold for anywhere
  // else — the one key this can write is the one in the field (EDITOR-38).
  const seatNamed = ({ marketplace: named, matrix }: Target) => {
    remember(named, token)
    load(matrix, named)
  }

  // Which parked recovery a seat finishes, and the two are not the same
  // question asked twice. A saved configuration takes its marketplace from the
  // slot that clearing the field has just emptied, so the public catalogue
  // really is its catalogue now and the restore finishes here; an arriving
  // payload names its own, which clearing a slot says nothing about, so it
  // stays parked and its notice stays on screen (EDITOR-38). A load that seated
  // some OTHER marketplace continues a parked import rather than being
  // second-guessed here: the ids the new catalogue cannot place are then named
  // on screen, which is the same answer catalogue drift already gets.
  const finishRecovery = (target: Target) =>
    isPublic(target) ? recovery?.onPublic() : recovery?.onSeated()

  // The catalogue actually seated, and everything seating one implies.
  //
  // `pruneToCatalog` is the half this door never had, and it is not a detail:
  // naming a consequence and dropping the skills named travel together. A door
  // that drops without naming is the silent loss the switcher exists to
  // prevent; a door that names without dropping leaves ids off the grid but
  // still in the install list and in every link minted from here — under a
  // marketplace ref that cannot resolve them, so the link installs a subset and
  // the sharer is never told (EDITOR-41).
  const seat = (target: Target) => {
    if (isPublic(target)) seatPublic()
    else seatNamed(target)

    pruneToCatalog()
    finishRecovery(target)
    onDone()
  }

  // Read first, seated second, and seated only by a press that already knew
  // what it would cost — the switcher's ruling, at the other door.
  //
  // A load that costs the selection nothing does both at once. That is every
  // first load of a session and every load onto a catalogue that carries what
  // is picked, so naming a consequence there would be a second press in front
  // of nothing and a sentence with no content.
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

  // Clearing the field is how someone goes back to the public catalogue — there
  // is no second control for it, because "no marketplace" is what an empty
  // marketplace field already means. It costs the selection exactly what naming
  // a repository costs it, so it is read and described exactly as one.
  const submit = async () => {
    // Normalised here, at the one door a visitor types a ref through. What is
    // seated, filed and minted is this string, so the spelling the field
    // happens to have taken stops mattering the moment Load is pressed.
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

  // The one primary action, and which of its two presses this is turns on the
  // state alone: a catalogue already read and described is seated, and anything
  // else is read.
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
            // The caret goes to whichever field is the open question. Naming
            // the repository is that question until an answer says a token
            // might reach it — and for a recovery it never is, because the
            // payload already named it.
            autoFocus={!showToken}
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
              // Focused the moment it appears, because by then it is the only
              // thing left to supply — the repository is already named, and on
              // a recovery it was never asked for.
              autoFocus
              // A credential, so the browser must not offer it back as an
              // autofill suggestion in some other field.
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

        {/* One status line, whichever thing it has to say. A refusal and a
            consequence can never be on screen together — the state is a union
            — so they share the treatment rather than stacking. */}
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
        {/* One primary action, always named for what it does: the press that
            reads a catalogue and the press that seats it are the same Load.
            The line above says which of them has happened, so the button does
            not have to change its word to be honest — and the switcher's rule
            still holds, because seating happens on a press that had the
            consequence in front of it. */}
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
