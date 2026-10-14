import type { Provider } from "@workspace/compile"
import type { AgentName } from "@workspace/matrix"

import type { SkillOptions } from "@/stores/persisted-schema"

// What each provider can install, measured on the pinned
// `@openai/codex@0.155.1`. This module is on the first-paint graph: a VALUE
// import of `@workspace/compile` puts its chunk there and fails
// `scripts/first-paint-budget.ts`. Type imports are free.

export const PROVIDER_CHOICES = [
  "claude",
  "codex",
] as const satisfies readonly Provider[]

type Placement = `${SkillOptions["install"]}+${SkillOptions["scope"]}`

const placementOf = ({ install, scope }: SkillOptions): Placement =>
  `${install}+${scope}`

// Codex plugins are machine-wide: no subcommand takes a scope, so
// plugin+project has no mechanism and the CLI refuses it by name (D3).
const CODEX_OFFERS = [
  "plugin+global",
  "eject+global",
  "eject+project",
] as const satisfies readonly Placement[]

const offeredByCodex: ReadonlySet<string> = new Set(CODEX_OFFERS)

export const offersPlacement = (
  provider: Provider,
  options: SkillOptions
): boolean => provider === "claude" || offeredByCodex.has(placementOf(options))

/** What a press on either door writes: on Codex, plugin lands at global. */
export const patchForPress = (
  provider: Provider,
  patch: Partial<SkillOptions>
): Partial<SkillOptions> =>
  provider === "codex" && patch.install === "plugin"
    ? { ...patch, scope: "global" }
    : patch

const inAnEnglishList = (items: readonly string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`

// Names the refused placement and all three offered ones, as the CLI's
// `unbackedPluginInstallError` does.
export const unofferedPlacementReason = (): string =>
  `Codex installs plugins for the whole machine, so plugin+project is not offered. ` +
  `It installs ${inAnEnglishList(CODEX_OFFERS)}.`

export const placementRefusal = (
  provider: Provider,
  options: SkillOptions
): string | undefined =>
  offersPlacement(provider, options) ? undefined : unofferedPlacementReason()

/** The mark on a selected skill Codex cannot install, lead first. */
export const UNOFFERED_PLACEMENT_ERROR = {
  lead: "Codex has no project-level plugins.",
  detail:
    "Eject this skill to keep it in the project, or install the plugin globally.",
} as const

// The Install button is a third of a 300px row and does not wrap.
export const unofferedPlacementLabel = (count: number): string =>
  count === 1
    ? "1 skill needs a Codex placement"
    : `${count} skills need a Codex placement`

// Mirrors `AGENTS_NOT_ON_CODEX` in `@workspace/compile`, which this module may
// not import; `provider.test.ts` pins the two equal.
export const AGENTS_LEFT_OUT_OF_CODEX = [
  "agent-summoner",
  "skill-summoner",
] as const satisfies readonly AgentName[]

const leftOutOfCodex: ReadonlySet<string> = new Set(AGENTS_LEFT_OUT_OF_CODEX)

export const compilesAgent = (provider: Provider, agentId: string): boolean =>
  provider === "claude" || !leftOutOfCodex.has(agentId)

// The recorded reason (D8), not a capability claim: both compile as role files.
export const leftOutOfCodexReason = (): string =>
  `Codex installs leave this sub-agent out for v1 — its roster mechanics on Codex are not proven.`

export const agentsLeftOutOfCodexNotice = (
  agentNames: readonly string[]
): string =>
  `${inAnEnglishList(agentNames)} ${agentNames.length === 1 ? "is" : "are"} ` +
  `not installed on Codex — left out for v1, because their roster mechanics there are not proven.`

// Measured: an untrusted Codex project reads `.agents/skills` but silently
// ignores role files and plugin enablement.
export const untrustedProjectNote = (): string =>
  `Codex reads a project's sub-agents only once the project is trusted — ` +
  `until then the skills still reach the model and the rest is ignored silently.`
