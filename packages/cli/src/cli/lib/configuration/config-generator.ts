/**
 * The config builders live in `@workspace/compile/seed-to-config` and are re-exported here, so
 * the editor's output preview builds a `ProjectConfig` the same way an install does. Nothing is
 * declared in this module any more; the side-effect import below is what hands the package this
 * CLI's console, and it belongs here because `generateProjectConfigFromSkills` is one of the two
 * moved functions that still reports something to a user.
 */
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
