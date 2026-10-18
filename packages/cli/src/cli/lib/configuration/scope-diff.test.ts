import { describe, expect, it } from "vitest";
import { computeScopeDiff } from "./scope-diff";
import type { AgentDiffRow, ScopeDiffInput, SkillDiffRow } from "./scope-diff";
import { buildSkillConfig, buildSkillConfigs } from "../__tests__/helpers";
import { buildAgentConfigs } from "../__tests__/factories/config-factories";

const SKILL_ID = "web-framework-react";
const AGENT_NAME = "web-developer";
const FACTORY_ORIGIN = "eject";

const GLOBAL_ACTIVE_SKILL = buildSkillConfigs([SKILL_ID], { scope: "global" });
const PROJECT_ACTIVE_SKILL = buildSkillConfigs([SKILL_ID], { scope: "project" });
const GLOBAL_TOMBSTONE_SKILL = buildSkillConfigs([SKILL_ID], { scope: "global", excluded: true });
const GLOBAL_ACTIVE_AGENT = buildAgentConfigs([AGENT_NAME], { scope: "global" });
const PROJECT_ACTIVE_AGENT = buildAgentConfigs([AGENT_NAME], { scope: "project" });
const GLOBAL_TOMBSTONE_AGENT = buildAgentConfigs([AGENT_NAME], {
  scope: "global",
  excluded: true,
});

const UNCHANGED_GLOBAL_SKILL_ROW: SkillDiffRow[] = [
  { id: SKILL_ID, source: FACTORY_ORIGIN, status: "unchanged" },
];
const ADDED_PROJECT_SKILL_ROW: SkillDiffRow[] = [
  { id: SKILL_ID, source: FACTORY_ORIGIN, status: "added" },
];
const REMOVED_GLOBAL_SKILL_ROW: SkillDiffRow[] = [
  { id: SKILL_ID, source: FACTORY_ORIGIN, status: "removed" },
];
const UNCHANGED_GLOBAL_AGENT_ROW: AgentDiffRow[] = [{ name: AGENT_NAME, status: "unchanged" }];
const ADDED_PROJECT_AGENT_ROW: AgentDiffRow[] = [{ name: AGENT_NAME, status: "added" }];
const REMOVED_GLOBAL_AGENT_ROW: AgentDiffRow[] = [{ name: AGENT_NAME, status: "removed" }];

const INHERITED_GLOBAL_SKILL: ScopeDiffInput = {
  currentSkills: PROJECT_ACTIVE_SKILL,
  currentAgents: [],
  installedSkillConfigs: GLOBAL_ACTIVE_SKILL,
  installedAgentConfigs: null,
  isInitMode: false,
};

const INHERITED_GLOBAL_AGENT: ScopeDiffInput = {
  currentSkills: [],
  currentAgents: PROJECT_ACTIVE_AGENT,
  installedSkillConfigs: null,
  installedAgentConfigs: GLOBAL_ACTIVE_AGENT,
  isInitMode: false,
};

const DROPPED_SKILL_TOMBSTONE: ScopeDiffInput = {
  currentSkills: [],
  currentAgents: [],
  installedSkillConfigs: GLOBAL_TOMBSTONE_SKILL,
  installedAgentConfigs: null,
  isInitMode: false,
};

const DROPPED_AGENT_TOMBSTONE: ScopeDiffInput = {
  currentSkills: [],
  currentAgents: [],
  installedSkillConfigs: null,
  installedAgentConfigs: GLOBAL_TOMBSTONE_AGENT,
  isInitMode: false,
};

const DROPPED_GLOBAL_SKILL: ScopeDiffInput = {
  currentSkills: [],
  currentAgents: [],
  installedSkillConfigs: GLOBAL_ACTIVE_SKILL,
  installedAgentConfigs: null,
  isInitMode: false,
};

const DROPPED_GLOBAL_AGENT: ScopeDiffInput = {
  currentSkills: [],
  currentAgents: [],
  installedSkillConfigs: null,
  installedAgentConfigs: GLOBAL_ACTIVE_AGENT,
  isInitMode: false,
};

const DUAL_SCOPE_SKILL_PAIR: ScopeDiffInput = {
  currentSkills: [...PROJECT_ACTIVE_SKILL, ...GLOBAL_TOMBSTONE_SKILL],
  currentAgents: [],
  installedSkillConfigs: GLOBAL_ACTIVE_SKILL,
  installedAgentConfigs: null,
  isInitMode: false,
};

