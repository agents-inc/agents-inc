import { beforeEach, describe, expect, it } from "vitest";

import {
  holdInstalledGlobal,
  installPlanLines,
  notInstalledGlobally,
  reconcileSharedConfig,
  restoreInstalledGlobal,
  withUnplaceableAssignees,
  type InstalledGlobal,
  type KeptFromRoundTrip,
} from "./seed-apply";
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
import {
  CATEGORY_EXCLUSIVITY_MATRIX,
  HEALTH_AUDIT_UNIVERSAL_IN_EXCLUSIVE_MATRIX,
  HEALTH_AUDIT_UNIVERSAL_IN_OPEN_MATRIX,
  REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
} from "../__tests__/mock-data/mock-matrices.js";
import { SKILLS } from "../__tests__/test-fixtures.js";

import type { MergedSkillsMatrix, SkillId } from "../../types/index.js";

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
 * Scope is not one of them HERE, which is why `reconcileSharedConfig` takes no authority word and a
 * global entry the payload omits stays in its removal set. From a project the global install is
 * put back whole afterwards, by `restoreInstalledGlobal` — a project run only ADDS to the global
 * install — and its own describe block below is where that is held.
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
const PINIA = SKILLS.pinia.id;
const VUE = SKILLS.vue.id;
const SCSS = SKILLS.scss.id;
const TAILWIND = SKILLS.tailwind.id;
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
 * {@link decodedFor}, against a catalogue that declares which of its categories hold one skill —
 * the one the reconcile is then asked about, so the matrix is named rather than defaulted.
 */
function decodedAgainst(skillId: SkillId, catalogue: MergedSkillsMatrix) {
  return seedToWizardResult(payloadFor(skillId), catalogue).result;
}

/**
 * Tailwind and SCSS on the one sub-agent, decoded against a catalogue carrying Tailwind alone — so
 * SCSS is the id the configuration names and this catalogue cannot place. Returned whole, for the
 * reason {@link decodedAlsoNaming} gives.
 */
