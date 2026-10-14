import { beforeEach, describe, expect, it } from "vitest";

import { useWizardStore } from "./wizard-store";
import { initializeMatrix } from "../lib/matrix/matrix-provider";
import { ALL_SKILLS_TEST_CATEGORIES_MATRIX } from "../lib/__tests__/mock-data/mock-matrices";
import { buildAgentConfigs } from "../lib/__tests__/factories/config-factories";
import type { AgentScopeConfig } from "../types";

/**
 * The wizard rebuilds the roster, so a tuning field `tuningOf` misses silently reverts. Fixture and
 * expectation share `buildAgentConfigs`, so each spec first holds the fixture to its tuning.
 */

const TUNED_AGENT = "web-developer";

/** Every tuning field at once, so a rebuild keeping only some of them is caught. */
const TUNING: Pick<AgentScopeConfig, "model" | "codexModel" | "effort"> = {
  model: "opus",
  codexModel: "gpt-5.6-terra",
  effort: "high",
};

const TUNED_GLOBAL_ENTRY = (): AgentScopeConfig[] =>
  buildAgentConfigs([TUNED_AGENT], { scope: "global", ...TUNING });

describe("the roster rebuild over an agent the user tuned", () => {
  beforeEach(() => {
    initializeMatrix(ALL_SKILLS_TEST_CATEGORIES_MATRIX);
    useWizardStore.getState().reset();
  });

  it("keeps every tuning field when a domain selection rebuilds the roster", () => {
    expect(
      TUNED_GLOBAL_ENTRY(),
      "the fixture has to carry the tuning the rebuild is asked to keep",
    ).toStrictEqual([expect.objectContaining(TUNING)]);

    useWizardStore.setState({ agentConfigs: TUNED_GLOBAL_ENTRY() });
    const store = useWizardStore.getState();

    store.toggleDomain("web");
    store.preselectAgentsFromDomains();

    expect(
      useWizardStore.getState().agentConfigs.filter((entry) => entry.name === TUNED_AGENT),
      "the rebuild re-derives the roster, never the tuning the user chose",
    ).toStrictEqual(TUNED_GLOBAL_ENTRY());
  });

  it("keeps every tuning field when a stack rebuilds the roster", () => {
    expect(
      TUNED_GLOBAL_ENTRY(),
      "the fixture has to carry the tuning the rebuild is asked to keep",
    ).toStrictEqual([expect.objectContaining(TUNING)]);

    useWizardStore.setState({
      globalAgentPreselections: { agents: [TUNED_AGENT], configs: TUNED_GLOBAL_ENTRY() },
    });

    useWizardStore.getState().preselectAgentsFromStack([TUNED_AGENT]);

    expect(
      useWizardStore.getState().agentConfigs.filter((entry) => entry.name === TUNED_AGENT),
      "choosing a stack must not silently revert the tuning of an agent the user tuned",
    ).toStrictEqual(TUNED_GLOBAL_ENTRY());
  });
});

/** Re-selecting a tombstoned dual-scope agent mints the pair afresh, so it must carry the tuning. */
describe("restoring a collapsed dual-scope agent row", () => {
  beforeEach(() => {
    initializeMatrix(ALL_SKILLS_TEST_CATEGORIES_MATRIX);
    useWizardStore.getState().reset();
  });

  it("restores the pair with the tuning the row was carrying", () => {
    const savedPair: AgentScopeConfig[] = [
      ...buildAgentConfigs([TUNED_AGENT], { scope: "project" }),
      ...buildAgentConfigs([TUNED_AGENT], { scope: "global", excluded: true }),
    ];
    const liveGlobal = TUNED_GLOBAL_ENTRY();

    expect(
      liveGlobal,
      "the live row has to carry the tuning the restore is asked to keep",
    ).toStrictEqual([expect.objectContaining(TUNING)]);

    useWizardStore.setState({
      selectedAgents: [],
      agentConfigs: liveGlobal,
      installedAgentConfigs: savedPair,
      isEditingFromGlobalScope: false,
      isInitMode: false,
      toastMessage: null,
    });

    useWizardStore.getState().toggleAgent(TUNED_AGENT);

    const restored = useWizardStore.getState();

    // Subject guard: a blocked toggle leaves the config untouched, which would also show the
    // tuning.
    expect(
      restored.selectedAgents,
      "the spec has to have taken the restore branch, not the blocked-toggle one",
    ).toStrictEqual([TUNED_AGENT]);
    expect(restored.toastMessage).toBeNull();

    expect(
      restored.agentConfigs,
      "the restored pair carries the tuning the row had; minting it bare reverts it",
    ).toStrictEqual([
      ...buildAgentConfigs([TUNED_AGENT], { scope: "project", ...TUNING }),
      ...buildAgentConfigs([TUNED_AGENT], { scope: "global", excluded: true, ...TUNING }),
    ]);
  });
});
