import os from "os";
import path from "path";
import { unique } from "remeda";
import type {
  AgentDefinition,
  AgentName,
  CompileAgentConfig,
  ProjectConfig,
  SkillId,
  SkillReference,
  Stack,
  StackAgentConfig,
} from "../../types";
import { isHomeDirectory } from "./is-home-directory";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import type { WizardResultV2 } from "../../components/wizard/wizard";
import {
  type MergeResult,
  type AuthoritativeScope,
  mergeWithExistingConfig,
  loadProjectConfig,
  loadInstalledConfig,
} from "../configuration";
import { type SourceLoadResult } from "../loading";
import { loadStackById, stackNotOfferedMessage } from "../stacks";
import { buildSkillRefsFromConfig } from "../resolver";
import { generateProjectConfigFromSkills, buildStackProperty } from "../configuration";
import { scopeEligibilityKey, isScopePairCompatible } from "../configuration/config-generator";
import {
  isActiveAt,
  activeSkillScopeMap,
  activeAgentScopeMap,
  effectivelyExcludedSkillIds,
} from "../configuration/scope-predicates";
import { verbose } from "../../utils/logger";
import { typedFromEntries } from "../../utils/typed-object";
import { DEFAULT_PLUGIN_NAME } from "../../consts";

/**
 * Returns the ids of skills active in the CURRENT wizard selection that were
 * NOT active in the persisted PRIOR config. Filters `excluded: true` on both
 * sides — excluded entries don't participate in stack membership, so flipping
 * a skill from excluded back to active counts as "newly added".
 *
 * `priorSkills === undefined` (first init) collapses the prior active set to
 * empty — every current skill is new this session. The generator's seeding
 * branch is what actually produces useful output in that case, so treating
 * every skill as "new" is safe.
 */
function computeNewlyAddedSkillIds(
  currentSkills: readonly SkillConfig[],
  priorSkills: readonly SkillConfig[] | undefined,
): readonly SkillId[] {
  const priorActiveIds = new Set((priorSkills ?? []).filter((s) => !s.excluded).map((s) => s.id));
  const currentActiveIds = currentSkills.filter((s) => !s.excluded).map((s) => s.id);
  return unique(currentActiveIds.filter((id) => !priorActiveIds.has(id)));
}

/**
 * Returns `(agent, skillId)` keys whose scope-compatibility was GAINED this
 * session — the pair is scope-compatible now but was NOT scope-compatible (or
 * was absent entirely) in the persisted config. Admits pure scope-flip cases
 * that `computeNewlyAddedSkillIds` (keyed by id only) cannot express.
 *
 * Scope rule: `isScopePairCompatible` from config-generator — the single
 * definition shared with the generator's own compatibility filter.
 *
 * Keys are produced by `scopeEligibilityKey` so lookup membership matches the
 * generator's internal set-membership check.
 */
function computeScopeEligibilityGained(
  currentSkills: readonly SkillConfig[],
  currentAgents: readonly AgentScopeConfig[],
  priorSkills: readonly SkillConfig[] | undefined,
  priorAgents: readonly AgentScopeConfig[] | undefined,
): ReadonlySet<string> {
  const priorSkillScope = activeSkillScopeMap(priorSkills);
  const priorAgentScope = activeAgentScopeMap(priorAgents);
  const gainedCompatibility = (skill: SkillConfig, agent: AgentScopeConfig): boolean =>
    isScopePairCompatible(skill.scope, agent.scope) &&
    !wereScopeCompatible(priorSkillScope.get(skill.id), priorAgentScope.get(agent.name));

  const activeCurrentSkills = currentSkills.filter((s) => !s.excluded);
  const activeCurrentAgents = currentAgents.filter((a) => !a.excluded);

  const gainedKeys = activeCurrentAgents.flatMap((agent) =>
    activeCurrentSkills
      .filter((skill) => gainedCompatibility(skill, agent))
      .map((skill) => scopeEligibilityKey(agent.name, skill.id)),
  );
  return new Set(gainedKeys);
}

/**
 * Whether a pair was scope-compatible in the persisted config — which it cannot have been where
 * either half was absent from it, or excluded there.
 */
function wereScopeCompatible(
  priorSkillScope: SkillScope | undefined,
  priorAgentScope: SkillScope | undefined,
): boolean {
  return (
    priorSkillScope !== undefined &&
    priorAgentScope !== undefined &&
    isScopePairCompatible(priorSkillScope, priorAgentScope)
  );
}

