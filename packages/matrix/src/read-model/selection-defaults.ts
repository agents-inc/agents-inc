import type { SeedSkill } from "../seed"

// How an untouched pick installs, shared by the editor and the CLI.
export const DEFAULT_SELECTION_OPTIONS = {
  install: "plugin",
  scope: "global",
} as const satisfies Pick<SeedSkill, "install" | "scope">
