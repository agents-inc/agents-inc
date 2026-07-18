/**
 * Confirmed-still-broken documentation for the D-227 same-scope active+tombstone
 * duplicate (see .ai-docs/agent-findings/2026-07-17-d227-same-scope-active-tombstone-duplicate.md).
 *
 * When the ONLY saved entry for an agent is a stale GLOBAL-scope excluded tombstone
 * (no active counterpart) and that agent is re-included by preselection, the active
 * builder (buildAgentConfigForName) emits a fresh { scope: "global" } active entry
 * while the unconditional `filter(ac => ac.excluded)` step ALSO preserves the
 * { scope: "global", excluded: true } tombstone — a same-scope active+tombstone
 * duplicate for one agent. config-merger's compound key
 * (`name:scope[:excluded]`) treats the two as distinct, so both survive into config.
 *
 * These tests assert the CORRECT (post-fix) behavior — a single active global entry,
 * with the stale tombstone cleared — and are marked `it.fails` because the current
 * code still emits the duplicate. They document the store-level mechanism, which is
 * where the bug is reachable (directly-seeded state); the second finding
 * (2026-07-17-d227-preselect-fix-not-e2e-reachable.md) establishes the same branch is
 * NOT reachable through a realistic CLI init/stack flow, so unit-level is the correct gate.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useWizardStore } from "./wizard-store";
import { initializeMatrix } from "../lib/matrix/matrix-provider";
import { ALL_SKILLS_TEST_CATEGORIES_MATRIX } from "../lib/__tests__/mock-data/mock-matrices";
import { buildAgentConfigs } from "../lib/__tests__/factories/config-factories";
import { generateProjectConfigFromSkills } from "../lib/configuration/config-generator";
import { mergeConfigs } from "../lib/configuration/config-merger";
import type { AgentScopeConfig, ProjectConfig } from "../types";

const AGENT = "web-developer";
const LONE_GLOBAL_TOMBSTONE: AgentScopeConfig[] = buildAgentConfigs([AGENT], {
  scope: "global",
  excluded: true,
});
const SINGLE_ACTIVE_GLOBAL: AgentScopeConfig[] = buildAgentConfigs([AGENT], { scope: "global" });

describe("D-227 same-scope tombstone duplicate", () => {
  beforeEach(() => {
    initializeMatrix(ALL_SKILLS_TEST_CATEGORIES_MATRIX);
    useWizardStore.getState().reset();
  });

  it.fails(
    "preselectAgentsFromDomains re-including a lone global tombstone must not duplicate it at the same scope",
    () => {
      useWizardStore.setState({ agentConfigs: LONE_GLOBAL_TOMBSTONE });
      const store = useWizardStore.getState();

      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const agentConfigs = useWizardStore.getState().agentConfigs.filter((ac) => ac.name === AGENT);
      expect(agentConfigs).toStrictEqual(SINGLE_ACTIVE_GLOBAL);
    },
  );

  it.fails(
    "preselectAgentsFromStack re-including a lone global tombstone must not duplicate it at the same scope",
    () => {
      useWizardStore.setState({
        globalAgentPreselections: { agents: [AGENT], configs: LONE_GLOBAL_TOMBSTONE },
      });
      const store = useWizardStore.getState();

      store.preselectAgentsFromStack([AGENT]);

      const agentConfigs = useWizardStore.getState().agentConfigs.filter((ac) => ac.name === AGENT);
      expect(agentConfigs).toStrictEqual(SINGLE_ACTIVE_GLOBAL);
    },
  );

  it.fails("the same-scope duplicate must not reach the merged project config", () => {
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
});
