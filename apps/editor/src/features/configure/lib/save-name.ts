import { sameStackName } from "@workspace/matrix"

// The server's `nameSchema` cap.
const MAX_NAME_LENGTH = 80

export type SaveNameProblem = "empty" | "too-long" | "taken"

export type SaveNameCheck =
  { ok: true; name: string } | { ok: false; problem: SaveNameProblem }

export { sameStackName as sameName }

export const validateSaveName = (
  typed: string,
  taken: readonly string[]
): SaveNameCheck => {
  const name = typed.trim()

  if (name === "") return { ok: false, problem: "empty" }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, problem: "too-long" }
  if (taken.some((other) => sameStackName(other, name)))
    return { ok: false, problem: "taken" }

  return { ok: true, name }
}
