import { beforeEach, describe, expect, it } from "vitest";

import { reconcileSharedConfig, type KeptFromRoundTrip } from "./seed-apply";
import { seedToWizardResult } from "./seed-to-wizard";
import { initializeMatrix } from "../matrix/matrix-provider";
import {
  buildAgentConfigs,
  buildProjectConfig,
  buildWizardResult,
} from "../__tests__/factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";
import { sa } from "../__tests__/factories/skill-factories.js";
import { buildSkillConfig, buildSkillConfigs } from "../__tests__/helpers/wizard-simulation.js";
import { REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX } from "../__tests__/mock-data/mock-matrices.js";
import { SKILLS } from "../__tests__/test-fixtures.js";

import type { SkillId } from "../../types/index.js";

/**
 * What `edit --from` may not remove, and what it therefore has to say.
 *
 * The command applies a shared configuration DESTRUCTIVELY — the project is made to match the
 * payload — and TWO kinds of installed entry are outside that authority. One the user wrote by
 * hand, because the round trip never carried it: the producer drops a skill directory with no
 * `forkedFrom`, so the payload made no statement about it and "match the payload" cannot mean
 * "delete it". And one the configuration NAMES that this catalogue cannot place, because a
 * destructive command removes on intent and never on its own inability to place something — the
 * payload asked for that skill, so its absence from the decode is this catalogue's limit rather
 * than an instruction.
 *
 * SCOPE IS NOT ONE OF THEM. A globally installed entry is removable through `edit --from`, from
 * a project as well as from the home directory: the command already shows what it takes away and
 * a project run additionally says which other projects that reaches, so the user removing it has
 * chosen to. What this module decides is only what a removal may never be INFERRED from, and an
 * entry's scope infers nothing — which is why `reconcileSharedConfig` takes no authority word.
 *
 * Both reasons are put BACK into the decoded result rather than merely excused at the config
 * writer. `authoritativeScope` decides whether the WRITER preserves a row; it is not the
 * destructive half: the removal DIFF is what drives the plugin uninstall and the
 * `deleteLocalSkill` call, so an entry left in the removal set is deleted from disk whatever the
 * merger does with the row.
 */

/**
 * Nothing kept, spelled as the whole shape rather than as a "did anything survive" flag.
 *
 * A boolean over the two arrays cannot say WHICH reason answered, so an authorship keep read as
 * a catalogue keep — and the two have different remedies and different user-facing sentences.
 */
const NOTHING_KEPT: KeptFromRoundTrip = { authoredSkillIds: [], unplaceableSkillIds: [] };

const REACT = SKILLS.react.id;
const ZUSTAND = SKILLS.zustand.id;
const HONO = SKILLS.hono.id;
const WEB_DEV = "web-developer";
const API_DEV = "api-developer";

/**
 * A real skill id this matrix does not carry, so a payload naming it decodes to a SKIP rather
 * than to a selection. It is the one id the command has an instruction about and no way to
 * honour — which is the whole of the second reason an entry is kept.
 */
const UNPLACEABLE = SKILLS.vitest.id;

/** A payload that installs exactly one skill onto one sub-agent, at the scope named. */
function payloadFor(skillId: SkillId, scope: "project" | "global" = "project") {
  return buildSeedPayload({
    skills: { [skillId]: buildSeedSkill({ scope, assignments: { [WEB_DEV]: "lazy" } }) },
    agents: { [WEB_DEV]: { scope: "project" } },
  });
}

/** The decoded form of {@link payloadFor} — what `edit --from` hands the reconcile. */
function decodedFor(skillId: SkillId, scope: "project" | "global" = "project") {
  return seedToWizardResult(payloadFor(skillId, scope), REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX)
    .result;
}

/**
 * The same decode, over a payload that ALSO names {@link UNPLACEABLE} — returned whole rather
 * than as `.result`, because the skipped ids are what the command hands the reconcile as
 * `unplaceable` and deriving them here is what proves the two halves are one decode.
 */
