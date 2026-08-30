import { create } from "zustand"

import { createSharedConfig } from "@/lib/api/configs"
import { readSession, type Session } from "@/lib/api/auth"
import {
  createStack,
  listStacks,
  type RemoteStack,
  type StackResult,
} from "@/lib/api/stacks"
import {
  SAVED_STACK_NAME,
  useSavedStackStore,
} from "@/stores/saved-stack-store"

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
  // `false` until the first `refresh` lands. The rail draws nothing at all
  // until then rather than flashing "Sign in" at somebody who already is.
  ready: boolean
  refresh: () => Promise<void>
  // Hands the refusal back rather than swallowing it: the only surface that
  // can say a save failed is the button that was pressed, and it is not here.
  save: (name: string, configId: string) => Promise<StackResult>
}

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
 * Every failure here is silent and leaves the local slot untouched. Adoption is
 * a convenience on a path the person did not ask for; a dialog about a failed
 * background upload, at the moment they finish signing in, would be worse than
 * the thing it reports.
 */
const adoptLocalStack = async (stacks: RemoteStack[]) => {
  const local = useSavedStackStore.getState().saved
  if (stacks.length > 0 || !local) return stacks

  const minted = await createSharedConfig(local)
  if (!minted.ok) return stacks

  const adopted = await createStack(SAVED_STACK_NAME, minted.id)
  return adopted.ok ? [adopted.stack] : stacks
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
  ready: false,

  refresh: () =>
    (inFlight ??= refreshOnce(set).finally(() => (inFlight = null))),

  save: async (name, configId) => {
    const saved = await createStack(name, configId)
    if (saved.ok) set({ stacks: [saved.stack, ...get().stacks] })

    return saved
  },
}))

const refreshOnce = async (set: (state: Partial<AccountState>) => void) => {
  const session = await readSession()
  if (!session) return set({ session: null, ready: true, stacks: [] })

  const stacks = await adoptLocalStack(await listStacks())
  set({ session, ready: true, stacks })
}
