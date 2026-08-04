import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { z } from "zod"

// One snapshot of a selection, kept so the work behind it outlives the
// configuration currently on screen. What is stored is the payload sharing
// already sends — the same serialization, so a saved stack and a shared link
// can never restore different things.
//
// Deliberately its own slice rather than a field of the config store: that one
// is versioned by `PERSIST_VERSION` and discarded wholesale on a bump, and a
// snapshot someone made on purpose must not go with the browser state it
// happened to be saved from. The payload's own `v` is this slot's version
// seam, and it is stricter — a payload minted under an older contract fails to
// decode rather than being guessed at.
export const SAVED_STACK_NAME = "Saved stack"

const savedSlotSchema = z.object({ saved: seedPayloadSchema })

// The untrusted read, kept pure so it can be exercised without a browser. An
// empty slot and an unreadable one are the same answer on purpose: there is
// nothing to restore either way, and nothing on screen to explain it with.
export const readSavedStack = (persisted: unknown): SeedPayload | null => {
  const parsed = savedSlotSchema.safeParse(persisted)
  return parsed.success ? parsed.data.saved : null
}

type SavedStackState = {
  saved: SeedPayload | null
  // A single slot: saving again overwrites, so the grid gains exactly one cell
  // however often it is used.
  save: (payload: SeedPayload) => void
}

export const useSavedStackStore = create<SavedStackState>()(
  persist(
    (set) => ({
      saved: null,
      save: (payload) => set({ saved: payload }),
    }),
    {
      name: "agents-inc:saved-stack:v1",
      merge: (persisted, current) => ({
        ...current,
        saved: readSavedStack(persisted),
      }),
    }
  )
)
