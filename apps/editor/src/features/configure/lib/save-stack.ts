import { useMemo } from "react"

import { createSharedConfig, type ShareRefusal } from "@/lib/api/configs"
import type { StackRefusal } from "@/lib/api/stacks"
import { useAccountStore } from "@/stores/account-store"
import { useSavedStackStore } from "@/stores/saved-stack-store"

import type { SaveNameProblem } from "./save-name"
import type { SeedPayload } from "@workspace/matrix"

/** Every way a signed-in save can end short: the mint's refusals, plus the write's. */
export type SaveRefusal = ShareRefusal | StackRefusal

// Signed out a save cannot be refused. `unwritable` is reachable only here:
// Save stays open on an unwritable selection so it can be kept while repaired
// (EDITOR-08), but the account will not hold one.
export const SAVE_NARRATIONS = {
  "out-of-date": "Out of date — reload",
  refused: "Saving failed",
  unreachable: "Offline — try again",
  "signed-out": "Signed out — sign in",
  unwritable: "Scope conflict — fix marked rows",
} as const satisfies Record<SaveRefusal, string>

export type SaveOutcome =
  | { ok: true }
  | { ok: false; refusal: SaveRefusal }
  | { ok: false; problem: SaveNameProblem }

/**
 * Signed out, into this browser. Signed in, the payload is minted through the
 * route a share link uses and the account stores the name and that id
 * (SERVER-04), so a save and a link can never restore different things.
 */
export const saveStack = async (
  name: string,
  payload: SeedPayload
): Promise<SaveOutcome> => {
  const account = useAccountStore.getState()
  if (!account.session) return useSavedStackStore.getState().save(name, payload)

  const minted = await createSharedConfig(payload)
  return minted.ok ? account.save(name, minted.id) : minted
}

/** The local saves the stack grid draws: all of them signed out, and signed in only those the account refused. */
export const useLocalSavesOnGrid = () => {
  const saves = useSavedStackStore((state) => state.saves)
  const session = useAccountStore((state) => state.session)
  const unadopted = useAccountStore((state) => state.unadopted)

  return useMemo(
    () =>
      session
        ? saves.filter((save) => Object.hasOwn(unadopted, save.id))
        : saves,
    [saves, session, unadopted]
  )
}