/**
 * The stack the written config carries.
 *
 * A producer that knows per-`(skill, agent)` assignments has already decided what every sub-agent
 * holds and what preloads, so its stack REPLACES the ownership-derived one rather than merging
 * with it. Ownership rules hand every scope-compatible skill to every selected agent — exactly the
 * curation a shared configuration exists to carry — and inherit `preloaded` from a prior or
 * stack-YAML entry, which is silent about what the sharer chose. A stack id in such a payload
 * still names the config's description, but its own expansion is not overlaid for the same reason:
 * it would add back the skills and agents the assignments left out.
 *
 * Only a stack the generator itself built is replaced. With no agents selected there is nothing to
 * own, and the absent key is what tells the merger to leave the stack already on disk alone.
 */
function resolveStackProperty(
  generated: ProjectConfig["stack"],
  assigned: WizardResultV2["assignedStack"],
): ProjectConfig["stack"] {
  return generated && assigned ? assigned : generated;
}

/**
 * The sentence this config records about itself, from whichever end of the install knows it.
 *
 * The two are never both present, and the two install paths are the reason. A stack loaded HERE is
 * the wizard path, where the stack object is the authority on its own description. A description
 * carried on the wizard result is the `init --from` path, where `configToSeedPayload` writes
 * `stackId: null` on purpose — so `loadedStack` is null, there is no id to resolve a description
 * out of, and before the payload carried one the line was simply dropped.
 *
 * The loaded stack is asked first anyway, so the ordering is stated rather than left to the fact
 * that the cases do not overlap: a stack the install actually read beats a sentence handed to it.
 */
function resolveDescription(
  loadedStack: Stack | null,
  shared: WizardResultV2["description"],
): string | undefined {
  return loadedStack === null ? shared : loadedStack.description;
}

/**
 * The identity a freshly-written config carries.
 *
 * A project config is named for the directory it configures — the same identity
 * `eject` passes as its `fallbackName` and the loader repairs a missing `name`
 * to. At `$HOME` there is no project to name: `path.basename(os.homedir())` is
 * the OS account name, which identifies the USER rather than the installation
 * and differs per machine for one logical global install, so the global config
 * keeps the product constant instead.
 *
 * A config already on disk keeps the name it saved either way — `mergeConfigs`
 * carries identity fields over from the existing config, so this seed only ever
 * names a config being created.
 */
function configNameFor(projectDir: string): string {
  return isHomeDirectory(projectDir) ? DEFAULT_PLUGIN_NAME : path.basename(projectDir);
}

/**
 * The per-agent curation this save must preserve, from every config that carries
 * any.
 *
 * A GLOBAL sub-agent's curation lives in the global config ALONE — a project
 * config's stack is filtered down to project-scoped agents on the way out, so a
 * global agent has no row of its own there. Reading the project config by itself
 * therefore makes a `s` toggle (G→P) look like an agent nobody has ever curated,
 * and the generator's seed branch rebuilds its catalogue from relevance defaults,
 * silently dropping every assignment the shared resolver would not re-derive.
 *
 * Both configs are carriers and both are merged; the project's word wins per
 * agent, since a project-scoped agent's row is the one the project owns. The
 * global config is READ here and never written — a project-context edit moves an
 * agent INTO this project, it never migrates global state out.
 */
async function loadCuratedStack(
  projectDir: string,
  projectStack: ProjectConfig["stack"],
): Promise<Partial<Record<AgentName, StackAgentConfig>>> {
  // At `$HOME` the config already loaded IS the global one — re-reading it would
  // merge it with itself.
  const globalStack = isHomeDirectory(projectDir) ? undefined : await loadGlobalStack();

  // ProjectConfig.stack types its agents as Record<string, StackAgentConfig> (it
  // comes from parsed TS/JSON); the declared return type is where those keys are
  // narrowed to AgentName, so this load boundary needs no cast of its own.
  return { ...globalStack, ...projectStack };
}

/** The global install's per-agent stack, absent until a global config exists. */
async function loadGlobalStack(): Promise<ProjectConfig["stack"]> {
  return (await loadInstalledConfig(os.homedir()))?.config.stack;
}

