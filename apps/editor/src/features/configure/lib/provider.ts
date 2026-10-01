import type { Provider } from "@workspace/compile"
import type { AgentName } from "@workspace/matrix"

import type { SkillOptions } from "@/stores/persisted-schema"

/**
 * WHAT EACH PROVIDER CAN INSTALL, AND THE WORDS FOR WHAT IT CANNOT.
 *
 * The rules are measured rather than preferred — every one of them was established by running the
 * pinned `@openai/codex@0.155.1` under a scratch `HOME` and `CODEX_HOME` — and they live here, in
 * one module with no catalogue and no store behind it, because three surfaces ask them: the skills
 * grid refuses a press, the roster refuses a pin, and the panel says what is left to resolve.
 *
 * NOTHING HERE MAY IMPORT A VALUE FROM `@workspace/compile`. This module is on the first-paint
 * graph, and a single value import of that package puts its 124.7 KB chunk there with it —
 * `scripts/first-paint-budget.ts` fails the build at 490.0 KB against a 344.0 KB budget, measured
 * 2026-09-20 and written out in `install-dialog.tsx`'s own docblock. TYPES are free, because they
 * are erased, which is what lets {@link PROVIDER_CHOICES} be held against the real union below
 * while the roster it mirrors is pinned by a test instead. `provider.test.ts` is that pin.
 */

/**
 * The providers the control offers, in the order it draws them, with Claude first because it is
 * where the control rests.
 *
 * `satisfies` against the imported union rather than a hand-written one: a third provider added to
 * `PROVIDERS` in `@workspace/compile` does not appear here on its own — that is a decision about
 * this screen — but a provider RENAMED there turns this line red instead of leaving the control
 * offering a value nothing installs.
 */
export const PROVIDER_CHOICES = [
  "claude",
  "codex",
] as const satisfies readonly Provider[]

/** `${install}+${scope}`, the spelling the CLI's own refusal uses when it names a placement. */
type Placement = `${SkillOptions["install"]}+${SkillOptions["scope"]}`

const placementOf = ({ install, scope }: SkillOptions): Placement =>
  `${install}+${scope}`

/**
 * The three of the four cells a Codex installation offers.
 *
 * Plugin installation is machine-wide on Codex: no subcommand takes a scope, and `codex plugin add`
 * run inside a project writes the switch to the global config and silently un-scopes it. So
 * `plugin+project` has no mechanism behind it at all, the CLI refuses a configuration asking for it
 * by name, and this app must never produce one (D3).
 */
const CODEX_OFFERS = [
  "plugin+global",
  "eject+global",
  "eject+project",
] as const satisfies readonly Placement[]

const offeredByCodex: ReadonlySet<string> = new Set(CODEX_OFFERS)

/** Whether this provider installs a skill placed like this. */
export const offersPlacement = (
  provider: Provider,
  options: SkillOptions
): boolean => provider === "claude" || offeredByCodex.has(placementOf(options))

