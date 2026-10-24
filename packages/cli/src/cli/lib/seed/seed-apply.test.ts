import { beforeEach, describe, expect, it } from "vitest";

import {
  holdInstalledGlobal,
  installsAtHome,
  joinedStatement,
  notInstalledGlobally,
  projectScopedContent,
  reconcileSharedConfig,
  restoreInstalledGlobal,
  type InstalledGlobal,
  type KeptFromRoundTrip,
} from "./seed-apply";
import { seedToInstallSelection } from "./seed-to-selection";
import { initializeMatrix } from "../matrix/matrix-provider";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";
import { sa, saUnflagged } from "../__tests__/factories/skill-factories.js";
import { buildSkillConfig, buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import {
  CATEGORY_EXCLUSIVITY_MATRIX,
  HEALTH_AUDIT_UNIVERSAL_IN_EXCLUSIVE_MATRIX,
  HEALTH_AUDIT_UNIVERSAL_IN_OPEN_MATRIX,
  REACT_ZUSTAND_HONO_OPEN_CLIENT_STATE_MATRIX,
  REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
} from "../__tests__/mock-data/mock-matrices.js";
import { SKILLS } from "../__tests__/test-fixtures.js";

import type { MergedSkillsMatrix, SkillConfig, SkillId } from "../../types/index.js";

/** The whole shape, so an authorship keep cannot read as a catalogue keep. */
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

/** A real id this matrix does not carry, so a payload naming it decodes to a skip. */
const UNPLACEABLE = SKILLS.vitest.id;

function payloadFor(skillId: SkillId, scope: "project" | "global" = "project") {
  return buildSeedPayload({
    skills: { [skillId]: buildSeedSkill({ scope, assignments: { [WEB_DEV]: "lazy" } }) },
    agents: { [WEB_DEV]: { scope: "project" } },
  });
}

function decodedFor(skillId: SkillId, scope: "project" | "global" = "project") {
  return seedToInstallSelection(
    payloadFor(skillId, scope),
    REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
  ).result;
}

/** The matrix is named rather than defaulted: it declares which categories hold one skill. */
function decodedAgainst(skillId: SkillId, catalogue: MergedSkillsMatrix) {
  return seedToInstallSelection(payloadFor(skillId), catalogue).result;
}

/** SCSS is named by the configuration and unplaceable here; returned whole, as below. */
function decodedAlsoNamingScss(catalogue: MergedSkillsMatrix) {
  return seedToInstallSelection(
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

/** Returned whole: the skipped ids are what the command hands the reconcile as `unplaceable`. */
function decodedAlsoNaming(skillId: SkillId, scope: "project" | "global" = "project") {
  return seedToInstallSelection(
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

      // The project's own skill the payload left out does not come back.
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

      // Scope buys nothing here; `restoreInstalledGlobal` answers it afterwards.
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

      // Authorship is a property of a skill directory, so nothing here keeps a sub-agent.
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

      // `forkedFrom` decides whether there is a removal at all, whatever the scope.
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

      // The payload names this id, so there is nothing to keep or disclose.
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

      // A tombstone describes something not installed, so there is nothing to protect.
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

      // The payload asked for this skill: its absence from the decode is not an instruction.
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

      // Kept on the catalogue reason alone, whose remedy (`update`, then apply) works.
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

      // Authorship is the permanent reason, so it is the one stated.
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

      // A tombstone describes something not installed, so neither reason protects it.
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

      // `assignedStack` replaces the derived stack, so a kept skill's row must be carried.
      expect(result.assignedStack).toStrictEqual({
        [WEB_DEV]: {
          "web-framework": [sa(REACT)],
          "web-client-state": [sa(ZUSTAND, true)],
        },
      });
    });

    it("joins a kept skill written here to the payload's own row under a category that holds several", () => {
      // `createMockCategory` makes categories exclusive unless declared open.
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

      // Subject guard: kept for authorship.
      expect(kept.authoredSkillIds).toStrictEqual([TAILWIND]);
      // Joined rather than replaced, so SCSS stays assigned; the payload's row first.
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
      // Subject guard: the decode places Tailwind and skips SCSS.
      expect(skippedSkillIds).toStrictEqual([SCSS]);

      const { result, kept } = reconcileSharedConfig({
        decoded,
        installed,
        authoredHere: new Set(),
        unplaceable: new Set(skippedSkillIds),
      });

      expect(kept.unplaceableSkillIds).toStrictEqual([SCSS]);
      // The same join for the catalogue's reason.
      expect(result.assignedStack).toStrictEqual({
        [WEB_DEV]: { "web-styling": [sa(TAILWIND), sa(SCSS)] },
      });
    });

    it("gives a category that holds one skill to the payload's own, and keeps the skill written here unassigned there", () => {
      initializeMatrix(CATEGORY_EXCLUSIVITY_MATRIX);
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

      // Kept, files and entry: a slot does not make the user's skill this run's to remove.
      expect(kept.authoredSkillIds).toStrictEqual([VUE]);
      expect(result.skills.map((skill) => skill.id)).toStrictEqual([REACT, VUE]);
      // A one-skill category the payload fills: its skill takes the slot.
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
      // The same slot for the catalogue's reason.
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

      // The departed sub-agent's row goes with it; the kept skill stays.
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

      // A kept skill's domain must stay selected, or the next `edit` hides and then deletes it.
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

      // Additive: nothing the payload said is restated.
      expect(result.selectedStackId).toBe(decoded.selectedStackId);
      expect(result.validation).toStrictEqual(decoded.validation);
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
  });
});

/** A sub-agent carried in only by a skipped skill is kept, unless unnamed or switched off. */
describe("an installed sub-agent whose only skill this catalogue cannot place", () => {
  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
  });

  const installed = buildProjectConfig({
    skills: buildSkillConfigs([REACT, UNPLACEABLE], { scope: "project" }),
    agents: buildAgentConfigs([WEB_DEV, API_DEV], { scope: "project" }),
    stack: {
      [WEB_DEV]: { "web-framework": [sa(REACT)] },
      [API_DEV]: { "web-testing": [sa(UNPLACEABLE)] },
    },
  });

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
    const { result, skippedSkillIds } = seedToInstallSelection(
      payload,
      REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
    );
    return reconcileSharedConfig({
      decoded: result,
      installed,
      authoredHere: new Set(),
      unplaceable: new Set(skippedSkillIds),
    }).result;
  }

  it("is kept where the payload assigns that skill to it", () => {
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

describe("holding the global install as installed", () => {
  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
  });

  const installedGlobal: InstalledGlobal = buildProjectConfig({
    skills: buildSkillConfigs([ZUSTAND], { scope: "global" }),
    agents: buildAgentConfigs([API_DEV], { scope: "global" }),
    stack: { [API_DEV]: { "web-client-state": [sa(ZUSTAND)] } },
  });

  function decodedWithGlobal(
    global: Record<string, ReturnType<typeof buildSeedSkill>>,
    apiDeveloper: { model?: "haiku"; codexModel?: string } = {},
  ) {
    return seedToInstallSelection(
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
    const installedNamingZustand: InstalledGlobal = {
      ...installedGlobal,
      skills: buildSkillConfigs([ZUSTAND], {
        scope: "global",
        displayName: SKILLS.zustand.displayName,
      }),
    };

    const held = holdInstalledGlobal(decoded, installedNamingZustand);

    expect(held.result).toStrictEqual(decoded);
    expect(held.installed).toStrictEqual({ skillIds: [ZUSTAND], agentNames: [API_DEV] });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [] });
    expect(held.joined).toStrictEqual([]);
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

  it("keeps a held sub-agent whose Codex model alone differs, and names it", () => {
    const decoded = decodedWithGlobal(
      { [ZUSTAND]: onApiDeveloper() },
      { codexModel: "gpt-5.6-terra" },
    );

    const held = holdInstalledGlobal(decoded, installedGlobal);

    expect(held.result.agentConfigs).toStrictEqual([
      ...buildAgentConfigs([WEB_DEV], { scope: "project" }),
      ...buildAgentConfigs([API_DEV], { scope: "global" }),
    ]);
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [API_DEV] });
  });

  it("names nothing kept where the configuration restates the held Codex model", () => {
    const pinnedGlobal: InstalledGlobal = {
      ...installedGlobal,
      agents: buildAgentConfigs([API_DEV], { scope: "global", codexModel: "gpt-5.6-terra" }),
    };
    const decoded = decodedWithGlobal(
      { [ZUSTAND]: onApiDeveloper() },
      { codexModel: "gpt-5.6-terra" },
    );

    const held = holdInstalledGlobal(decoded, pinnedGlobal);

    expect(held.result.agentConfigs).toStrictEqual([
      ...buildAgentConfigs([WEB_DEV], { scope: "project" }),
      ...buildAgentConfigs([API_DEV], { scope: "global", codexModel: "gpt-5.6-terra" }),
    ]);
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [] });
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
      buildSkillConfig(REACT, { scope: "project", displayName: SKILLS.react.displayName }),
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

    // api-developer gains Hono's row beside its own, so it is named as added to, not kept.
    expect(held.result.skills).toContainEqual(
      buildSkillConfig(HONO, { scope: "global", displayName: SKILLS.hono.displayName }),
    );
    expect(held.installed.skillIds).toStrictEqual([ZUSTAND]);
    expect(held.result.assignedStack[API_DEV]).toStrictEqual({
      "web-client-state": [sa(ZUSTAND)],
      "api-api": [sa(HONO)],
    });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [] });
    expect(held.joined).toStrictEqual([{ agentName: API_DEV, skillIds: [HONO] }]);
  });

  it("names a held sub-agent a new skill joins as added to, never as kept as installed", () => {
    // The sub-agent changes, so calling it kept as installed would contradict the write.
    const decoded = decodedWithGlobal({ [HONO]: onApiDeveloper() });

    const held = holdInstalledGlobal(decoded, installedGlobal);

    expect(held.result.assignedStack[API_DEV]).toStrictEqual({
      "web-client-state": [sa(ZUSTAND)],
      "api-api": [sa(HONO)],
    });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [] });
    expect(held.joined).toStrictEqual([{ agentName: API_DEV, skillIds: [HONO] }]);
  });

  it("adds no row a held sub-agent's exclusive category has no room for, and names it", () => {
    // One-skill category: Pinia arrives globally but not on api-developer, which is named.
    initializeMatrix(CATEGORY_EXCLUSIVITY_MATRIX);
    const decoded = seedToInstallSelection(
      buildSeedPayload({
        skills: { [PINIA]: onApiDeveloper() },
        agents: { [API_DEV]: { scope: "global" } },
      }),
      CATEGORY_EXCLUSIVITY_MATRIX,
    ).result;

    const held = holdInstalledGlobal(decoded, installedGlobal);

    expect(held.result.skills).toStrictEqual([
      buildSkillConfig(PINIA, { scope: "global", displayName: SKILLS.pinia.displayName }),
    ]);
    expect(held.result.assignedStack[API_DEV]).toStrictEqual({
      "web-client-state": [sa(ZUSTAND)],
    });
    expect(held.keptAsInstalled).toStrictEqual({ skillIds: [], agentNames: [API_DEV] });
    expect(held.joined, "nothing reached api-developer, so nothing was added to it").toStrictEqual(
      [],
    );
  });

  it("leaves a project-scoped entry alone where it names a global one", () => {
    // A project copy over a global one is the project's own override; nothing is held.
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
    const { keptAsInstalled, joined } = restoreInstalledGlobal(decodedFor(REACT), installedGlobal);

    expect(
      keptAsInstalled,
      "a global sub-agent the configuration leaves out is kept, so the plan must name it",
    ).toStrictEqual({ skillIds: [ZUSTAND], agentNames: [API_DEV] });
    expect(joined).toStrictEqual([]);
  });

  it("keeps the skill a configuration drops, and names the sub-agent its new skill joins as added to", () => {
    // From a project: the configuration drops Zustand and gives api-developer Hono instead.
    const { result, keptAsInstalled, joined } = restoreInstalledGlobal(
      decodedWithGlobal({ [HONO]: onApiDeveloper() }),
      installedGlobal,
    );

    expect(result.assignedStack[API_DEV]).toStrictEqual({
      "web-client-state": [sa(ZUSTAND)],
      "api-api": [sa(HONO)],
    });
    expect(keptAsInstalled).toStrictEqual({ skillIds: [ZUSTAND], agentNames: [] });
    expect(joined).toStrictEqual([{ agentName: API_DEV, skillIds: [HONO] }]);
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

  it("names a held sub-agent a new row joins as added to, with the skill it gains", () => {
    const held = holdInstalledGlobal(
      decodedWithGlobal({ [ZUSTAND]: onApiDeveloper(), [HONO]: onApiDeveloper() }),
      installedGlobal,
    );

    expect(joinedStatement(held)).toStrictEqual([
      [
        "Added to sub-agents in the global install — each keeps everything it already has, since a project run only adds to the global install:",
        `  sub-agent ${API_DEV}: + ${HONO}`,
      ].join("\n"),
    ]);
  });
});

