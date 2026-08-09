import type { SeedSkill } from "../seed"

// How a fresh pick installs before anyone touches it: as a plugin, into the
// user's own ~/.claude. Spelled once and read by every surface — the editor's
// fresh skill entry and resting agent scope, and the CLI's seed decode — so
// "what does an untouched pick do?" has exactly one answer instead of the
// three that used to disagree.
//
// Typed against the seed vocabulary because the wire is where the surfaces
// meet: a default this object could name that a payload could not carry would
// be a default that cannot travel.
export const DEFAULT_SELECTION_OPTIONS = {
  install: "plugin",
  scope: "global",
} as const satisfies Pick<SeedSkill, "install" | "scope">
