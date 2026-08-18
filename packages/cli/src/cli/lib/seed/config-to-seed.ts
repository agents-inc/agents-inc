import { MATRIX_VERSION } from "@workspace/matrix";
import { SEED_VERSION, seedModelSchema, seedPayloadSchema } from "@workspace/matrix/seed";

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

/** Sub-agent name -> load state for one skill: the shape the wire keys by skill. */
type SeedAssignments = Record<string, SeedLoadState>;

/** What one walk of `config.stack` yields: the wire's assignments, and the rows that cannot be one. */
type StackReading = {
  assignments: Map<SkillId, SeedAssignments>;
  /** Pairs the config model has nowhere to write, worded for the refusal. */
  unwritable: string[];
};

/**
 * An installed entry. An excluded one is a tombstone — a statement about something that is NOT
 * installed here — and presence is selection on the wire, so it has nothing to say. Nothing is
 * lost by leaving it home either: `init --from` installs into a clean setup, where there is no
 * global install for a tombstone to mask.
 *
 * Exported because the reader that gathers what an installation CARRIES has to agree with the
 * mapper about what it installs: content read for an entry this payload will not name is content
 * paid for by nobody, and a refusal raised over it would refuse a share for a skill it is not
 * sharing.
 */
export function isInstalled(entry: { excluded?: boolean }): boolean {
  return !entry.excluded;
}

/**
 * Whether a skill from this origin obliges the payload to name a marketplace.
 *
 * Two do not. An ejected copy travels with the project, and the default public catalogue is what
 * an absent ref already means — so neither puts a ref on the wire, and two identical selections
 * cannot mint two different ids over one.
 */
function needsMarketplaceNamed(origin: string): boolean {
  return origin !== EJECT_SOURCE && origin !== DEFAULT_PUBLIC_SOURCE_NAME;
}

/**
 * Asked of the contract's own enum rather than spelled out here, so widening `MODEL_NAMES`
 * without widening the wire cannot slip past as a silently dropped pin.
 */
function isSeedModel(model: ModelName): model is SeedModel {
  return seedModelSchema.safeParse(model).success;
}

/** The wire spells as an enum what a stack entry spells as a boolean, and an absent flag is lazy. */
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

/**
 * Names everything the contract cannot carry at once, not one thing at a time: a sharer who fixes
 * one only to be refused for the next learns nothing the first message could not have told them.
 *
 * The refusal exists because the alternative is worse than a failed command. A payload quietly
 * missing what it could not say still mints an id, and that id installs a configuration nobody
 * chose — with nothing on either side saying so.
 */
function unshareableConfigError(unshareable: string[]): string {
  return [
    "This installation cannot be shared as it stands — a shared configuration has no way to carry:",
    ...unshareable.map((line) => `  ${line}`),
    "Sharing it anyway would mint an id that installs something else.",
  ].join("\n");
}

/** The ref a payload has to carry, and the skills no ref this config holds can account for. */
type MarketplaceReading = {
  /** Absent when nothing installed here came from a marketplace. */
  ref: string | undefined;
  unnameable: string[];
};

/**
 * Whether the marketplace this installation reads is the one `skill` came from.
 *
 * A skill's `origin` is a marketplace's NAME, `config.marketplace` is the ref it was fetched from,
 * and `marketplaceName` is what joins them — the name the install read out of that repository's
 * own manifest. Without both halves agreeing, the ref would send the receiver to a repository that
 * never served this skill, which is the same silent swap under a different spelling.
 */
function isRecordedMarketplace(config: ProjectConfig, skill: SkillConfig): boolean {
  return config.marketplace !== undefined && skill.origin === config.marketplaceName;
}

/** Which marketplace the payload names, decided by the skills that oblige it to name one. */
function readMarketplace(config: ProjectConfig, skills: SkillConfig[]): MarketplaceReading {
  const served = skills.filter((skill) => needsMarketplaceNamed(skill.origin));
  if (served.length === 0) return { ref: undefined, unnameable: [] };

  const unaccounted = served.filter((skill) => !isRecordedMarketplace(config, skill));
  if (unaccounted.length > 0) {
    return { ref: undefined, unnameable: unaccounted.map(unnameableOriginMessage) };
  }

  return { ref: config.marketplace, unnameable: [] };
}

function unnameableModels(agents: AgentScopeConfig[]): string[] {
  return agents.flatMap((agent) =>
    agent.model !== undefined && !isSeedModel(agent.model)
      ? [unnameableModelMessage(agent.name, agent.model)]
      : [],
  );
}