const inAnEnglishList = (items: readonly string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`

/**
 * Why a cell is unavailable, as the cell's own accessible description.
 *
 * It names the refused placement AND all three offered ones, which is the shape
 * `unbackedPluginInstallError` in the CLI was written against: "not supported" leaves the reader to
 * guess which of the remaining cells to ask for.
 */
export const unofferedPlacementReason = (): string =>
  `Codex installs plugins for the whole machine, so plugin+project is not offered. ` +
  `It installs ${inAnEnglishList(CODEX_OFFERS)}.`

/**
 * Why this provider refuses a skill placed like this, or `undefined` where it installs it.
 *
 * One declaration because two doors ask it — the skills grid's butted pairs and the options panel
 * set the same two values — and a reason added to one copy would be missing from the other.
 */
export const placementRefusal = (
  provider: Provider,
  options: SkillOptions
): string | undefined =>
  offersPlacement(provider, options) ? undefined : unofferedPlacementReason()

/**
 * What a configuration that is already sitting in the refused cell has to say for itself.
 *
 * ARRIVING there is not refusable — the visitor built a perfectly legal Claude configuration and
 * then changed provider — so the answer is to show what it costs and let them resolve it. Ejecting
 * the skill on their behalf would make it installable and say nothing, which is the "fall back to
 * eject" this product does not do.
 */
export const unofferedPlacementNotice = (
  skillNames: readonly string[]
): string =>
  `${inAnEnglishList(skillNames)} ${skillNames.length === 1 ? "is" : "are"} ` +
  `set to plugin+project, which Codex does not offer. ` +
  `Codex installs ${inAnEnglishList(CODEX_OFFERS)} — change the placement, or go back to Claude.`

/**
 * What the Install button says instead of its counts while such a placement is unresolved.
 *
 * Cut to the length of `blockedLabel`'s own sentence, which is the width the panel has: the button
 * is a third of a 300px column's row and does not wrap, so a longer sentence is one that reads as
 * a clipped word rather than as a reason. The notice above it carries the detail.
 */
export const unofferedPlacementLabel = (count: number): string =>
  count === 1
    ? "1 skill needs a Codex placement"
    : `${count} skills need a Codex placement`

/**
 * The two sub-agents no Codex install compiles, MIRRORED from `AGENTS_NOT_ON_CODEX` in
 * `@workspace/compile`.
 *
 * That package is reached from here through `import()` alone, so the copy cannot be imported and a
 * docblock naming the other one cannot fail. The two are PINNED EQUAL by `provider.test.ts`, where
 * both are in scope.
 */
export const AGENTS_LEFT_OUT_OF_CODEX = [
  "agent-summoner",
  "skill-summoner",
] as const satisfies readonly AgentName[]

const leftOutOfCodex: ReadonlySet<string> = new Set(AGENTS_LEFT_OUT_OF_CODEX)

/** Whether this provider compiles this sub-agent at all. */
export const compilesAgent = (provider: Provider, agentId: string): boolean =>
  provider === "claude" || !leftOutOfCodex.has(agentId)

/**
 * Why a sub-agent's row is inert, as the row's own accessible description.
 *
 * The recorded reason, and deliberately not a capability claim: both compile perfectly well as role
 * files, and they are out for v1 because their roster mechanics on Codex are not proven (D8).
 * Shown rather than hidden, so a visitor toggling Claude → Codex does not watch two rows vanish
 * unexplained (D18) — the app writes both either way and the CLI drops them at install with a line.
 */
export const leftOutOfCodexReason = (): string =>
  `Codex installs leave this sub-agent out for v1 — its roster mechanics on Codex are not proven.`

/**
 * The same fact for the list of what is about to be written, where the rows themselves are gone.
 *
 * The roster answers D18 by KEEPING both rows and disabling them. The install dialog cannot: its
 * panes are the files this install puts on a disk, and a row there for a file that is not written
 * would be the disagreement the roster's own disabled row exists to prevent. So the rows go and
 * this sentence stays — which is the same trade {@link unofferedPlacementNotice} makes one surface
 * over, and the reason both are written out rather than folded into a count.
 */
export const agentsLeftOutOfCodexNotice = (
  agentNames: readonly string[]
): string =>
  `${inAnEnglishList(agentNames)} ${agentNames.length === 1 ? "is" : "are"} ` +
  `not installed on Codex — left out for v1, because their roster mechanics there are not proven.`

/**
 * WHAT AN UNTRUSTED PROJECT COSTS, said beside the command that installs into one.
 *
 * Measured, and the reason it is a sentence rather than a warning glyph: an untrusted Codex project
 * install is HALF live. Project skills at `.agents/skills` reach the model with no trust entry and
 * no config file at all, while the sub-agent role files and plugin enablement are ignored — in
 * total silence, with no warning anywhere. "Trust the repo" is not the true thing to say; what
 * a reader needs is which half went quiet, so a silent failure is something they can recognise
 * rather than something they file a bug about.
 */
export const untrustedProjectNote = (): string =>
  `Codex reads a project's sub-agents only once the project is trusted — ` +
  `until then the skills still reach the model and the rest is ignored silently.`