async function buildInstallConfig(
  wizardResult: WizardResultV2,
  sourceResult: SourceLoadResult,
  projectDir: string,
): Promise<{ config: ProjectConfig; loadedStack: Stack | null }> {
  const skillIds = unique(wizardResult.skills.map((s) => s.id));
  verbose(
    `buildInstallConfig: selectedStackId='${wizardResult.selectedStackId}', ` +
      `skills=[${skillIds.join(", ")}], ` +
      `selectedAgents=[${wizardResult.selectedAgents.join(", ")}]`,
  );

  const loadedStack = await loadSelectedStack(wizardResult.selectedStackId, sourceResult);
  const existing = await loadProjectConfig(projectDir);
  const existingStack = await loadCuratedStack(projectDir, existing?.config.stack);

  const options = generatorOptionsFor(
    wizardResult,
    existing?.config,
    stackToPreserve(loadedStack, existingStack),
  );
  const generated = generateProjectConfigFromSkills(configNameFor(projectDir), skillIds, options);
  const stack = resolveStackProperty(generated.stack, wizardResult.assignedStack);
  const description = resolveDescription(loadedStack, wizardResult.description);
  const localConfig: ProjectConfig = {
    ...generated,
    ...(stack && { stack }),
    ...(description !== undefined && { description }),
  };

  verbose(
    `buildInstallConfig result: stack=${stackSizeForLog(localConfig.stack)}, ` +
      `agents=[${localConfig.agents.map((a) => a.name).join(", ")}], skills=${localConfig.skills.length}`,
  );

  return { config: localConfig, loadedStack };
}

/**
 * The stack the wizard selected, loaded from the source — `null` where none was selected, and a
 * refusal naming the source where one was selected that the source does not offer.
 */
async function loadSelectedStack(
  stackId: WizardResultV2["selectedStackId"],
  sourceResult: SourceLoadResult,
): Promise<Stack | null> {
  if (!stackId) return null;

  const { source } = sourceResult.sourceConfig;
  const loadedStack = await loadStackById(stackId, sourceResult.sourcePath, source);
  verbose(
    `buildInstallConfig: loadedStack=${loadedStack ? `found (id='${loadedStack.id}')` : "NOT FOUND"}`,
  );
  if (!loadedStack) throw new Error(stackNotOfferedMessage(stackId, source));

  return loadedStack;
}

/**
 * The per-agent stack the generator must preserve: the curated one on disk, over any stack this
 * install applies.
 *
 * With a stack, it is overlaid so its (agent, category, skill) triples reach the ownership-based
 * builder with a load already decided — the author's flag where a third-party stacks file wrote
 * one, and the shared mapping's verdict where none was written, which is every entry of a built-in
 * stack. `buildStackProperty` is where that decision is made, so applying a stack is a NEW
 * selection: it never arrives flagless and is never read as a curated lazy.
 *
 * The on-disk stack spreads LAST and wins per agent, so re-running over an installed config
 * preserves what the user saved. Ownership rules still govern which agents and categories land in
 * the final stack, so Phase A (init) and Phase B (edit) produce equivalent stacks for the same
 * selection.
 */
function stackToPreserve(
  loadedStack: Stack | null,
  curatedStack: Partial<Record<AgentName, StackAgentConfig>>,
): Partial<Record<AgentName, StackAgentConfig>> {
  if (loadedStack === null) return curatedStack;
  return { ...buildStackProperty(loadedStack), ...curatedStack };
}

/**
 * Everything the generator is told beyond the skill ids: the user's agent selection, the skill
 * and agent configs that carry each one's scope, the stack to preserve, and what this session
 * changed relative to the persisted config.
 *
 * Both `skillConfigs` and `agentConfigs` are always passed when `selectedAgents` is set — the
 * config generator enforces that invariant to prevent silent "project" scope defaults on missing
 * lookups.
 *
 * The two deltas are what per-agent curation turns on: the skills new to this session's selection,
 * and the `(agent, skillId)` pairs that became scope-compatible, which admits the scope-flip case a
 * skill-id-only diff would miss. With no persisted config (first init) both collapse to
 * "everything is new this session", which the generator's seeding branch tolerates.
 */
function generatorOptionsFor(
  wizardResult: WizardResultV2,
  persisted: ProjectConfig | undefined,
  existingStack: Partial<Record<AgentName, StackAgentConfig>>,
): {
  selectedAgents?: AgentName[];
  skillConfigs: SkillConfig[];
  agentConfigs: AgentScopeConfig[];
  existingStack: Partial<Record<AgentName, StackAgentConfig>>;
  newlyAddedSkillIds: readonly SkillId[];
  scopeEligibilityGained: ReadonlySet<string>;
} {
  return {
    skillConfigs: wizardResult.skills,
    agentConfigs: wizardResult.agentConfigs,
    existingStack,
    newlyAddedSkillIds: computeNewlyAddedSkillIds(wizardResult.skills, persisted?.skills),
    scopeEligibilityGained: computeScopeEligibilityGained(
      wizardResult.skills,
      wizardResult.agentConfigs,
      persisted?.skills,
      persisted?.agents,
    ),
    ...(wizardResult.selectedAgents.length > 0 && {
      selectedAgents: wizardResult.selectedAgents,
    }),
  };
}

