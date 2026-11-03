/** Membership both ways, since a count cannot see a swap. */
export type Drift = {
  claim: string
  namedButAbsent: string[]
  presentButUnnamed: string[]
}

/** Null when what is held and what is named have the same members. */
export function driftBetween(
  claim: string,
  held: readonly string[],
  named: readonly string[]
): Drift | null {
  const namedButAbsent = named.filter((member) => !held.includes(member))
  const presentButUnnamed = held.filter((member) => !named.includes(member))
  if (namedButAbsent.length === 0 && presentButUnnamed.length === 0) return null

  return { claim, namedButAbsent, presentButUnnamed }
}
