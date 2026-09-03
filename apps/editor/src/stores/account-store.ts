import {
  installableSeedPayloadSchema,
  type SeedPayload,
} from "@workspace/matrix"
import { create } from "zustand"

import { createSharedConfig, type ShareRefusal } from "@/lib/api/configs"
import { readSession, type Session } from "@/lib/api/auth"
import {
  createStack,
  listStacks,
  type RemoteStack,
  type StackRefusal,
  type StackResult,
} from "@/lib/api/stacks"
import {
  SAVED_STACK_NAME,
  useSavedStackStore,
} from "@/stores/saved-stack-store"

/**
 * Why a first sign-in could not carry the local snapshot into the account.
 *
 * Adoption is a mint and then a write, so it ends at whichever refused — the
 * same two clients a signed-in Save goes through, and so the same two refusal
 * sets. Words are deliberately not decided here: what a person is told belongs
 * to the surface still drawing their snapshot, which is the grid.
 */
export type AdoptionRefusal = ShareRefusal | StackRefusal

// Who is signed in and what they have saved.
//
// NOT persisted, and that is the difference between this store and every other
// one here. The session is a cookie the browser already holds and the worker is
// the only thing that can say whether it is still good — a copy in localStorage
// would be a second answer to that question, and the stale half would draw a
// signed-in rail for somebody who is not.
type AccountState = {
  session: Session
  stacks: RemoteStack[]
  // Why the snapshot this browser holds is not in the account, and `null` both
  // when it was adopted and when there was never one to adopt. The grid reads
  // it to decide whether to keep drawing the local slot, so it is the
  // difference between seeing your work and watching it disappear.
  //
  // A FACT ABOUT THE SNAPSHOT, not about the account's list, and reading it as
  // the second is the whole of EDITOR-73. It was documented here as "non-null
  // only while the account holds nothing of this browser's work" — an invariant
  // `save` then cleared on EVERY save to keep true. A save of a DIFFERENT
  // selection leaves the snapshot exactly where it was, in neither list, so
  // that clearing dropped the slot off the grid one save after EDITOR-67 put it
  // there. Only what actually reaches the snapshot may clear this: adoption
  // carrying it in, or a sign-out handing the grid back to it.
  //
  // So two cells called "Saved stack" is reachable now, and is the accepted
  // outcome rather than a case ruled out — every signed-in save is named that
  // anyway (`SAVED_STACK_NAME` in `roster-panel.tsx`), so the old invariant was
  // not buying what it claimed. They are not ambiguous: the local slot lists
  // the skills it holds, where an account's row can only say it is in the
  // account. Sharing a name is a smaller harm than losing the work.
  unadopted: AdoptionRefusal | null
  // `false` until the first `refresh` lands. The rail draws nothing at all
  // until then rather than flashing "Sign in" at somebody who already is.
  ready: boolean
  refresh: () => Promise<void>
  // Hands the refusal back rather than swallowing it: the only surface that
  // can say a save failed is the button that was pressed, and it is not here.
  save: (name: string, configId: string) => Promise<StackResult>
}

// What one attempt at adoption leaves behind: the stacks the grid should draw,
// and why the local slot is not among them. Two fields rather than a refusal
// alone, because the caller has to set both in one go — a list without its
// reason, or a reason without its list, is a render where the two disagree.
type Adoption = { stacks: RemoteStack[]; unadopted: AdoptionRefusal | null }

/**
 * The one refusal a snapshot can be read for without writing anything.
 *
 * `unwritable` is decided in `createSharedConfig` BEFORE the request leaves —
 * it is a parse of the same schema the worker gates `POST /configs` on — so it
 * is the one ending that can be asked for free, as often as we like, and that
 * answers the same way forever (CLI-851).
 *
 * Which makes it the only thing that can still PROVE a snapshot is in neither
 * list on a load where adoption is not attempted at all. Every write this
 * editor makes crosses that gate, so a payload the contract refuses cannot have
 * reached the account by any route — no request, no id minted, no guess.
 *
 * Asked of the SCHEMA rather than of the rule behind it, for the reason
 * `writeContractProblems` in `lib/api/configs.ts` gives: it is the same object
 * the worker gates on, so a rule added to the write contract tomorrow reaches
 * here without anyone remembering to come back. That module is the better home
 * for this question and it is where a shared `isUnwritable` belongs.
 */
const writeContractRefusal = (local: SeedPayload): AdoptionRefusal | null =>
  installableSeedPayloadSchema.safeParse(local).success ? null : "unwritable"

