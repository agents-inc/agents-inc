/**
 * A tombstone masks an install at the OTHER scope — that pair is the whole of the
 * dual-scope indicator. Preselection rebuilds the active entries and preserves the
 * saved tombstones, and the two steps have to agree about scope: a tombstone left
 * at a slot the rebuild has just filled masks nothing, and the config merge keys an
 * active entry and an excluded one apart (`name:scope[:excluded]`), so both would be
 * written to config for one agent.
 *
 * These specs drive the store directly because that is where the shape is reachable;
 * a realistic init or stack flow does not produce it.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useWizardStore } from "./wizard-store";
import { initializeMatrix } from "../lib/matrix/matrix-provider";
import {
  ALL_SKILLS_TEST_CATEGORIES_MATRIX,
  REACT_HONO_FRAMEWORK_API_MATRIX,
} from "../lib/__tests__/mock-data/mock-matrices";
import { buildAgentConfigs } from "../lib/__tests__/factories/config-factories";
import { buildSkillConfigs } from "../lib/__tests__/helpers";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../consts";
import { generateProjectConfigFromSkills } from "../lib/configuration/config-generator";
import { mergeConfigs } from "../lib/configuration/config-merger";
import type { AgentScopeConfig, ProjectConfig, SkillConfig } from "../types";

const AGENT = "web-developer";
const LONE_GLOBAL_TOMBSTONE: AgentScopeConfig[] = buildAgentConfigs([AGENT], {
  scope: "global",
  excluded: true,
});
const SINGLE_ACTIVE_GLOBAL: AgentScopeConfig[] = buildAgentConfigs([AGENT], { scope: "global" });

const SKILL = "web-framework-react";
const LONE_GLOBAL_SKILL_TOMBSTONE: SkillConfig[] = buildSkillConfigs([SKILL], {
  scope: "global",
  origin: DEFAULT_PUBLIC_SOURCE_NAME,
  excluded: true,
});
const SINGLE_ACTIVE_GLOBAL_SKILL: SkillConfig[] = buildSkillConfigs([SKILL], {
  scope: "global",
  origin: DEFAULT_PUBLIC_SOURCE_NAME,
});

describe("same-scope tombstone duplicate", () => {
  beforeEach(() => {
    initializeMatrix(ALL_SKILLS_TEST_CATEGORIES_MATRIX);
    useWizardStore.getState().reset();
  });

  it("preselectAgentsFromDomains re-including a lone global tombstone must not duplicate it at the same scope", () => {
    useWizardStore.setState({ agentConfigs: LONE_GLOBAL_TOMBSTONE });
    const store = useWizardStore.getState();

    store.toggleDomain("web");
    store.preselectAgentsFromDomains();

    const agentConfigs = useWizardStore.getState().agentConfigs.filter((ac) => ac.name === AGENT);
    expect(agentConfigs).toStrictEqual(SINGLE_ACTIVE_GLOBAL);
  });

  it("preselectAgentsFromStack re-including a lone global tombstone must not duplicate it at the same scope", () => {
    useWizardStore.setState({
      globalAgentPreselections: { agents: [AGENT], configs: LONE_GLOBAL_TOMBSTONE },
    });
    const store = useWizardStore.getState();

    store.preselectAgentsFromStack([AGENT]);

    const agentConfigs = useWizardStore.getState().agentConfigs.filter((ac) => ac.name === AGENT);
    expect(agentConfigs).toStrictEqual(SINGLE_ACTIVE_GLOBAL);
  });

  it("the same-scope duplicate must not reach the merged project config", () => {
    useWizardStore.setState({ agentConfigs: LONE_GLOBAL_TOMBSTONE });
    const store = useWizardStore.getState();

    store.toggleDomain("web");
    store.preselectAgentsFromDomains();

    const { agentConfigs, selectedAgents } = useWizardStore.getState();
    const generated = generateProjectConfigFromSkills("test-project", [], {
      selectedAgents: [...selectedAgents],
      skillConfigs: [],
      agentConfigs,
    });
    const emptyExisting: ProjectConfig = { name: "test-project", agents: [], skills: [] };
    const merged = mergeConfigs(generated, emptyExisting);

    const mergedAgent = merged.agents.filter((a) => a.name === AGENT);
    expect(mergedAgent).toStrictEqual(SINGLE_ACTIVE_GLOBAL);
  });

  it("populateFromSkillIds re-including a lone global tombstone must not duplicate it at the same scope", () => {
    // A matrix whose categories are keyed by Category id, so the skill resolves
    // into a domain and preselection has an active entry to rebuild.
    initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);
    const store = useWizardStore.getState();

    store.populateFromSkillIds([SKILL], LONE_GLOBAL_SKILL_TOMBSTONE);

    const { skillConfigs } = useWizardStore.getState();
    expect(skillConfigs).toStrictEqual(SINGLE_ACTIVE_GLOBAL_SKILL);
  });
});