describe("reconcileSharedConfig — what it hands back beside the result", () => {
  it("names a kept row a filled one-skill category displaced as unassigned", () => {
    initializeMatrix(CATEGORY_EXCLUSIVITY_MATRIX);
    const installed = buildProjectConfig({
      skills: buildSkillConfigs([REACT, VUE], { scope: "project" }),
      agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      stack: { [WEB_DEV]: { "web-framework": [sa(VUE)] } },
    });

    const { unassigned } = reconcileSharedConfig({
      decoded: decodedAgainst(REACT, CATEGORY_EXCLUSIVITY_MATRIX),
      installed,
      authoredHere: new Set<SkillId>([VUE]),
      unplaceable: new Set(),
    });

    expect(unassigned).toStrictEqual([
      { skillId: VUE, agentName: WEB_DEV, category: "web-framework" },
    ]);
  });

  it("leaves the selected domains as they are when a kept skill's domain is already among them", () => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
    const decoded = { ...decodedFor(REACT), selectedDomains: ["api" as const, "web" as const] };
    const installed = buildProjectConfig({
      skills: buildSkillConfigs([REACT, ZUSTAND], { scope: "project" }),
      agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
    });

    const { result } = reconcileSharedConfig({
      decoded,
      installed,
      authoredHere: new Set<SkillId>([ZUSTAND]),
      unplaceable: new Set(),
    });

    expect(result.selectedDomains).toStrictEqual(["api", "web"]);
  });
});

