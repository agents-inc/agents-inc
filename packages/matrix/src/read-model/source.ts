import { BUILT_IN_MATRIX } from "../vendor/generated/matrix"
import { builtInMatrixSchema } from "../built-in-matrix"

// The vendored matrix, validated once. Parsing the whole catalog is measurably slow, so every
// read-model module shares this rather than calling builtInMatrixSchema.parse itself.
export const MATRIX = builtInMatrixSchema.parse(BUILT_IN_MATRIX)

export const MATRIX_VERSION = MATRIX.version