/**
 * Turns `config.stack` inside out: it is keyed by sub-agent and this contract is keyed by skill.
 *
 * Rows naming a sub-agent or a skill this configuration does not install are dropped rather than
 * refused, because they are already no part of what is installed — `compile` warns about exactly
 * those and leaves them out of the agents it writes, so carrying them would share more than this
 * project has.
 *
 * A row the config model cannot write is the opposite case and is collected for the refusal: the
 * decoder turns the same pair away on the way back in, so minting it would produce an id that
 * cannot be installed.
 */
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

    for (const categoryAssignments of typedValues(agentStack)) {
      for (const { id, preloaded } of categoryAssignments) {
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
  }

  return { assignments, unwritable };
}

function toSeedSkill(skill: SkillConfig, assignments: SeedAssignments | undefined): SeedSkill {
  return {
    // "eject" is the project's own copy; anything else is a plugin the marketplace serves, and
    // which marketplace that is has already had to be one the envelope's ref accounts for.
    install: skill.origin === EJECT_SOURCE ? "eject" : "plugin",
    scope: skill.scope,
    assignments: assignments ?? {},
  };
}

/**
 * A sub-agent's own row, and it always says `on`.
 *
 * The web app pins `on` only where a person did, because there an agent switched on by its rows is
 * already implied by them. An installed config is not an inference — every sub-agent it names was
 * chosen and has a compiled file on disk — so saying so outright is what carries the one that owns
 * no skill, which is the only thing the agents map can do that assignments cannot.
 */
function toSeedAgent(agent: AgentScopeConfig): SeedAgent {
  return {
    on: true,
    scope: agent.scope,
    ...(agent.model !== undefined && isSeedModel(agent.model) && { model: agent.model }),
    ...(agent.effort !== undefined && { effort: agent.effort }),
  };
}

/**
 * Turns the installation this directory records into the payload the config store holds, so the
 * CLI can mint an id rather than only consume one.
 *
 * The inverse of {@link import("./seed-to-wizard.js").seedToWizardResult}, and held to it: a
 * payload minted here and decoded there has to describe the same install. That is why the scope
 * of every skill and sub-agent travels per entry rather than being implied, why the whole stack
 * is carried as per-`(skill, sub-agent)` assignments, and why nothing here leans on a wire default
 * the decoder would have to guess back.
 *
 * What it will not do is share a thinner configuration than the one installed. Anything the
 * contract cannot state is refused by name — see {@link unshareableConfigError} — because the
 * failure mode of the alternative is an id that silently installs something else.
 *
 * `stackId` is always null. A saved config records a stack's expansion and never the id it came
 * from, and the assignments above carry that expansion in full; naming an id this module invented
 * would make the receiver overlay a stack's own preload flags over the curation being shared.
 *
 * `marketplace` is the one field carried for the payload rather than for an entry, because the
 * receiver loads one catalogue before it reads a single skill row — see {@link readMarketplace}.
 *
 * `carried` arrives as an argument because it is read off disk and this mapping touches none:
 * every id above is resolved by the receiver against a catalogue it already has, and the entries
 * in `carried` are the ones that answer to no catalogue in either direction. Stated rather than
 * defaulted, because a producer that forgot the content is exactly the defect this closed.
 */
export function configToSeedPayload(config: ProjectConfig, carried: ContentReading): SeedPayload {
  const skills = config.skills.filter(isInstalled);
  const agents = config.agents.filter(isInstalled);
  const skillScopes = new Map(skills.map((skill) => [skill.id, skill.scope]));
  const agentScopes = new Map<string, SkillScope>(agents.map((agent) => [agent.name, agent.scope]));

  const { assignments, unwritable } = readStack(config.stack, skillScopes, agentScopes);
  const marketplace = readMarketplace(config, skills);

  const unshareable = [
    ...marketplace.unnameable,
    ...unnameableModels(agents),
    ...unwritable,
    ...carried.uncarryable,
  ];
  if (unshareable.length > 0) throw new Error(unshareableConfigError(unshareable));

  // Parsed rather than merely assembled, exactly as the web app's encoder is: it makes "the JSON
  // the store will hold" literal, and it is the one gate that catches a field whose values have
  // drifted out of the wire's enums since this module last named them.
  return seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: MATRIX_VERSION,
    stackId: null,
    ...(marketplace.ref !== undefined && { marketplace: marketplace.ref }),
    skills: Object.fromEntries(
      skills.map((skill) => [skill.id, toSeedSkill(skill, assignments.get(skill.id))]),
    ),
    // Absent rather than empty, for the reason the marketplace ref is: an id is the hash of its
    // body, so a key meaning what its absence already means would remint every ordinary payload.
    ...(Object.keys(carried.external).length > 0 && { external: carried.external }),
    agents: Object.fromEntries(agents.map((agent) => [agent.name, toSeedAgent(agent)])),
  });
}
