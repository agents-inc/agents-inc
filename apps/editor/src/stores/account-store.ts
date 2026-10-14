import {
  installableSeedPayloadSchema,
  type SeedPayload,
} from "@workspace/matrix"
import { create } from "zustand"

import { sameName } from "@/features/configure/lib/save-name"
import { createSharedConfig, type ShareRefusal } from "@/lib/api/configs"
import { readSession, type Session } from "@/lib/api/auth"
import {
  createStack,
  listStacks,
  type RemoteStack,
  type StackRefusal,
  type StackResult,
} from "@/lib/api/stacks"
import { useSavedStackStore, type SavedStack } from "@/stores/saved-stack-store"

/** Why a first sign-in could not carry a local save into the account: the mint's refusals or the write's. */
export type AdoptionRefusal = ShareRefusal | StackRefusal

/** Local save id → why it is not in the account. The grid keeps drawing each one. */
export type Unadopted = Readonly<Record<string, AdoptionRefusal>>

type Carried =
  { ok: true; stack: RemoteStack } | { ok: false; refusal: AdoptionRefusal }

// Not persisted: the session is a cookie only the worker can vouch for.
type AccountState = {
  session: Session
  stacks: RemoteStack[]
  // A fact about each local save, not about the account's list (EDITOR-73):
  // only adoption or a sign-out may change it.
  unadopted: Unadopted
  // Ids of owed saves whose names the account already lists, oldest first.
  // Each is asked for a new name once per sign-in.
  clashes: string[]
  // `false` until the first `refresh` lands, so the rail never flashes "Sign in".
  ready: boolean
  refresh: () => Promise<void>
  save: (name: string, configId: string) => Promise<StackResult>
  carryRenamed: (save: SavedStack, name: string) => Promise<Carried>
  // Still owed: the next sign-in asks again.
  defer: (saveId: string) => void
}

type Adoption = {
  stacks: RemoteStack[]
  unadopted: Unadopted
  owed: string[]
  clashes: string[]
}

// The one refusal readable without a request: the worker's own write gate,
// decided before the POST (CLI-851), so a save it refuses cannot be in the
// account by any route.
const writeContractRefusal = (payload: SeedPayload): AdoptionRefusal | null =>
  installableSeedPayloadSchema.safeParse(payload).success ? null : "unwritable"

const refusalsReadable = (saves: readonly SavedStack[]): Unadopted =>
  Object.fromEntries(
    saves.flatMap((save) => {
      const refusal = writeContractRefusal(save.payload)
      return refusal ? [[save.id, refusal]] : []
    })
  )

type Attempt = { save: SavedStack; carried: Carried }

const carryIntoAccount = async (save: SavedStack): Promise<Carried> => {
  const minted = await createSharedConfig(save.payload)
  return minted.ok ? createStack(save.name, minted.id) : minted
}

// Sequential, so the account lists them in the order they arrive.
const carryOneAtATime = async (saves: readonly SavedStack[]) => {
  const attempts: Attempt[] = []
  for (const save of saves)
    attempts.push({ save, carried: await carryIntoAccount(save) })

  return attempts
}

const adoptedNewestFirst = (attempts: readonly Attempt[]) =>
  attempts
    .flatMap(({ carried }) => (carried.ok ? [carried.stack] : []))
    .toReversed()

const refusalsOf = (attempts: readonly Attempt[]): Unadopted =>
  Object.fromEntries(
    attempts.flatMap(({ save, carried }) =>
      carried.ok ? [] : [[save.id, carried.refusal]]
    )
  )

// An empty account is a first sign-in, so every local save is owed to it.
// After that only the saves a first sign-in could not carry are, since an
// account with stacks has otherwise been here before.
const owedOldestFirst = (stacks: readonly RemoteStack[]) => {
  const { saves, owed } = useSavedStackStore.getState()
  const pending =
    stacks.length > 0 ? saves.filter((save) => owed.includes(save.id)) : saves

  return pending.toReversed()
}

const listsNameOf = (stacks: readonly RemoteStack[], save: SavedStack) =>
  stacks.some((stack) => sameName(stack.name, save.name))

const idsOf = (saves: readonly SavedStack[]) => saves.map((save) => save.id)

/**
 * Local saves carried into the account, oldest first, so signing in never
 * looks like losing work. A name the account already lists is never written
 * twice: that save stays owed until it is renamed. Every save's readable
 * refusal is still answered, because "not attempted" is not "adopted"
 * (EDITOR-73).
 */
const adoptLocalSaves = async (stacks: RemoteStack[]): Promise<Adoption> => {
  const owed = owedOldestFirst(stacks)
  const clashing = owed.filter((save) => listsNameOf(stacks, save))
  const attempts = await carryOneAtATime(
    owed.filter((save) => !clashing.includes(save))
  )
  const refused = refusalsOf(attempts)
  const readable = refusalsReadable(useSavedStackStore.getState().saves)
  const isStillOwed = (save: SavedStack) =>
    clashing.includes(save) || Object.hasOwn(refused, save.id)

  return {
    stacks: [...adoptedNewestFirst(attempts), ...stacks],
    unadopted: { ...readable, ...refused },
    owed: idsOf(owed.filter(isStillOwed)),
    // A save the account would refuse anyway is not worth renaming.
    clashes: idsOf(clashing).filter((id) => !Object.hasOwn(readable, id)),
  }
}

// Written only on a change: the slot is shared with every other tab.
const settleOwed = (owed: string[]) => {
  const store = useSavedStackStore.getState()
  const unchanged =
    owed.length === store.owed.length &&
    owed.every((id, index) => id === store.owed[index])

  if (!unchanged) store.setOwed(owed)
}

// One refresh at a time: two overlapping (StrictMode, sign-out-then-refresh)
// would both read an empty account and adopt every save twice.
let inFlight: Promise<void> | null = null

const withoutId = (ids: readonly string[], id: string) =>
  ids.filter((other) => other !== id)

const settleCarried = (save: SavedStack, name: string) => {
  const store = useSavedStackStore.getState()
  store.rename(save.id, name)
  store.setOwed(withoutId(store.owed, save.id))
}

export const useAccountStore = create<AccountState>()((set, get) => ({
  session: null,
  stacks: [],
  unadopted: {},
  clashes: [],
  ready: false,

  refresh: () =>
    (inFlight ??= refreshOnce(set).finally(() => (inFlight = null))),

  // Leaves `unadopted` alone: a save of some other selection reaches no local
  // save (EDITOR-73).
  save: async (name, configId) => {
    const saved = await createStack(name, configId)
    if (saved.ok) set({ stacks: [saved.stack, ...get().stacks] })

    return saved
  },

  carryRenamed: async (save, name) => {
    const carried = await carryIntoAccount({ ...save, name })
    if (!carried.ok) return carried

    settleCarried(save, name)
    set({
      stacks: [carried.stack, ...get().stacks],
      clashes: withoutId(get().clashes, save.id),
    })
    return carried
  },

  defer: (saveId) => set({ clashes: withoutId(get().clashes, saveId) }),
}))

const refreshOnce = async (set: (state: Partial<AccountState>) => void) => {
  const session = await readSession()
  // Signed out, the grid draws every local save anyway.
  if (!session)
    return set({
      session: null,
      ready: true,
      stacks: [],
      unadopted: {},
      clashes: [],
    })

  const { owed, ...adoption } = await adoptLocalSaves(await listStacks())
  settleOwed(owed)
  set({ session, ready: true, ...adoption })
}