/** A sub-agent never depends on a skill loading, so whether the installation holds it is moot. */
describe("a sub-agent an unplaceable skill names, whatever the installation holds of it", () => {
  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
  });

  const payload = buildSeedPayload({
    skills: {
      [REACT]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
      [UNPLACEABLE]: buildSeedSkill({ scope: "project", assignments: { [API_DEV]: "lazy" } }),
    },
    agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "project" } },
  });

  function keptAgainst(installedSkills: SkillConfig[]) {
    const { result, skippedSkillIds } = seedToInstallSelection(
      payload,
      REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
    );
    const installed = buildProjectConfig({
      skills: installedSkills,
      agents: buildAgentConfigs([WEB_DEV, API_DEV], { scope: "project" }),
    });
    return reconcileSharedConfig({
      decoded: result,
      installed,
      authoredHere: new Set(),
      unplaceable: new Set(skippedSkillIds),
    }).result;
  }

  it("is kept where the installation does not hold the skill", () => {
    expect(
      keptAgainst(buildSkillConfigs([REACT], { scope: "project" })).selectedAgents,
    ).toStrictEqual([WEB_DEV, API_DEV]);
  });

  it("is kept where the installation has only masked the skill", () => {
    const kept = keptAgainst([
      buildSkillConfig(REACT, { scope: "project" }),
      buildSkillConfig(UNPLACEABLE, { scope: "global", excluded: true }),
    ]);

    expect(kept.selectedAgents).toStrictEqual([WEB_DEV, API_DEV]);
  });
});

