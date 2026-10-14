// The server's `nameSchema` cap (apps/server/src/stacks.ts).
const MAX_NAME_LENGTH = 80

export type SaveNameProblem = "empty" | "too-long" | "taken"

export type SaveNameCheck =
  { ok: true; name: string } | { ok: false; problem: SaveNameProblem }

export const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/** Trims `typed`, then refuses it empty, over the cap, or matching any of `taken` in any case. */
export const validateSaveName = (
  typed: string,
  taken: readonly string[]
): SaveNameCheck => {
  const name = typed.trim()

  if (name === "") return { ok: false, problem: "empty" }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, problem: "too-long" }
  if (taken.some((other) => sameName(other, name)))
    return { ok: false, problem: "taken" }

  return { ok: true, name }
}
