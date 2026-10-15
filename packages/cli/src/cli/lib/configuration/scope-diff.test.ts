import { describe, expect, it } from "vitest";
import { computeScopeDiff } from "./scope-diff";
import type { AgentDiffRow, ScopeDiffInput, SkillDiffRow } from "./scope-diff";
import { buildSkillConfigs } from "../__tests__/helpers";
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

/** A global install the project now also claims, with no tombstone recorded for it. */
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

/** A baseline tombstone whose slot held no install, dropped this session. */
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

/** A global install this session drops outright — the removal a `-` is for. */
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

/** The dual-scope pair: the project claims the slot and a tombstone silences the global one. */
const DUAL_SCOPE_SKILL_PAIR: ScopeDiffInput = {
  currentSkills: [...PROJECT_ACTIVE_SKILL, ...GLOBAL_TOMBSTONE_SKILL],
  currentAgents: [],
  installedSkillConfigs: GLOBAL_ACTIVE_SKILL,
  installedAgentConfigs: null,
  isInitMode: false,
};

/** The same pair re-read from a saved config, tombstone and all. */
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