/**
 * The snapshot somebody made before they had an account, carried into it.
 *
 * WITHOUT THIS, SIGNING IN LOOKS LIKE LOSING YOUR WORK. The grid shows an
 * account's stacks in place of the local slot — one list, not two that
 * disagree — so a person who saved something, then signed in, would watch it
 * disappear from the screen. It is still in localStorage and would come back on
 * sign-out, which is no comfort at all in the moment it vanishes.
 *
 * Only when the account has NOTHING, which is the honest reading of "first
 * sign-in": somebody with stacks already has been here before, and re-uploading
 * a stale local slot every time they sign in on a new machine would breed
 * duplicates nobody asked for.
 *
 * That governs what is WRITTEN and nothing else. A non-empty account still gets
 * asked `writeContractRefusal`, because "we did not try" and "it is in there"
 * are different answers and the grid draws them differently (EDITOR-73).
 *
 * A failure leaves the local slot untouched and hands back the reason, and that
 * second half is what was missing. Silence was defensible while every ending
 * here was transient — the next load retries it — but a configuration the write
 * contract refuses is refused identically forever (CLI-851), so the snapshot
 * left the grid on sign-in and nothing said why. Still not a dialog, for the
 * reason it never was: this runs on a path the person did not ask for, at the
 * moment they finish signing in. The refusal comes back as a value and the grid
 * keeps drawing the slot beside it.
 *
 * The asymmetry that produces such a refusal is deliberate and stays: the local
 * slot may hold a configuration nobody can install, because opening one and
 * repairing it is the whole of EDITOR-08, while a write may not. Adoption is
 * the seam where a local snapshot becomes a write, so it is where the two rules
 * meet — and the answer is to keep the snapshot local, not to relax either.
 */
const adoptLocalStack = async (stacks: RemoteStack[]): Promise<Adoption> => {
  const local = useSavedStackStore.getState().saved
  if (!local) return { stacks, unadopted: null }

  // Somebody with stacks has been here before, so nothing is re-uploaded —
  // but NOT ATTEMPTED is not ADOPTED, and the difference is what the grid
  // draws. This branch used to answer `null` for both, which is why a reload
  // did not bring the refused slot back: the account had gained one unrelated
  // row, so adoption was never tried again and the reason was never recomputed.
  //
  // A snapshot the write contract refuses could not be in this account by any
  // route, so it is kept and named. One the contract would accept might already
  // be here under some name and nothing on this side can tell — the account's
  // list wins, exactly as it did before.
  if (stacks.length > 0)
    return { stacks, unadopted: writeContractRefusal(local) }

  const minted = await createSharedConfig(local)
  if (!minted.ok) return { stacks, unadopted: minted.refusal }

  const adopted = await createStack(SAVED_STACK_NAME, minted.id)
  return adopted.ok
    ? { stacks: [adopted.stack], unadopted: null }
    : { stacks, unadopted: adopted.refusal }
}

// One refresh at a time, shared by everyone who asks while it is running.
//
// NOT a tidy-up: without it, adoption runs twice and uploads the same snapshot
// twice. Two refreshes overlapping both read an empty list and both act on it,
// and they overlap for ordinary reasons — React double-invokes effects under
// StrictMode, and a sign-out-then-refresh is two calls a frame apart. The E2E
// spec caught it as a duplicate `POST /stacks`, which is precisely the shape
// the defect would have had in front of a person: two "Saved stack" cells,
// identical, from one save.
let inFlight: Promise<void> | null = null

export const useAccountStore = create<AccountState>()((set, get) => ({
  session: null,
  stacks: [],
  unadopted: null,
  ready: false,

  refresh: () =>
    (inFlight ??= refreshOnce(set).finally(() => (inFlight = null))),

  save: async (name, configId) => {
    const saved = await createStack(name, configId)
    // `unadopted` is deliberately NOT touched. This used to clear it on the
    // premise that a save is this browser's work reaching the account; it is
    // not, when what was saved is a different selection, and the signed-in path
    // in `roster-panel.tsx` never writes the local slot at all — so a save
    // cannot change whether the snapshot is in the account, and a writer that
    // cannot know what it is asserting has no business asserting it.
    //
    // The one case this leaves imprecise, and it is bounded: apply the local
    // slot, then save it, after a TRANSIENT refusal. The work does reach the
    // account and the notice is a refresh behind. It self-corrects on the next
    // `refresh` — the contract accepts that snapshot, so `writeContractRefusal`
    // answers `null` — and the alternative errs the other way, which is the
    // direction that loses work. Clearing it exactly would mean comparing the
    // payload just saved against the slot, which is a signature change reaching
    // into another feature's call site.
    if (saved.ok) set({ stacks: [saved.stack, ...get().stacks] })

    return saved
  },
}))

const refreshOnce = async (set: (state: Partial<AccountState>) => void) => {
  const session = await readSession()
  // Signed out, the grid draws the local slot on its own account, so a refusal
  // carried over from the last session would be a sentence about a cell that is
  // there anyway.
  if (!session)
    return set({ session: null, ready: true, stacks: [], unadopted: null })

  const { stacks, unadopted } = await adoptLocalStack(await listStacks())
  set({ session, ready: true, stacks, unadopted })
}