const REREAD_DUAL_SCOPE_SKILL_PAIR: ScopeDiffInput = {
  currentSkills: [...PROJECT_ACTIVE_SKILL, ...GLOBAL_TOMBSTONE_SKILL],
  currentAgents: [],
  installedSkillConfigs: [...PROJECT_ACTIVE_SKILL, ...GLOBAL_TOMBSTONE_SKILL],
  installedAgentConfigs: null,
  isInitMode: false,
};

describe("computeScopeDiff", () => {
  describe("a global entry the project also claims", () => {
    it("renders one global skill row rather than repeating the skill as removed", () => {
      const diff = computeScopeDiff(INHERITED_GLOBAL_SKILL);

      expect(diff.globalSkillRows).toStrictEqual(UNCHANGED_GLOBAL_SKILL_ROW);
      expect(diff.projectSkillRows).toStrictEqual(ADDED_PROJECT_SKILL_ROW);
    });

    it("renders one global agent row rather than repeating the agent as removed", () => {
      const diff = computeScopeDiff(INHERITED_GLOBAL_AGENT);

      expect(diff.globalAgentRows).toStrictEqual(UNCHANGED_GLOBAL_AGENT_ROW);
      expect(diff.projectAgentRows).toStrictEqual(ADDED_PROJECT_AGENT_ROW);
    });
  });

  describe("a baseline tombstone over a slot that held no install", () => {
    it("reports no skill removal, because dropping a mask deletes nothing", () => {
      const diff = computeScopeDiff(DROPPED_SKILL_TOMBSTONE);

      expect(diff.globalSkillRows).toStrictEqual([]);
      expect(diff.hasContent).toBe(false);
    });

    it("reports no agent removal, because dropping a mask deletes nothing", () => {
      const diff = computeScopeDiff(DROPPED_AGENT_TOMBSTONE);

      expect(diff.globalAgentRows).toStrictEqual([]);
      expect(diff.hasContent).toBe(false);
    });
  });

  describe("a global entry nothing claims any more", () => {
    it("still reports the skill as removed", () => {
      const diff = computeScopeDiff(DROPPED_GLOBAL_SKILL);

      expect(diff.globalSkillRows).toStrictEqual(REMOVED_GLOBAL_SKILL_ROW);
    });

    it("still reports the agent as removed", () => {
      const diff = computeScopeDiff(DROPPED_GLOBAL_AGENT);

      expect(diff.globalAgentRows).toStrictEqual(REMOVED_GLOBAL_AGENT_ROW);
    });
  });

  describe("a dual-scope pair", () => {
    it("keeps the global slot occupied by the tombstone the session just wrote", () => {
      const diff = computeScopeDiff(DUAL_SCOPE_SKILL_PAIR);

      expect(diff.globalSkillRows).toStrictEqual(UNCHANGED_GLOBAL_SKILL_ROW);
    });

    it("keeps the global slot occupied when the stored tombstone is read back", () => {
      const diff = computeScopeDiff(REREAD_DUAL_SCOPE_SKILL_PAIR);

      expect(diff.globalSkillRows).toStrictEqual(UNCHANGED_GLOBAL_SKILL_ROW);
    });
  });
});

/**
 * One session against its baseline holding every kind of slot at once, so each row's presence,
 * status and position is pinned: new, excluded at project, unchanged, mode-changed, tombstoned,
 * inherited, claimed at both scopes, masked while claimed, removed at either scope.
 */
