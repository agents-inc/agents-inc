import { MATRIX_VERSION } from "@workspace/matrix";
import {
  SEED_VERSION,
  installableSeedPayloadSchema,
  seedModelSchema,
} from "@workspace/matrix/seed";

import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../consts.js";
import { isScopePairCompatible } from "../configuration/config-generator.js";
import { typedEntries, typedValues } from "../../utils/typed-object.js";

import type { ContentReading } from "./external-skills.js";
import type {
  AgentScopeConfig,
  ProjectConfig,
  SkillConfig,
  SkillScope,
} from "../../types/config.js";
import type { ModelName } from "../../types/matrix.js";
import type { SkillId } from "../../types/skills.js";
import type {
  SeedAgent,
  SeedLoadState,
  SeedModel,
  SeedPayload,
  SeedSkill,
} from "@workspace/matrix/seed";

type SeedAssignments = Record<string, SeedLoadState>;

type StackReading = {
  assignments: Map<SkillId, SeedAssignments>;
  unwritable: string[];
};

/** A tombstone describes something not installed, so it has nothing to say on the wire. */
export function isInstalled(entry: { excluded?: boolean }): boolean {
  return !entry.excluded;
}

/** An ejected copy travels with the project, and the default catalogue is what no ref means. */
function needsMarketplaceNamed(origin: string): boolean {
  return origin !== EJECT_SOURCE && origin !== DEFAULT_PUBLIC_SOURCE_NAME;
}

/** The contract's own enum, so widening `MODEL_NAMES` alone cannot silently drop a pin. */
function isSeedModel(model: ModelName): model is SeedModel {
  return seedModelSchema.safeParse(model).success;
}

/** An absent flag is lazy. */
function seedLoadState(preloaded: boolean | undefined): SeedLoadState {
  return preloaded === true ? "preloaded" : "lazy";
}

function unnameableOriginMessage(skill: SkillConfig): string {
  return `${skill.id} comes from the marketplace '${skill.origin}', and this installation does not record where that marketplace is fetched from`;
}

function unnameableModelMessage(agent: AgentScopeConfig["name"], model: ModelName): string {
  return `${agent} pins model '${model}', which this contract has no word for — leaving it out would say "keep the sub-agent's own metadata", which is a different instruction`;
}

function unwritablePairMessage(skillId: SkillId, agent: string): string {
  return `${skillId} -> ${agent}: a project-scoped skill never reaches a sub-agent that rests at global scope`;
}

function unshareableConfigError(unshareable: string[]): string {
  return [
    "This installation cannot be shared as it stands — a shared configuration has no way to carry:",
    ...unshareable.map((line) => `  ${line}`),
    "Sharing it anyway would mint an id that installs something else.",
  ].join("\n");
}

type MarketplaceReading = {
  ref: string | undefined;
  unnameable: string[];
};

type MarketplaceRecord = Pick<ProjectConfig, "marketplace" | "marketplaceName">;

/** `origin` is a marketplace name, `marketplace` its ref, and `marketplaceName` joins them. */
function isRecordedMarketplace(record: MarketplaceRecord | undefined, skill: SkillConfig): boolean {
  return record?.marketplace !== undefined && skill.origin === record.marketplaceName;
}

/** A payload names one marketplace; only a skill whose marketplace neither config records is refused. */
function readMarketplace(
  config: ProjectConfig,
  skills: SkillConfig[],
  inheritedFrom: MarketplaceRecord | undefined,
): MarketplaceReading {
  const served = skills.filter((skill) => needsMarketplaceNamed(skill.origin));
  const unaccounted = served.filter(
    (skill) =>
      !isRecordedMarketplace(config, skill) && !isRecordedMarketplace(inheritedFrom, skill),
  );
  if (unaccounted.length > 0) {
    return { ref: undefined, unnameable: unaccounted.map(unnameableOriginMessage) };
  }

  const servesItsOwn = served.some((skill) => isRecordedMarketplace(config, skill));
  return { ref: servesItsOwn ? config.marketplace : undefined, unnameable: [] };
}

