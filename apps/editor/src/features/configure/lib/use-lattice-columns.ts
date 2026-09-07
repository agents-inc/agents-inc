import { useWideViewport } from "@/lib/viewport"

/**
 * HOW MANY CELLS THE LATTICE DRAWS ACROSS — three, and four once the viewport
 * is wide enough to hold a fourth without narrowing the other three past the
 * width a skill's name needs.
 *
 * A hook read by each caller rather than a constant passed down from one,
 * because the number is wanted in two different registers in the same place:
 * `domain-section.tsx` hands it to the grid AND uses it to work out which
 * column each cell landed in, and those two have to be the same number or a
 * rightmost cell opens its options panel out through the column's edge.
 *
 * The return type is the literal union `Lattice` accepts, so a fifth column
 * would have to be drawn before it could be asked for.
 */
export const useLatticeColumns = (): 3 | 4 => (useWideViewport() ? 4 : 3)
