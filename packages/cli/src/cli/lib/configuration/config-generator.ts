// Side-effect import: hands the compile package this CLI's console.
import "../compile-seat.js";

export {
  buildStackProperty,
  generateProjectConfigFromSkills,
  isScopePairCompatible,
  scopeEligibilityKey,
  splitConfigByScope,
  type ProjectConfigOptions,
  type SplitConfigResult,
} from "@workspace/compile/seed-to-config";