/** How many agents a stack carries, as the verbose lines spell it. */
function stackSizeForLog(stack: ProjectConfig["stack"]): string {
  return stack ? `${Object.keys(stack).length} agents` : "UNDEFINED";
}

export function setConfigMetadata(
  config: ProjectConfig,
  wizardResult: WizardResultV2,
  sourceResult: SourceLoadResult,
  sourceFlag?: string,
): ProjectConfig {
  const result = { ...config };

  // Only persist selected domains when non-empty (sparse output)
  if (wizardResult.selectedDomains.length > 0) {
    result.selectedDomains = wizardResult.selectedDomains;
  }

  if (sourceFlag) {
    result.marketplace = sourceFlag;
  } else if (sourceResult.sourceConfig.source) {
    result.marketplace = sourceResult.sourceConfig.source;
  }

  if (sourceResult.marketplace) {
    result.marketplaceName = sourceResult.marketplace;
  }

  return result;
}

export async function buildAndMergeConfig(
  wizardResult: WizardResultV2,
  sourceResult: SourceLoadResult,
  projectDir: string,
  sourceFlag?: string,
  authoritativeScope?: AuthoritativeScope,
): Promise<MergeResult> {
  const { config } = await buildInstallConfig(wizardResult, sourceResult, projectDir);
  verbose(`buildAndMergeConfig: before merge — stack=${stackSizeForLog(config.stack)}`);
  const configWithMetadata = setConfigMetadata(config, wizardResult, sourceResult, sourceFlag);
  const result = await mergeWithExistingConfig(configWithMetadata, {
    projectDir,
    ...(authoritativeScope !== undefined && { authoritativeScope }),
  });
  verbose(
    `buildAndMergeConfig: after merge — stack=${stackSizeForLog(result.config.stack)}, merged=${result.merged}`,
  );
  return result;
}

export function buildCompileAgents(
  config: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
): Partial<Record<AgentName, CompileAgentConfig>> {
  const activeAgents = config.agents.filter((a) => !a.excluded);
  const excludedSkillIds = effectivelyExcludedSkillIds(config.skills);
  const globalSkillIds = new Set(
    config.skills.filter((s) => isActiveAt(s, "global")).map((s) => s.id),
  );
  const sourceById = new Map<SkillId, string>(config.skills.map((s) => [s.id, s.origin]));

  // An effectively excluded skill compiles into no agent, and a global agent takes only the skills
  // active at global scope — the D7 cross-scope safety net.
  const compilesInto = (ref: SkillReference, agentConfig: AgentScopeConfig): boolean => {
    if (excludedSkillIds.has(ref.id)) return false;
    if (agentConfig.scope === "global") return globalSkillIds.has(ref.id);
    return true;
  };

  // The skill's `origin`, carried as `source`, is what lets the compiler choose per skill between
  // `${id}:${id}` (plugin) and a bare id (eject). A skill with no SkillConfig — a user-authored
  // local one — legitimately has none, so the ref goes through without it.
  const withItsOrigin = (ref: SkillReference): SkillReference => {
    const source = sourceById.get(ref.id);
    return { ...ref, ...(source !== undefined && { source }) };
  };

  const buildAgentCompileEntry = (agentConfig: AgentScopeConfig): CompileAgentConfig => {
    // Model/effort are the agent's own settings, not its skills' — a bare agent with no stack
    // entry still carries them, so they are resolved before the skill-less early-out.
    const tuning: CompileAgentConfig = {
      ...(agentConfig.model !== undefined && { model: agentConfig.model }),
      ...(agentConfig.effort !== undefined && { effort: agentConfig.effort }),
    };

    const agentStack = config.stack?.[agentConfig.name];
    if (!agentStack) return tuning;

    const filteredRefs = buildSkillRefsFromConfig(agentStack)
      .filter((ref) => compilesInto(ref, agentConfig))
      .map(withItsOrigin);
    return { ...tuning, skills: filteredRefs };
  };

  return typedFromEntries<AgentName, CompileAgentConfig>(
    activeAgents
      .filter((agentConfig) => agents[agentConfig.name])
      .map((agentConfig) => [agentConfig.name, buildAgentCompileEntry(agentConfig)]),
  );
}

export function buildAgentScopeMap(config: ProjectConfig): Map<AgentName, SkillScope> {
  return activeAgentScopeMap(config.agents);
}