describe("a session diffed against a baseline holding every kind of skill slot", () => {
  const NEW_AT_PROJECT = "web-framework-react";
  const EXCLUDED_AT_PROJECT = "api-framework-hono";
  const UNCHANGED_GLOBAL = "web-testing-vitest";
  const MODE_CHANGED_GLOBAL = "api-database-drizzle";
  const TOMBSTONED_GLOBAL = "web-state-zustand";
  const INHERITED_GLOBAL = "web-state-pinia";
  const CLAIMED_AT_BOTH = "web-styling-tailwind";
  const MASKED_AND_CLAIMED = "web-styling-scss-modules";
  const KEPT_AT_PROJECT = "web-testing-playwright-e2e";
  const REMOVED_AT_PROJECT = "web-framework-vue-composition-api";
  const REMOVED_GLOBAL = "shared-tooling-eslint-prettier";
  const WAS_MASKED = "api-framework-express";
  const MARKETPLACE = "acme";

  const SESSION: ScopeDiffInput = {
    currentSkills: [
      buildSkillConfig(NEW_AT_PROJECT, { scope: "project" }),
      buildSkillConfig(EXCLUDED_AT_PROJECT, { scope: "project", excluded: true }),
      buildSkillConfig(UNCHANGED_GLOBAL, { scope: "global" }),
      buildSkillConfig(MODE_CHANGED_GLOBAL, { scope: "global", origin: MARKETPLACE }),
      buildSkillConfig(TOMBSTONED_GLOBAL, { scope: "global", excluded: true }),
      buildSkillConfig(INHERITED_GLOBAL, { scope: "project" }),
      buildSkillConfig(CLAIMED_AT_BOTH, { scope: "global" }),
      buildSkillConfig(CLAIMED_AT_BOTH, { scope: "project" }),
      buildSkillConfig(MASKED_AND_CLAIMED, { scope: "project" }),
      buildSkillConfig(MASKED_AND_CLAIMED, { scope: "global", excluded: true }),
      buildSkillConfig(KEPT_AT_PROJECT, { scope: "project" }),
      buildSkillConfig(WAS_MASKED, { scope: "global" }),
    ],
    currentAgents: [],
    installedSkillConfigs: [
      buildSkillConfig(UNCHANGED_GLOBAL, { scope: "global" }),
      buildSkillConfig(MODE_CHANGED_GLOBAL, { scope: "global" }),
      buildSkillConfig(TOMBSTONED_GLOBAL, { scope: "global" }),
      buildSkillConfig(INHERITED_GLOBAL, { scope: "global" }),
      buildSkillConfig(CLAIMED_AT_BOTH, { scope: "global" }),
      buildSkillConfig(MASKED_AND_CLAIMED, { scope: "global" }),
      buildSkillConfig(KEPT_AT_PROJECT, { scope: "project" }),
      buildSkillConfig(REMOVED_AT_PROJECT, { scope: "project" }),
      buildSkillConfig(REMOVED_GLOBAL, { scope: "global" }),
      buildSkillConfig(WAS_MASKED, { scope: "global", excluded: true, origin: MARKETPLACE }),
    ],
    installedAgentConfigs: null,
    isInitMode: false,
  };

  it("lists each project slot once, and the removed one last", () => {
    expect(computeScopeDiff(SESSION).projectSkillRows).toStrictEqual([
      { id: NEW_AT_PROJECT, source: FACTORY_ORIGIN, status: "added" },
      { id: INHERITED_GLOBAL, source: FACTORY_ORIGIN, status: "added" },
      { id: CLAIMED_AT_BOTH, source: FACTORY_ORIGIN, status: "added" },
      { id: MASKED_AND_CLAIMED, source: FACTORY_ORIGIN, status: "added" },
      { id: KEPT_AT_PROJECT, source: FACTORY_ORIGIN, status: "unchanged" },
      { id: REMOVED_AT_PROJECT, source: FACTORY_ORIGIN, status: "removed" },
    ]);
  });

  it("lists active globals, then inherited ones, then masks, then the removed one", () => {
    expect(computeScopeDiff(SESSION).globalSkillRows).toStrictEqual([
      { id: UNCHANGED_GLOBAL, source: FACTORY_ORIGIN, status: "unchanged" },
      { id: MODE_CHANGED_GLOBAL, source: MARKETPLACE, status: "mode-changed" },
      { id: CLAIMED_AT_BOTH, source: FACTORY_ORIGIN, status: "unchanged" },
      { id: WAS_MASKED, source: FACTORY_ORIGIN, status: "unchanged" },
      { id: INHERITED_GLOBAL, source: FACTORY_ORIGIN, status: "unchanged" },
      { id: TOMBSTONED_GLOBAL, source: FACTORY_ORIGIN, status: "unchanged" },
      { id: MASKED_AND_CLAIMED, source: FACTORY_ORIGIN, status: "unchanged" },
      { id: REMOVED_GLOBAL, source: FACTORY_ORIGIN, status: "removed" },
    ]);
  });

  it("reports no global removal for a first install", () => {
    expect(computeScopeDiff({ ...SESSION, isInitMode: true }).globalSkillRows).not.toContainEqual({
      id: REMOVED_GLOBAL,
      source: FACTORY_ORIGIN,
      status: "removed",
    });
  });
});

