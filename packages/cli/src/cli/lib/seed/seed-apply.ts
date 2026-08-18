import { getCategoryDomain, matrix } from "../matrix/matrix-provider.js";
import { orderDomains } from "../wizard/domain-order.js";
import { typedEntries, typedKeys } from "../../utils/typed-object.js";

import type { WizardResultV2 } from "../../components/wizard/wizard.js";
import type { AgentName } from "../../types/agents.js";
import type { ProjectConfig, SkillConfig } from "../../types/config.js";
import type { Category, Domain } from "../../types/matrix.js";
import type { SkillAssignment, SkillId } from "../../types/skills.js";
import type { StackAgentConfig } from "../../types/stacks.js";

/**
 * What applying a shared configuration here is not allowed to take away, split by the reason —
 * because the reasons have different remedies and only the user knows which they meant.
 */
export type KeptFromRoundTrip = {
  /** Written here rather than installed, so no shared configuration ever carried them. */
  authoredSkillIds: SkillId[];
  /** Named by the configuration and unplaceable by this catalogue, so nothing here applied. */
  unplaceableSkillIds: SkillId[];
};

export type ReconciledSharedConfig = {
  /** The decoded payload with everything above put back into it. */
  result: WizardResultV2;
  kept: KeptFromRoundTrip;
};

export type ReconcileOptions = {
  /** The payload as `seedToWizardResult` decoded it. */
  decoded: WizardResultV2;
  /** This directory's installation — its own config, or the global one it inherits. */
  installed: ProjectConfig | null;
  /** Ids outside the round trip, from `skillsAuthoredHere` — one definition, both halves. */
  authoredHere: ReadonlySet<SkillId>;
  /**
   * Ids the payload NAMED that the decode could not place — `SeedMapping.skippedSkillIds`,
   * which is why they are ids off the wire rather than `SkillId`s of this catalogue.
   *
   * Stated by the caller rather than recomputed here: the decode already answered it, and a
   * second derivation could disagree with the skips the same run reported.
   */
  unplaceable: ReadonlySet<string>;
};

const NOTHING_KEPT: KeptFromRoundTrip = {
  authoredSkillIds: [],
  unplaceableSkillIds: [],
};

export function hasKeptEntries(kept: KeptFromRoundTrip): boolean {
  return kept.authoredSkillIds.length > 0 || kept.unplaceableSkillIds.length > 0;
}

/**
 * Puts back what this run may not remove, so the destructive apply removes only what it may.
 *
 * `edit --from` makes the project MATCH the payload: a skill the previous configuration
 * installed and this one omits is removed. Two kinds of installed entry are outside that
 * authority, and each is outside it for its own reason.
 *
 * A skill written here, because `forkedFrom` decides ownership and the producer drops a
 * directory carrying none: the payload never named it, so reading its absence as an instruction
 * to delete it would be this command inventing an instruction nobody gave. And an id the payload
 * DID name that this catalogue could not place, because there the instruction exists and the run
 * failed to carry it out — a destructive command removes on intent, never on its own inability.
 *
 * SCOPE IS NOT ONE OF THEM, and this module therefore takes no authority word. A globally
 * installed entry is removable through `edit --from` from a project as well as from the home
 * directory: the removal is shown, a project run additionally names every other project it
 * reaches, and the user answers. What is protected here is only what a removal may never be
 * INFERRED from, and an entry's scope infers nothing — it decides who else a removal touches,
 * which is the confirm's subject rather than this one's.
 *
 * Both are put back into the RESULT rather than excused at the writer, and that is the whole
 * point of this module. `authoritativeScope` decides whether the merger preserves a config row;
 * it does not protect the files, because the removal DIFF is what drives the plugin uninstall
 * and the `deleteLocalSkill` call. An entry left in the removal set is deleted from disk
 * whatever the merger later does with its row.
 *
 * What comes back with an entry matters as much as the entry. A kept skill with no stack row is
 * installed and loaded by no sub-agent; a kept skill whose domain fell off `selectedDomains` is
 * hidden from the next wizard, deselected by not being shown, and deleted by the run after this
 * one — a removal this one promised not to make.
 */
export function reconcileSharedConfig(options: ReconcileOptions): ReconciledSharedConfig {
  const { decoded, installed } = options;
  if (!installed) return { result: decoded, kept: NOTHING_KEPT };

  const keptSkills = skillsToKeep(options, installed);
  if (keptSkills.length === 0) return { result: decoded, kept: NOTHING_KEPT };

  return {
    result: withKeptEntries(decoded, installed, keptSkills),
    kept: describeKept(options, keptSkills),
  };
}

/**
 * The installed skills this run has to leave alone: absent from what the payload placed here,
 * and immune to removal by authorship, or because this catalogue could not place the id the
 * payload named.
 *
 * A tombstone is neither. It is a statement about something that is NOT installed here, so
 * there are no files to protect and nothing to tell the user is staying.
 */
function skillsToKeep(options: ReconcileOptions, installed: ProjectConfig): SkillConfig[] {
  const named = new Set(options.decoded.skills.map((skill) => skill.id));

  return installed.skills.filter(
    (skill) => !skill.excluded && !named.has(skill.id) && mayNotRemove(skill, options),
  );
}