function decodedAlsoNamingScss(catalogue: MergedSkillsMatrix) {
  return seedToWizardResult(
    buildSeedPayload({
      skills: {
        [TAILWIND]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
        [SCSS]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
      },
      agents: { [WEB_DEV]: { scope: "project" } },
    }),
    catalogue,
  );
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

      // Scope buys an entry nothing HERE: this module answers authorship and placement only.
      // From a project the global install is put back whole afterwards, by
      // `restoreInstalledGlobal`, so the removal set this leaves is not the one `edit` acts on.
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
      // directory, so with scope answered elsewhere there is nothing here that can keep one.
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

    it("joins a kept skill written here to the payload's own row under a category that holds several", () => {
      // Declared open by this matrix. `createMockCategory` makes a category exclusive unless told
      // otherwise, so a category this spec does not declare open holds one skill.
      initializeMatrix(CATEGORY_EXCLUSIVITY_MATRIX);
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([SCSS, TAILWIND], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        stack: { [WEB_DEV]: { "web-styling": [sa(SCSS), sa(TAILWIND)] } },
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedAgainst(SCSS, CATEGORY_EXCLUSIVITY_MATRIX),
        installed,
        authoredHere: new Set<SkillId>([TAILWIND]),
        unplaceable: new Set(),
      });

      // The subject guard: the kept skill is kept for authorship, so its row is the one carried.
      expect(kept.authoredSkillIds).toStrictEqual([TAILWIND]);
      // The payload assigns SCSS to this sub-agent and the user's own skill sits in the same
      // category. A kept row that REPLACES the category's array leaves SCSS installed and loaded
      // by nobody, which the plan never said; joined, both stay assigned, the payload's first.
      expect(result.assignedStack).toStrictEqual({
        [WEB_DEV]: { "web-styling": [sa(SCSS), sa(TAILWIND)] },
      });
    });

    it("joins a kept skill this catalogue cannot place to the payload's own row under a category that holds several", () => {
      initializeMatrix(HEALTH_AUDIT_UNIVERSAL_IN_OPEN_MATRIX);
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([TAILWIND, SCSS], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        stack: { [WEB_DEV]: { "web-styling": [sa(TAILWIND), sa(SCSS)] } },
      });
      const { result: decoded, skippedSkillIds } = decodedAlsoNamingScss(
        HEALTH_AUDIT_UNIVERSAL_IN_OPEN_MATRIX,
      );
      // The subject guard: the matrix carries Tailwind and not SCSS, so the decode places one
      // and skips the other.
      expect(skippedSkillIds).toStrictEqual([SCSS]);

      const { result, kept } = reconcileSharedConfig({
        decoded,
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(skippedSkillIds),
      });

      expect(kept.unplaceableSkillIds).toStrictEqual([SCSS]);
      // The same join for the catalogue's reason: the payload named both skills on this
      // sub-agent, and keeping the one it could not place must not cost it the one it did.
      expect(result.assignedStack).toStrictEqual({
        [WEB_DEV]: { "web-styling": [sa(TAILWIND), sa(SCSS)] },
      });
    });

    it("gives a category that holds one skill to the payload's own, and keeps the skill written here unassigned there", () => {
      initializeMatrix(CATEGORY_EXCLUSIVITY_MATRIX);
      // The user swapped React for their own framework skill, which is the row installed.
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([REACT, VUE], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        stack: { [WEB_DEV]: { "web-framework": [sa(VUE)] } },
      });

      const { result, kept } = reconcileSharedConfig({
        decoded: decodedAgainst(REACT, CATEGORY_EXCLUSIVITY_MATRIX),
        installed,
        authoredHere: new Set<SkillId>([VUE]),
        unplaceable: new Set(),
      });

      // Kept, files and entry both: nothing about a slot makes the user's own skill this run's
      // to remove.
      expect(kept.authoredSkillIds).toStrictEqual([VUE]);
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT, VUE]);
      // The category holds one skill, and the payload names React for it. Joined, the row holds
      // two, which the config writer refuses — after the question, with the removals already
      // made. The payload's skill takes the slot, and the kept one is assigned nowhere in it.
      expect(
        result.assignedStack,
        "a kept row must not join a category that holds one skill and the payload already fills",
      ).toStrictEqual({
        [WEB_DEV]: { "web-framework": [sa(REACT)] },
      });
    });

    it("gives a category that holds one skill to the payload's own, and keeps the skill it cannot place unassigned there", () => {
      initializeMatrix(HEALTH_AUDIT_UNIVERSAL_IN_EXCLUSIVE_MATRIX);
      const installed = buildProjectConfig({
        skills: buildSkillConfigs([TAILWIND, SCSS], { scope: "project" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        stack: { [WEB_DEV]: { "web-styling": [sa(SCSS)] } },
      });
      const { result: decoded, skippedSkillIds } = decodedAlsoNamingScss(
        HEALTH_AUDIT_UNIVERSAL_IN_EXCLUSIVE_MATRIX,
      );
      expect(skippedSkillIds).toStrictEqual([SCSS]);

      const { result, kept } = reconcileSharedConfig({
        decoded,
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(skippedSkillIds),
      });

      expect(kept.unplaceableSkillIds).toStrictEqual([SCSS]);
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([TAILWIND, SCSS]);
      // The same slot for the catalogue's reason: the skill this catalogue could place takes it.
      expect(
        result.assignedStack,
        "a kept row must not join a category that holds one skill and the payload already fills",
      ).toStrictEqual({
        [WEB_DEV]: { "web-styling": [sa(TAILWIND)] },
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

/**
 * A sub-agent the decode left out only because the one skill carrying it in was skipped. The
 * payload named it, so a destructive apply keeps it — and one the payload did not name, or switched
 * off, it does not.
 */
describe("withUnplaceableAssignees", () => {
  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
  });

  /** React on web-developer, and the unplaceable id alone on api-developer. */
  const installed = buildProjectConfig({
    skills: buildSkillConfigs([REACT, UNPLACEABLE], { scope: "project" }),
    agents: buildAgentConfigs([WEB_DEV, API_DEV], { scope: "project" }),
    stack: {
      [WEB_DEV]: { "web-framework": [sa(REACT)] },
      [API_DEV]: { "web-testing": [sa(UNPLACEABLE)] },
    },
  });

  /** React on web-developer, the unplaceable id on whichever sub-agents are named. */
  function payloadAssigningUnplaceableTo(
    agentNames: string[],
    apiDeveloper: { on?: boolean } = {},
  ) {
    return buildSeedPayload({
      skills: {
        [REACT]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
        [UNPLACEABLE]: buildSeedSkill({
          scope: "project",
          assignments: Object.fromEntries(agentNames.map((name) => [name, "lazy"])),
        }),
      },
      agents: {
        [WEB_DEV]: { scope: "project" },
        [API_DEV]: { scope: "project", ...apiDeveloper },
      },
    });
  }

  function decodeAndKeep(payload: ReturnType<typeof buildSeedPayload>) {
    const { result, skippedSkillIds } = seedToWizardResult(
      payload,
      REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
    );
    return withUnplaceableAssignees(result, installed, payload, new Set(skippedSkillIds));
  }

  it("keeps an installed sub-agent the payload assigns an unplaceable skill to", () => {
    const kept = decodeAndKeep(payloadAssigningUnplaceableTo([API_DEV]));

    expect(kept.selectedAgents).toStrictEqual([WEB_DEV, API_DEV]);
    expect(kept.agentConfigs).toStrictEqual(
      buildAgentConfigs([WEB_DEV, API_DEV], { scope: "project" }),
    );
  });

  it("leaves out a sub-agent the payload does not assign it to, or switches off", () => {
    const notAssigned = decodeAndKeep(payloadAssigningUnplaceableTo([WEB_DEV]));
    const switchedOff = decodeAndKeep(payloadAssigningUnplaceableTo([API_DEV], { on: false }));

    expect(notAssigned.selectedAgents).toStrictEqual([WEB_DEV]);
    expect(switchedOff.selectedAgents).toStrictEqual([WEB_DEV]);
  });
});

/**
 * From a project, `--from` only ADDS to the global install above it: every global entry it
 * already holds stays as installed — the skill's install mode, the sub-agent's tuning, and the
 * rows that sub-agent already has — and only what it lacks arrives, a skill together with its
 * rows. `edit --from` additionally puts back the global entries a configuration leaves out,
 * because its apply removes whatever is absent.
 */
describe("holding the global install as installed", () => {
  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
  });

  /** The global installation above the project: Zustand, on a global api-developer. */
  const installedGlobal: InstalledGlobal = buildProjectConfig({
    skills: buildSkillConfigs([ZUSTAND], { scope: "global" }),
    agents: buildAgentConfigs([API_DEV], { scope: "global" }),
    stack: { [API_DEV]: { "web-client-state": [sa(ZUSTAND)] } },
  });

  /** A configuration with React in the project, and `global` entries on api-developer. */
  function decodedWithGlobal(
    global: Record<string, ReturnType<typeof buildSeedSkill>>,
    apiDeveloper: { model?: "haiku" } = {},
  ) {
    return seedToWizardResult(
      buildSeedPayload({
        skills: {
          [REACT]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
          ...global,
        },
        agents: {
          [WEB_DEV]: { scope: "project" },
          [API_DEV]: { scope: "global", ...apiDeveloper },
        },
      }),
      REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
    ).result;
  }

  const onApiDeveloper = (load: "lazy" | "preloaded" = "lazy") =>
    buildSeedSkill({ scope: "global", assignments: { [API_DEV]: load } });

  it("names nothing kept where the configuration states the global install exactly", () => {
    const decoded = decodedWithGlobal({ [ZUSTAND]: onApiDeveloper() });

    const held = holdInstalledGlobal(decoded, installedGlobal);

    expect(held.result).toStrictEqual(decoded);
    expect(held.installed).toStrictEqual({ skillIds: [ZUSTAND], agentNames: [API_DEV] });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [] });
  });

  it("keeps a held sub-agent's rows and tuning as installed, and names it", () => {
    const decoded = decodedWithGlobal(
      { [ZUSTAND]: onApiDeveloper("preloaded") },
      { model: "haiku" },
    );

    const held = holdInstalledGlobal(decoded, installedGlobal);

    expect(held.result.agentConfigs).toStrictEqual([
      ...buildAgentConfigs([WEB_DEV], { scope: "project" }),
      ...buildAgentConfigs([API_DEV], { scope: "global" }),
    ]);
    expect(held.result.assignedStack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(REACT)] },
      [API_DEV]: { "web-client-state": [sa(ZUSTAND)] },
    });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [API_DEV] });
  });

  it("keeps a held skill's install mode as installed, and names it", () => {
    const pluginInstalled: InstalledGlobal = {
      ...installedGlobal,
      skills: buildSkillConfigs([ZUSTAND], { scope: "global", origin: "agents-inc" }),
    };

    const held = holdInstalledGlobal(
      decodedWithGlobal({ [ZUSTAND]: onApiDeveloper() }),
      pluginInstalled,
    );

    expect(held.result.skills).toStrictEqual([
      buildSkillConfig(REACT, { scope: "project" }),
      buildSkillConfig(ZUSTAND, { scope: "global", origin: "agents-inc" }),
    ]);
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [ZUSTAND], agentNames: [] });
  });

  it("adds a global skill the install lacks together with its row on a held sub-agent", () => {
    const decoded = decodedWithGlobal({
      [ZUSTAND]: onApiDeveloper(),
      [HONO]: onApiDeveloper(),
    });

    const held = holdInstalledGlobal(decoded, installedGlobal);

    // Hono arrives as the configuration states it, assignment and all: api-developer is the
    // global install's, so it keeps the row it has and gains Hono's. That is exactly what the
    // configuration states for it, so nothing about it is named as kept.
    expect(held.result.skills).toContainEqual(buildSkillConfig(HONO, { scope: "global" }));
    expect(held.installed.skillIds).toStrictEqual([ZUSTAND]);
    expect(held.result.assignedStack?.[API_DEV]).toStrictEqual({
      "web-client-state": [sa(ZUSTAND)],
      "api-api": [sa(HONO)],
    });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [] });
  });

  it("keeps a held sub-agent's own rows beside a new skill's, and names it", () => {
    // The configuration gives api-developer Hono alone, and leaves out the Zustand row the global
    // install gives it. A project run removes nothing global, so that row stays — and the
    // sub-agent is named, because it is not the one the configuration describes.
    const decoded = decodedWithGlobal({ [HONO]: onApiDeveloper() });

    const held = holdInstalledGlobal(decoded, installedGlobal);

    expect(held.result.assignedStack?.[API_DEV]).toStrictEqual({
      "web-client-state": [sa(ZUSTAND)],
      "api-api": [sa(HONO)],
    });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [API_DEV] });
  });

  it("adds no row a held sub-agent's exclusive category has no room for, and names it", () => {
    // Zustand and Pinia share a category that holds one skill. api-developer already loads
    // Zustand there, and that row stays — so Pinia arrives in the global install, but not on
    // api-developer, and the sub-agent is named because the configuration describes it otherwise.
    initializeMatrix(CATEGORY_EXCLUSIVITY_MATRIX);
    const decoded = seedToWizardResult(
      buildSeedPayload({
        skills: { [PINIA]: onApiDeveloper() },
        agents: { [API_DEV]: { scope: "global" } },
      }),
      CATEGORY_EXCLUSIVITY_MATRIX,
    ).result;

    const held = holdInstalledGlobal(decoded, installedGlobal);

    expect(held.result.skills).toStrictEqual([buildSkillConfig(PINIA, { scope: "global" })]);
    expect(held.result.assignedStack?.[API_DEV]).toStrictEqual({
      "web-client-state": [sa(ZUSTAND)],
    });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [API_DEV] });
  });

  it("leaves a project-scoped entry alone where it names a global one", () => {
    // A project copy over a global one is the project's own override, not a change to the
    // global install, so nothing about it is held.
    const decoded = decodedFor(ZUSTAND, "project");

    const held = holdInstalledGlobal(decoded, installedGlobal);

    expect(held.result).toStrictEqual(decoded);
    expect(held.installed).toStrictEqual({ skillIds: [], agentNames: [] });
  });

  it("holds nothing where there is no global install to hold", () => {
    const decoded = decodedWithGlobal({ [ZUSTAND]: onApiDeveloper("preloaded") });

    const held = holdInstalledGlobal(decoded, null);

    expect(held.result).toStrictEqual(decoded);
    expect(held.installed).toStrictEqual({ skillIds: [], agentNames: [] });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [] });
  });

  it("puts back, for a destructive apply, every global entry the configuration leaves out", () => {
    const decoded = decodedFor(REACT);

    const { result } = restoreInstalledGlobal(decoded, installedGlobal);

    expect(result.skills).toStrictEqual([
      ...decoded.skills,
      buildSkillConfig(ZUSTAND, { scope: "global" }),
    ]);
    expect(result.agentConfigs).toStrictEqual([
      ...decoded.agentConfigs,
      ...buildAgentConfigs([API_DEV], { scope: "global" }),
    ]);
    expect(result.selectedAgents).toStrictEqual([WEB_DEV, API_DEV]);
    expect(result.assignedStack).toStrictEqual({
      ...decoded.assignedStack,
      [API_DEV]: { "web-client-state": [sa(ZUSTAND)] },
    });
  });

  it("names every global entry it puts back as kept, sub-agents as well as skills", () => {
    const { keptAsInstalled } = restoreInstalledGlobal(decodedFor(REACT), installedGlobal);

    expect(
      keptAsInstalled,
      "a global sub-agent the configuration leaves out is kept, so the plan must name it",
    ).toStrictEqual({ skillIds: [ZUSTAND], agentNames: [API_DEV] });
  });

  it("writes no carried bytes over a skill the global install holds", () => {
    const held = holdInstalledGlobal(
      decodedWithGlobal({ [ZUSTAND]: onApiDeveloper() }),
      installedGlobal,
    );

    expect(notInstalledGlobally([{ id: ZUSTAND }, { id: HONO }], held)).toStrictEqual([
      { id: HONO },
    ]);
  });

  it("lists what arrives where, then the global skills it skips as already installed", () => {
    const held = holdInstalledGlobal(
      decodedWithGlobal({ [ZUSTAND]: onApiDeveloper(), [HONO]: onApiDeveloper() }),
      installedGlobal,
    );

    expect(installPlanLines(held)).toStrictEqual([
      "Into this project:",
      "  Skills:",
      `    ${SKILLS.react.displayName} (${REACT})`,
      "  Sub-agents:",
      `    ${WEB_DEV}`,
      "Into the global install:",
      "  Skills:",
      `    ${SKILLS.hono.displayName} (${HONO})`,
      "Skipped, already in the global install:",
      "  Skills:",
      `    ${SKILLS.zustand.displayName} (${ZUSTAND})`,
    ]);
  });
});
