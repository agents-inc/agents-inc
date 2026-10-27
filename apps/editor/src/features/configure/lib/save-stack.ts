import { useMemo } from "react"

import { createSharedConfig, type ShareRefusal } from "@/lib/api/configs"
import type { StackRefusal } from "@/lib/api/stacks"
import { useAccountStore } from "@/stores/account-store"
import { useSavedStackStore } from "@/stores/saved-stack-store"

import type { SaveNameProblem } from "./save-name"
import type { SeedPayload } from "@workspace/matrix"

export type SaveRefusal = ShareRefusal | StackRefusal | "list-unread"

// `unwritable` is reachable only here: the account will not hold one. A
// refused name is said by the name's own sentence, on the field.
export const SAVE_NARRATIONS = {
  "out-of-date": "Out of date — reload",
  refused: "Saving failed",
  unreachable: "Offline — try again",
  "signed-out": "Signed out — sign in",
  unwritable: "Scope conflict — fix marked rows",
  "list-unread": "Saving needs your account's stacks first.",
} as const satisfies Record<Exclude<SaveRefusal, SaveNameProblem>, string>

export type SaveOutcome =
  | { ok: true }
  | { ok: false; refusal: SaveRefusal }
  | { ok: false; problem: SaveNameProblem }

// Signed in, minted through the share route, so a save and a link can never
// restore different things. An unread list leaves the name unchecked against
// the account's, so nothing is minted until one is read.
export const saveStack = async (
  name: string,
  payload: SeedPayload
): Promise<SaveOutcome> => {
  const account = useAccountStore.getState()
  if (!account.session) return useSavedStackStore.getState().save(name, payload)
  if (account.listRefusal !== null) return { ok: false, refusal: "list-unread" }

  const minted = await createSharedConfig(payload)
  return minted.ok ? account.save(name, minted.id) : minted
}

// Once the account's list is read, only the local saves the account refused.
// Until then, every one: an unread list stands in for nothing.
export const useLocalSavesOnGrid = () => {
  const saves = useSavedStackStore((state) => state.saves)
  const listRead = useAccountStore(
    (state) => state.session !== null && state.listRefusal === null
  )
  const unadopted = useAccountStore((state) => state.unadopted)

  return useMemo(
    () =>
      listRead
        ? saves.filter((save) => Object.hasOwn(unadopted, save.id))
        : saves,
    [saves, listRead, unadopted]
  )
}