/** Whether either reason covers this entry — the question the split below refines. */
function mayNotRemove(skill: SkillConfig, options: ReconcileOptions): boolean {
  return options.authoredHere.has(skill.id) || options.unplaceable.has(skill.id);
}

type KeptReason = "authored" | "unplaceable";

function describeKept(options: ReconcileOptions, keptSkills: SkillConfig[]): KeptFromRoundTrip {
  const idsKeptFor = (reason: KeptReason): SkillId[] =>
    keptSkills.filter((skill) => reasonKept(skill, options) === reason).map((skill) => skill.id);

  return {
    authoredSkillIds: idsKeptFor("authored"),
    unplaceableSkillIds: idsKeptFor("unplaceable"),
  };
}

/**
 * Which of the two an entry is disclosed as, where both are true — judged from the more
 * permanent claim to the less, because each statement carries its own remedy and only the one
 * that is true of the whole entry is worth naming.
 *
 * A skill nobody installed cannot be removed by any shared configuration from anywhere. An id
 * this catalogue cannot place is inert only for as long as this installation reads this
 * catalogue, so `update` is a real way out of it and nothing is a way out of the other.
 */
function reasonKept(skill: SkillConfig, options: ReconcileOptions): KeptReason {
  return options.authoredHere.has(skill.id) ? "authored" : "unplaceable";
}

/** The payload, plus the entries it was never entitled to speak about. */
function withKeptEntries(
  decoded: WizardResultV2,
  installed: ProjectConfig,
  keptSkills: SkillConfig[],
): WizardResultV2 {
  return {
    ...decoded,
    skills: [...decoded.skills, ...keptSkills],
    selectedDomains: withKeptDomains(decoded.selectedDomains, keptSkills),
    ...(decoded.assignedStack !== undefined && {
      assignedStack: withKeptStackRows(decoded.assignedStack, installed.stack, {
        keptSkillIds: new Set(keptSkills.map((skill) => skill.id)),
        survivingAgents: new Set(decoded.selectedAgents),
      }),
    }),
  };
}

/** The domains the payload chose, plus the ones its kept entries still need a tab for. */
function withKeptDomains(selected: Domain[], keptSkills: SkillConfig[]): Domain[] {
  const keptDomains = keptSkills.flatMap((skill) => domainOfSkill(skill.id) ?? []);
  const missing = keptDomains.filter((domain) => !selected.includes(domain));
  if (missing.length === 0) return selected;

  return orderDomains([...selected, ...new Set(missing)]);
}

/**
 * A kept skill's domain, where this catalogue knows the skill. Optional by nature rather than by
 * caution: a config entry the loaded source cannot resolve has no category to place, and
 * `edit`'s own unresolvable-entry path is what speaks about those.
 */
function domainOfSkill(skillId: SkillId): Domain | undefined {
  const category = matrix.skills[skillId]?.category;
  return category === undefined ? undefined : getCategoryDomain(category);
}

type KeptRowFilter = {
  keptSkillIds: ReadonlySet<SkillId>;
  survivingAgents: ReadonlySet<AgentName>;
};

/**
 * The installed stack rows a kept skill needs, folded into the payload's own.
 *
 * `assignedStack` REPLACES the ownership-derived stack rather than merging with it, so a row
 * this reconcile does not carry is a row nothing downstream re-derives. A kept skill is kept
 * because the payload never spoke about it, and a row naming it is the same silence one layer
 * down — so the row the installation already had is the only statement there is about it.
 *
 * A row under a sub-agent this configuration removes is dropped with it. That sub-agent IS this
 * run's to remove, and a stack row naming one no configuration installs is what `compile` warns
 * about and leaves out of the agents it writes.
 */
function withKeptStackRows(
  assigned: Partial<Record<AgentName, StackAgentConfig>>,
  installedStack: Partial<Record<AgentName, StackAgentConfig>> | undefined,
  filter: KeptRowFilter,
): Partial<Record<AgentName, StackAgentConfig>> {
  if (!installedStack) return assigned;

  const carried = { ...assigned };
  for (const [agent, agentStack] of typedEntries<AgentName, StackAgentConfig>(installedStack)) {
    if (!filter.survivingAgents.has(agent)) continue;

    const rows = keptRowsFor(agentStack, filter.keptSkillIds);
    if (typedKeys(rows).length === 0) continue;

    carried[agent] = { ...carried[agent], ...rows };
  }
  return carried;
}

/** One sub-agent's rows that a kept skill accounts for, category by category. */
function keptRowsFor(
  agentStack: StackAgentConfig,
  keptSkillIds: ReadonlySet<SkillId>,
): StackAgentConfig {
  const rows: StackAgentConfig = {};
  for (const [category, assignments] of typedEntries<Category, SkillAssignment[]>(agentStack)) {
    const carried = assignments.filter((assignment) => keptSkillIds.has(assignment.id));
    if (carried.length > 0) rows[category] = carried;
  }
  return rows;
}