describe("holdInstalledGlobal — what counts as restating a held sub-agent", () => {
  const installedGlobal: InstalledGlobal = buildProjectConfig({
    skills: buildSkillConfigs([ZUSTAND, HONO], { scope: "global" }),
    agents: buildAgentConfigs([API_DEV], { scope: "global" }),
    stack: { [API_DEV]: { "web-client-state": [sa(ZUSTAND)], "api-api": [sa(HONO)] } },
  });

  function decodedRestating(
    rows: Record<string, "lazy" | "preloaded">,
    apiDeveloper: { model?: "haiku"; effort?: "high" } = {},
  ) {
    return seedToInstallSelection(
      buildSeedPayload({
        skills: Object.fromEntries(
          Object.entries(rows).map(([id, load]) => [
            id,
            buildSeedSkill({ scope: "global", assignments: { [API_DEV]: load } }),
          ]),
        ),
        agents: { [API_DEV]: { scope: "global", ...apiDeveloper } },
      }),
      REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
    ).result;
  }

  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
  });

  it("restates a held sub-agent whose rows arrive in another order", () => {
    const held = holdInstalledGlobal(
      decodedRestating({ [HONO]: "lazy", [ZUSTAND]: "lazy" }),
      installedGlobal,
    );

    expect(held.keptAsInstalled.agentNames).toStrictEqual([]);
  });

  it.each([
    ["model", decodedRestating({ [ZUSTAND]: "lazy", [HONO]: "lazy" }, { model: "haiku" })],
    ["effort", decodedRestating({ [ZUSTAND]: "lazy", [HONO]: "lazy" }, { effort: "high" })],
    ["a row's load", decodedRestating({ [ZUSTAND]: "preloaded", [HONO]: "lazy" })],
  ])("keeps a held sub-agent whose %s alone differs, and names it", (_, decoded) => {
    expect(holdInstalledGlobal(decoded, installedGlobal).keptAsInstalled.agentNames).toStrictEqual([
      API_DEV,
    ]);
  });

  it("restates a held sub-agent whose rows record no load, against rows that arrive lazy", () => {
    const unflagged: InstalledGlobal = {
      ...installedGlobal,
      stack: {
        [API_DEV]: { "web-client-state": [saUnflagged(ZUSTAND)], "api-api": [saUnflagged(HONO)] },
      },
    };

    const held = holdInstalledGlobal(
      decodedRestating({ [ZUSTAND]: "lazy", [HONO]: "lazy" }),
      unflagged,
    );

    expect(held.keptAsInstalled.agentNames).toStrictEqual([]);
  });

  it("holds no global skill the install only masks", () => {
    const masked: InstalledGlobal = {
      ...installedGlobal,
      skills: [buildSkillConfig(ZUSTAND, { scope: "global", excluded: true })],
    };

    expect(
      holdInstalledGlobal(decodedRestating({ [ZUSTAND]: "lazy" }), masked).installed.skillIds,
    ).toStrictEqual([]);
  });
});