describe("a session diffed against a baseline holding every kind of sub-agent slot", () => {
  const NEW_AT_PROJECT = "web-developer";
  const EXCLUDED_AT_PROJECT = "api-developer";
  const UNCHANGED_GLOBAL = "cli-developer";
  const TOMBSTONED_GLOBAL = "pm";
  const INHERITED_GLOBAL = "reviewer";
  const CLAIMED_AT_BOTH = "web-tester";
  const MASKED_AND_CLAIMED = "api-tester";
  const KEPT_AT_PROJECT = "cli-tester";
  const REMOVED_AT_PROJECT = "web-researcher";
  const REMOVED_GLOBAL = "api-researcher";

  const SESSION: ScopeDiffInput = {
    currentSkills: [],
    currentAgents: [
      ...buildAgentConfigs([NEW_AT_PROJECT], { scope: "project" }),
      ...buildAgentConfigs([EXCLUDED_AT_PROJECT], { scope: "project", excluded: true }),
      ...buildAgentConfigs([UNCHANGED_GLOBAL], { scope: "global" }),
      ...buildAgentConfigs([TOMBSTONED_GLOBAL], { scope: "global", excluded: true }),
      ...buildAgentConfigs([INHERITED_GLOBAL], { scope: "project" }),
      ...buildAgentConfigs([CLAIMED_AT_BOTH], { scope: "global" }),
      ...buildAgentConfigs([CLAIMED_AT_BOTH], { scope: "project" }),
      ...buildAgentConfigs([MASKED_AND_CLAIMED], { scope: "project" }),
      ...buildAgentConfigs([MASKED_AND_CLAIMED], { scope: "global", excluded: true }),
      ...buildAgentConfigs([KEPT_AT_PROJECT], { scope: "project" }),
    ],
    installedSkillConfigs: null,
    installedAgentConfigs: [
      ...buildAgentConfigs([UNCHANGED_GLOBAL], { scope: "global" }),
      ...buildAgentConfigs([TOMBSTONED_GLOBAL], { scope: "global" }),
      ...buildAgentConfigs([INHERITED_GLOBAL], { scope: "global" }),
      ...buildAgentConfigs([CLAIMED_AT_BOTH], { scope: "global" }),
      ...buildAgentConfigs([MASKED_AND_CLAIMED], { scope: "global" }),
      ...buildAgentConfigs([KEPT_AT_PROJECT], { scope: "project" }),
      ...buildAgentConfigs([REMOVED_AT_PROJECT], { scope: "project" }),
      ...buildAgentConfigs([REMOVED_GLOBAL], { scope: "global" }),
    ],
    isInitMode: false,
  };

  it("lists each project slot once, and the removed one last", () => {
    expect(computeScopeDiff(SESSION).projectAgentRows).toStrictEqual([
      { name: NEW_AT_PROJECT, status: "added" },
      { name: INHERITED_GLOBAL, status: "added" },
      { name: CLAIMED_AT_BOTH, status: "added" },
      { name: MASKED_AND_CLAIMED, status: "added" },
      { name: KEPT_AT_PROJECT, status: "unchanged" },
      { name: REMOVED_AT_PROJECT, status: "removed" },
    ]);
  });

  it("lists active globals, then inherited ones, then masks, then the removed one", () => {
    expect(computeScopeDiff(SESSION).globalAgentRows).toStrictEqual([
      { name: UNCHANGED_GLOBAL, status: "unchanged" },
      { name: CLAIMED_AT_BOTH, status: "unchanged" },
      { name: INHERITED_GLOBAL, status: "unchanged" },
      { name: TOMBSTONED_GLOBAL, status: "unchanged" },
      { name: MASKED_AND_CLAIMED, status: "unchanged" },
      { name: REMOVED_GLOBAL, status: "removed" },
    ]);
  });
});

describe("a diff holding sub-agent rows alone", () => {
  it("has content when only a project sub-agent row is there", () => {
    const diff = computeScopeDiff({
      currentSkills: [],
      currentAgents: PROJECT_ACTIVE_AGENT,
      installedSkillConfigs: null,
      installedAgentConfigs: null,
      isInitMode: true,
    });

    expect(diff.hasContent).toBe(true);
  });

  it("has content when only a global sub-agent row is there", () => {
    const diff = computeScopeDiff({
      currentSkills: [],
      currentAgents: GLOBAL_ACTIVE_AGENT,
      installedSkillConfigs: null,
      installedAgentConfigs: null,
      isInitMode: true,
    });

    expect(diff.hasContent).toBe(true);
  });
});

describe("computeScopeDiff, a sub-agent moved from project to global", () => {
  it("shows it removed from Project and added at Global", () => {
    const diff = computeScopeDiff({
      currentSkills: [],
      currentAgents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      installedSkillConfigs: [],
      installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
      isInitMode: false,
    });

    expect(diff.projectAgentRows).toStrictEqual([{ name: "web-developer", status: "removed" }]);
    expect(diff.globalAgentRows).toStrictEqual([{ name: "web-developer", status: "added" }]);
  });
});
