import path from "path";

/** The monorepo root, above `packages/cli`. */
export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");