describe("holdInstalledGlobal — which rows join a held sub-agent", () => {
  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_OPEN_CLIENT_STATE_MATRIX);
  });

  function decodedAssigning(ids: SkillId[]) {
    return seedToInstallSelection(
      buildSeedPayload({
        skills: Object.fromEntries(
          ids.map((id) => [
            id,
            buildSeedSkill({ scope: "global", assignments: { [API_DEV]: "lazy" } }),
          ]),
        ),
        agents: { [API_DEV]: { scope: "global" } },
      }),
      REACT_ZUSTAND_HONO_OPEN_CLIENT_STATE_MATRIX,
    ).result;
  }

  it("brings no row for a held skill, even where the held sub-agent does not load it yet", () => {
    const installed: InstalledGlobal = buildProjectConfig({
      skills: buildSkillConfigs([ZUSTAND], { scope: "global" }),
      agents: buildAgentConfigs([API_DEV], { scope: "global" }),
    });

    const held = holdInstalledGlobal(decodedAssigning([ZUSTAND]), installed);

    expect(held.result.assignedStack).toStrictEqual({});
    expect(held.joined).toStrictEqual([]);
  });

  it("brings no second row for a skill the held sub-agent already loads", () => {
    const installed: InstalledGlobal = buildProjectConfig({
      skills: buildSkillConfigs([ZUSTAND], { scope: "global" }),
      agents: buildAgentConfigs([API_DEV], { scope: "global" }),
      stack: { [API_DEV]: { "web-client-state": [sa(ZUSTAND)] } },
    });

    const held = holdInstalledGlobal(decodedAssigning([ZUSTAND, HONO]), installed);

    expect(held.result.assignedStack).toStrictEqual({
      [API_DEV]: { "web-client-state": [sa(ZUSTAND)], "api-api": [sa(HONO)] },
    });
  });

  it("treats an emptied one-skill category as room for an arriving row", () => {
    const installed: InstalledGlobal = buildProjectConfig({
      skills: buildSkillConfigs([ZUSTAND], { scope: "global" }),
      agents: buildAgentConfigs([API_DEV], { scope: "global" }),
      stack: { [API_DEV]: { "web-framework": [] } },
    });

    const held = holdInstalledGlobal(decodedAssigning([REACT]), installed);

    expect(held.result.assignedStack).toStrictEqual({
      [API_DEV]: { "web-framework": [sa(REACT)] },
    });
  });
});