function decodedAlsoNaming(skillId: SkillId, scope: "project" | "global" = "project") {
  return seedToWizardResult(
    buildSeedPayload({
      skills: {
        [skillId]: buildSeedSkill({ scope, assignments: { [WEB_DEV]: "lazy" } }),
        [UNPLACEABLE]: buildSeedSkill({ scope, assignments: { [WEB_DEV]: "lazy" } }),
      },
      agents: { [WEB_DEV]: { scope: "project" } },
    }),
    REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
  );
}

describe("reconcileSharedConfig", () => {
  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
  });

  describe("what a shared configuration is allowed to remove", () => {
    it("leaves a project-scoped skill the payload omits in the removal set", () => {
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([REACT, ZUSTAND], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(),
      });

      // The destructive rule, stated positively: the project's own skill the payload left out
      // does NOT come back, so the diff downstream reports it as removed.
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT]);
      expect(kept).toStrictEqual(NOTHING_KEPT);
    });

    it("leaves an inherited global skill the payload omits in the removal set too", () => {
      const installed = buildProjectConfig({
        skills: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(ZUSTAND, { scope: "global" }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(),
      });

      // Scope buys an entry nothing here. `edit --from` states a whole roster and the person
      // applying it is shown what goes, so a global entry the payload omits is an omission
      // somebody made rather than one this module has to second-guess. What the SCOPE decides
      // is who else the removal reaches, which the confirm says and this does not.
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT]);
      expect(kept).toStrictEqual(NOTHING_KEPT);
    });

    it("leaves an inherited global sub-agent the payload omits in the removal set", () => {
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([REACT], { scope: "project" }),
        agents: [
          ...buildAgentConfigs([WEB_DEV], { scope: "project" }),
          ...buildAgentConfigs([API_DEV], { scope: "global" }),
        ],
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(),
      });

      // The sub-agent mirror, and the whole of it: authorship is a property of a skill
      // directory, so with scope gone there is nothing left that can keep a sub-agent.
      expect(result.agentConfigs).toStrictEqual(decodedFor(REACT).agentConfigs);
      expect(result.selectedAgents).toStrictEqual([WEB_DEV]);
      expect(kept).toStrictEqual(NOTHING_KEPT);
    });

    it("keeps a skill written here, which no payload ever carried", () => {
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([REACT, ZUSTAND], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set<SkillId>([ZUSTAND]),
        unplaceable: new Set(),
      });

      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT, ZUSTAND]);
      expect(kept.authoredSkillIds).toStrictEqual([ZUSTAND]);
    });

    it("keeps a skill written here even where it is installed at global scope", () => {
      const installed = buildProjectConfig({
        skills: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(ZUSTAND, { scope: "global" }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set<SkillId>([ZUSTAND]),
        unplaceable: new Set(),
      });

      // A hand-written directory under `~/.claude/skills/` is somebody's own work at the scope
      // that happens to hold it. Scope is what decides who a removal reaches; `forkedFrom` is
      // what decides whether there is a removal to reach anybody, and it says no.
      expect(result.skills).toStrictEqual([
        ...decodedFor(REACT).skills,
        buildSkillConfig(ZUSTAND, { scope: "global" }),
      ]);
      expect(kept).toStrictEqual({ authoredSkillIds: [ZUSTAND], unplaceableSkillIds: [] });
    });

    it("adds nothing back for an entry the payload itself carries", () => {
      const installed = buildProjectConfig({
        skills: [buildSkillConfig(REACT, { scope: "global" })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedFor(REACT, "global"),
        installed,
        authoredHere: new Set<SkillId>([REACT]),
        unplaceable: new Set(),
      });

      // Immune from removal is not immune from being MENTIONED: the payload names this id, so
      // there is nothing to keep and nothing to disclose — only one entry, the payload's.
      expect(result.skills).toStrictEqual(decodedFor(REACT, "global").skills);
      expect(kept).toStrictEqual(NOTHING_KEPT);
    });

    it("keeps a tombstone's id out of both halves, because it is installed nowhere", () => {
      const installed = buildProjectConfig({
        skills: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(ZUSTAND, { scope: "global", excluded: true }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(),
      });

      // An excluded entry is a statement about something that is NOT installed here, so there
      // are no files to protect and nothing to tell the user is staying.
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT]);
      expect(kept).toStrictEqual(NOTHING_KEPT);
    });
  });

  describe("an id the configuration names that this catalogue cannot place", () => {
    it("keeps it, because the skip is this catalogue's limit and not an instruction", () => {
      const installed = buildProjectConfig({
        skills: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(UNPLACEABLE, { scope: "project" }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });
      const { result: decoded, skippedSkillIds } = decodedAlsoNaming(REACT);

      const { result, kept } = reconcileSharedConfig({
        decoded,
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(skippedSkillIds),
      });

      // The payload ASKED for this skill. Reading its absence from the decode as "remove it"
      // deletes an installed skill because the catalogue moved — the one thing being named
      // rules out, and the difference between deleting on intent and deleting on failure.
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT, UNPLACEABLE]);
      expect(kept).toStrictEqual({ authoredSkillIds: [], unplaceableSkillIds: [UNPLACEABLE] });
    });

    it("keeps it at global scope as well, where nothing else would have", () => {
      const installed = buildProjectConfig({
        skills: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(UNPLACEABLE, { scope: "global" }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });
      const { result: decoded, skippedSkillIds } = decodedAlsoNaming(REACT);

      const { result, kept } = reconcileSharedConfig({
        decoded,
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(skippedSkillIds),
      });

      // The scope reason is gone, so this entry survives on the catalogue reason alone —
      // which is the one that is true of it, and the one whose remedy (`update`, then apply
      // again) is the one that works.
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT, UNPLACEABLE]);
      expect(kept.unplaceableSkillIds).toStrictEqual([UNPLACEABLE]);
    });

    it("calls it authored where it is that too, which is the stronger claim", () => {
      const installed = buildProjectConfig({
        skills: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(UNPLACEABLE, { scope: "project" }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });
      const { result: decoded, skippedSkillIds } = decodedAlsoNaming(REACT);

      const { kept } = reconcileSharedConfig({
        decoded,
        installed,
        authoredHere: new Set<SkillId>([UNPLACEABLE]),
        unplaceable: new Set(skippedSkillIds),
      });

      // A skill nobody installed cannot be removed by any shared configuration from anywhere,
      // whatever this catalogue can or cannot place — so the permanent reason is the one worth
      // stating, and its remedy (`edit`) is the one that works.
      expect(kept.authoredSkillIds).toStrictEqual([UNPLACEABLE]);
      expect(kept.unplaceableSkillIds).toStrictEqual([]);
    });

    it("keeps a tombstone's id out of it, because nothing of it is installed", () => {
      const installed = buildProjectConfig({
        skills: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(UNPLACEABLE, { scope: "global", excluded: true }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });
      const { result: decoded, skippedSkillIds } = decodedAlsoNaming(REACT);

      const { result, kept } = reconcileSharedConfig({
        decoded,
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(skippedSkillIds),
      });

      // An excluded entry is a statement about something that is NOT installed here. There are
      // no files to protect and nothing to tell the user is staying, whichever reason would
      // otherwise have protected it.
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT]);
      expect(kept).toStrictEqual(NOTHING_KEPT);
    });
  });

  describe("what a kept entry takes with it", () => {
    it("carries the stack rows naming a kept skill onto the sub-agent that held them", () => {
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([REACT, ZUSTAND], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        stack: {
          [WEB_DEV]: {
            "web-framework": [sa(REACT)],
            "web-client-state": [sa(ZUSTAND, true)],
          },
        },
      });

      const { result } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set<SkillId>([ZUSTAND]),
        unplaceable: new Set(),
      });

      // `assignedStack` REPLACES the ownership-derived stack, so a kept entry with no row in it
      // is kept in the config and carried by nobody — installed, and loaded by no sub-agent.
      // The payload's own row for React stands; the kept row rides beside it at its own load
      // state, because the payload never spoke about it.
      expect(result.assignedStack).toStrictEqual({
        [WEB_DEV]: {
          "web-framework": [sa(REACT)],
          "web-client-state": [sa(ZUSTAND, true)],
        },
      });
    });

    it("drops a kept skill's row under a sub-agent this configuration removes", () => {
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([REACT, ZUSTAND], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV, API_DEV], { scope: "project" }),
        stack: {
          [WEB_DEV]: { "web-framework": [sa(REACT)] },
          [API_DEV]: { "web-client-state": [sa(ZUSTAND)] },
        },
      });

      const { result } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set<SkillId>([ZUSTAND]),
        unplaceable: new Set(),
      });

      // The sub-agent IS this run's to remove, and a stack row naming a sub-agent no
      // configuration installs is what `compile` warns about and drops. The kept skill stays;
      // the row that pointed at a departed sub-agent does not.
      expect(result.assignedStack).toStrictEqual({
        [WEB_DEV]: { "web-framework": [sa(REACT)] },
      });
    });

    it("puts a kept skill's domain back on the selected list", () => {
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([REACT, HONO], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });

      const { result } = reconcileSharedConfig({
        decoded: decodedFor(REACT),
        installed,
        authoredHere: new Set<SkillId>([HONO]),
        unplaceable: new Set(),
      });

      // `selectedDomains` is what the next `edit` opens on. A kept skill whose domain fell off
      // the list is hidden from that wizard, deselected by the act of not being shown, and
      // deleted by the run after this one — a removal this one promised not to make.
      expect(result.selectedDomains).toStrictEqual(["web", "api"]);
    });
  });

  describe("the shape handed on", () => {
    it("leaves everything the payload decides untouched", () => {
      const decoded = decodedFor(REACT);
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([ZUSTAND], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      });

      const { result } = reconcileSharedConfig({
        decoded,
        installed,
        authoredHere: new Set<SkillId>([ZUSTAND]),
        unplaceable: new Set(),
      });

      // Reconciling is additive by construction: it may put back what this run is not allowed to
      // remove, and it may not restate anything the payload said.
      expect(result.selectedStackId).toBe(decoded.selectedStackId);
      expect(result.validation).toStrictEqual(decoded.validation);
      expect(result.cancelled).toBe(false);
      expect(result.unresolvableSkillIds).toStrictEqual([]);
    });

    it("returns the payload untouched where there is no installation to reconcile against", () => {
      const decoded = decodedFor(REACT);

      const { result, kept } = reconcileSharedConfig({
        decoded,
        installed: null,
        authoredHere: new Set(),
        unplaceable: new Set(),
      });

      expect(result).toStrictEqual(decoded);
      expect(kept).toStrictEqual(NOTHING_KEPT);
    });

    it("keeps nothing off a wizard result that carries no assigned stack", () => {
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([ZUSTAND], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        stack: { [WEB_DEV]: { "web-client-state": [sa(ZUSTAND)] } },
      });

      const { result } = reconcileSharedConfig({
        decoded: buildWizardResult(buildSkillConfigs([REACT]), {
          selectedAgents: [WEB_DEV],
          agentConfigs: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        }),
        installed,
        authoredHere: new Set<SkillId>([ZUSTAND]),
        unplaceable: new Set(),
      });

      // An absent `assignedStack` tells the merger to leave the stack on disk alone, so a kept
      // row does not need carrying — and inventing the key here would replace that whole stack
      // with the one row this reconcile happens to know about.
      expect(result.assignedStack).toBeUndefined();
    });
  });
});
