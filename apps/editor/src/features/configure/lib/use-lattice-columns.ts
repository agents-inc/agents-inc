import { useWideViewport } from "@/lib/viewport"

// One hook for both the grid and each cell's column index, which must agree or
// a rightmost panel opens through the column's edge.
export const useLatticeColumns = (): 3 | 4 => (useWideViewport() ? 4 : 3)