describe("restoreInstalledGlobal and the joined line", () => {
  beforeEach(() => {
    initializeMatrix(REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX);
  });

  it("puts back no second copy of a global skill the configuration names", () => {
    const installed: InstalledGlobal = buildProjectConfig({
      skills: buildSkillConfigs([ZUSTAND], { scope: "global" }),
      agents: [],
    });
    const decoded = seedToInstallSelection(
      buildSeedPayload({ skills: { [ZUSTAND]: buildSeedSkill({ scope: "global" }) } }),
      REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
    ).result;

    const restored = restoreInstalledGlobal(decoded, installed);

    expect(restored.result.skills.map((skill) => skill.id)).toStrictEqual([ZUSTAND]);
  });

  it("names no joined line when nothing arrives in the global install", () => {
    const held = holdInstalledGlobal(decodedFor(REACT), null);

    expect(joinedStatement(held)).toStrictEqual([]);
  });
});

describe("what a run from the home directory may install", () => {
  function decodedScoped(skill: "project" | "global", agent: "project" | "global") {
    return seedToInstallSelection(
      buildSeedPayload({
        skills: { [ZUSTAND]: buildSeedSkill({ scope: skill, assignments: { [API_DEV]: "lazy" } }) },
        agents: { [API_DEV]: { scope: agent } },
      }),
      REACT_ZUSTAND_HONO_WEB_API_DOMAINS_MATRIX,
    ).result;
  }

  it("names every project-scoped skill and sub-agent, by kind, and installs none of it at home", () => {
    const decoded = decodedScoped("project", "project");

    expect(projectScopedContent(decoded)).toStrictEqual({
      skillIds: [ZUSTAND],
      agentNames: [API_DEV],
    });
    expect(installsAtHome(decoded)).toBe(false);
  });

  it("installs nothing at home where the one project-scoped entry is a sub-agent", () => {
    const decoded = decodedScoped("global", "project");

    expect(projectScopedContent(decoded)).toStrictEqual({ skillIds: [], agentNames: [API_DEV] });
    expect(installsAtHome(decoded)).toBe(false);
  });

  it("installs at home a selection holding nothing project-scoped", () => {
    const decoded = decodedScoped("global", "global");

    expect(projectScopedContent(decoded)).toStrictEqual({ skillIds: [], agentNames: [] });
    expect(installsAtHome(decoded)).toBe(true);
  });
});