/** Plugins from a marketplace other than the payload's one, which an install will skip. */
export function skillsItsMarketplaceLeavesBehind(
  config: ProjectConfig,
  payload: SeedPayload,
): SkillId[] {
  const namedMarketplace =
    payload.marketplace === undefined ? DEFAULT_PUBLIC_SOURCE_NAME : config.marketplaceName;
  const isPluginFromElsewhere = (skill: SkillConfig): boolean =>
    skill.origin !== EJECT_SOURCE && skill.origin !== namedMarketplace;

  return config.skills
    .filter(isInstalled)
    .filter(isPluginFromElsewhere)
    .map((skill) => skill.id);
}

function unnameableModels(agents: AgentScopeConfig[]): string[] {
  return agents.flatMap((agent) =>
    agent.model !== undefined && !isSeedModel(agent.model)
      ? [unnameableModelMessage(agent.name, agent.model)]
      : [],
  );
}

/** Re-keys rows by skill; rows the decoder would refuse are collected for the refusal. */
function readStack(
  stack: ProjectConfig["stack"],
  skillScopes: Map<SkillId, SkillScope>,
  agentScopes: Map<string, SkillScope>,
): StackReading {
  const assignments = new Map<SkillId, SeedAssignments>();
  const unwritable: string[] = [];

  for (const [agent, agentStack] of typedEntries(stack ?? {})) {
    const agentScope = agentScopes.get(agent);
    if (agentScope === undefined) continue;

    for (const { id, preloaded } of typedValues(agentStack).flat()) {
      const skillScope = skillScopes.get(id);
      if (skillScope === undefined) continue;

      if (!isScopePairCompatible(skillScope, agentScope)) {
        unwritable.push(unwritablePairMessage(id, agent));
        continue;
      }

      const forSkill = assignments.get(id) ?? {};
      forSkill[agent] = seedLoadState(preloaded);
      assignments.set(id, forSkill);
    }
  }

  return { assignments, unwritable };
}

function toSeedSkill(skill: SkillConfig, assignments: SeedAssignments | undefined): SeedSkill {
  return {
    // A plugin's marketplace has already been checked against the envelope's ref.
    install: skill.origin === EJECT_SOURCE ? "eject" : "plugin",
    scope: skill.scope,
    assignments: assignments ?? {},
  };
}

/** Always `on`: it carries a sub-agent that owns no skill, which assignments cannot. */
function toSeedAgent(agent: AgentScopeConfig): SeedAgent {
  return {
    on: true,
    scope: agent.scope,
    ...(agent.model !== undefined && isSeedModel(agent.model) && { model: agent.model }),
    ...(agent.codexModel !== undefined && { codexModel: agent.codexModel }),
    ...(agent.effort !== undefined && { effort: agent.effort }),
  };
}

/** Inverse of `seedToInstallSelection`; anything the contract cannot state is refused by name. */
export function configToSeedPayload(
  config: ProjectConfig,
  carried: ContentReading,
  inheritedFrom?: MarketplaceRecord,
): SeedPayload {
  const skills = config.skills.filter(isInstalled);
  const agents = config.agents.filter(isInstalled);
  const skillScopes = new Map(skills.map((skill) => [skill.id, skill.scope]));
  const agentScopes = new Map<string, SkillScope>(agents.map((agent) => [agent.name, agent.scope]));

  const { assignments, unwritable } = readStack(config.stack, skillScopes, agentScopes);
  const marketplace = readMarketplace(config, skills, inheritedFrom);

  const unshareable = [
    ...marketplace.unnameable,
    ...unnameableModels(agents),
    ...unwritable,
    ...carried.uncarryable,
  ];
  if (unshareable.length > 0) throw new Error(unshareableConfigError(unshareable));

  // Parsed against the store's installable schema, so drift fails the mint here.
  return installableSeedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: MATRIX_VERSION,
    stackId: null,
    // Absent rather than empty: an id is the hash of its body.
    ...(config.description !== undefined && { description: config.description }),
    ...(marketplace.ref !== undefined && { marketplace: marketplace.ref }),
    skills: Object.fromEntries(
      skills.map((skill) => [skill.id, toSeedSkill(skill, assignments.get(skill.id))]),
    ),
    ...(Object.keys(carried.external).length > 0 && { external: carried.external }),
    agents: Object.fromEntries(agents.map((agent) => [agent.name, toSeedAgent(agent)])),
  });
}
