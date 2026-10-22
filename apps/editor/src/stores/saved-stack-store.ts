import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { z } from "zod"

import {
  validateSaveName,
  type SaveNameProblem,
} from "@/features/configure/lib/save-name"

// Its own slice rather than a field of the config store, whose version bump
// discards everything: a save someone named on purpose must survive that.
const savedStackSchema = z.object({
  id: z.string(),
  name: z.string(),
  payload: seedPayloadSchema,
})

export type SavedStack = z.infer<typeof savedStackSchema>

type LocalSaveResult =
  { ok: true; save: SavedStack } | { ok: false; problem: SaveNameProblem }

const slotSchema = z.object({ saves: z.array(z.unknown()) })

const owedSchema = z.object({ owed: z.array(z.string()) })

const decodedSave = (entry: unknown): SavedStack[] => {
  const parsed = savedStackSchema.safeParse(entry)
  return parsed.success ? [parsed.data] : []
}

/** What the slot holds, newest first, minus each entry that no longer decodes. */
export const readSavedStacks = (persisted: unknown): SavedStack[] => {
  const parsed = slotSchema.safeParse(persisted)
  return parsed.success ? parsed.data.saves.flatMap(decodedSave) : []
}

const readOwed = (persisted: unknown): string[] => {
  const parsed = owedSchema.safeParse(persisted)
  return parsed.success ? parsed.data.owed : []
}

type SavedStackState = {
  saves: SavedStack[]
  // Ids of saves a first sign-in could not carry into the account, or whose
  // name it already lists. Persisted: every later sign-in retries them.
  owed: string[]
  save: (name: string, payload: SeedPayload) => LocalSaveResult
  rename: (id: string, name: string) => void
  setOwed: (owed: string[]) => void
}

export const useSavedStackStore = create<SavedStackState>()(
  persist(
    (set, get) => ({
      saves: [],
      owed: [],
      save: (name, payload) => {
        const { saves } = get()
        const checked = validateSaveName(
          name,
          saves.map((save) => save.name)
        )
        if (!checked.ok) return checked

        // Random, never the name.
        const save = { id: crypto.randomUUID(), name: checked.name, payload }
        set({ saves: [save, ...saves] })
        return { ok: true, save }
      },
      rename: (id, name) =>
        set({
          saves: get().saves.map((save) =>
            save.id === id ? { ...save, name } : save
          ),
        }),
      setOwed: (owed) => set({ owed }),
    }),
    {
      name: "agents-inc:saved-stacks:v1",
      partialize: ({ saves, owed }) => ({ saves, owed }),
      merge: (persisted, current) => ({
        ...current,
        saves: readSavedStacks(persisted),
        owed: readOwed(persisted),
      }),
    }
  )
)
