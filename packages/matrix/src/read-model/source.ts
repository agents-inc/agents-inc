import { BUILT_IN_MATRIX } from "../vendor/generated/matrix"
import { builtInMatrixSchema } from "../built-in-matrix"

// Parsed once and shared: parsing the catalogue is slow.
export const MATRIX = builtInMatrixSchema.parse(BUILT_IN_MATRIX)

export const MATRIX_VERSION = MATRIX.version
