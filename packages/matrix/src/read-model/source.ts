import { BUILT_IN_MATRIX } from "../vendor/generated/matrix"
import { MatrixSchema } from "../schema"

// The vendored matrix, validated once. Parsing it costs ~40ms for 222 skills, so every read-model
// module shares this rather than calling MatrixSchema.parse itself.
export const MATRIX = MatrixSchema.parse(BUILT_IN_MATRIX)

export const MATRIX_VERSION = MATRIX.version
