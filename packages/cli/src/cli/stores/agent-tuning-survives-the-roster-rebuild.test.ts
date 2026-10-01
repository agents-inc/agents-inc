import { beforeEach, describe, expect, it } from "vitest";

import { useWizardStore } from "./wizard-store";
import { initializeMatrix } from "../lib/matrix/matrix-provider";
import { ALL_SKILLS_TEST_CATEGORIES_MATRIX } from "../lib/__tests__/mock-data/mock-matrices";
import { buildAgentConfigs } from "../lib/__tests__/factories/config-factories";
import type { AgentScopeConfig } from "../types";

/**
 * The model a sub-agent runs on and the effort it reasons at are deliberate choices the user
 * made — and the wizard REBUILDS the roster rather than editing it. `preselectAgentsFromDomains`
 * and `preselectAgentsFromStack` both throw the existing entries away and mint new ones from the
 * roster a domain or a stack declares, keeping only what `buildAgentConfigForName` carries
 * across: the entry's scope and its tuning, which `tuningOf` reads. A rebuild that dropped either
 * field would put a sub-agent back on its metadata default after a domain change, with nothing
 * said.
 *
 * The two rebuild cases are regression guards: the rebuild carried model and effort before
 * `tuningOf` existed. The restore case further down is the behaviour that was missing.
 *
 * Every entry is built by `buildAgentConfigs`, the expectation as well as the fixture, so each
 * spec first holds the fixture to the tuning it names. A factory that stopped passing `model` or
 * `effort` through would otherwise build both sides without them, and the comparison would hold
 * for a rebuild that drops them.
 */

const TUNED_AGENT = "web-developer";

/** The tuning one agent row carries: both fields, so a rebuild keeping only one is caught. */
const TUNING: Pick<AgentScopeConfig, "model" | "effort"> = { model: "opus", effort: "high" };

/** An agent entry carrying the full tuning, at the scope a rebuild preselects it from. */
const TUNED_GLOBAL_ENTRY = (): AgentScopeConfig[] =>
  buildAgentConfigs([TUNED_AGENT], { scope: "global", ...TUNING });

describe("the roster rebuild over an agent whose model and effort the user set", () => {
  beforeEach(() => {
    initializeMatrix(ALL_SKILLS_TEST_CATEGORIES_MATRIX);
    useWizardStore.getState().reset();
  });

  it("keeps the model and effort when a domain selection rebuilds the roster", () => {
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
      "the rebuild re-derives the roster, never the model and effort the user chose",
    ).toStrictEqual(TUNED_GLOBAL_ENTRY());
  });

  it("keeps the model and effort when a stack rebuilds the roster", () => {
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
      "choosing a stack must not silently revert the model and effort of an agent the user tuned",
    ).toStrictEqual(TUNED_GLOBAL_ENTRY());
  });
});

/**
 * The tombstone half of the same question.
 *
 * Re-selecting an agent that is active at global scope and tombstoned in the project's saved
 * snapshot restores the `[P][G]` pair, and `restoreDualScopeAgent` mints that pair from scratch —
 * so the tuning of the row the user is looking at reaches it only because the restore carries it
 * across deliberately. Without that, turning an agent back on is the one keypress that silently
 * reverts its model and effort, at the moment the user is most likely to believe nothing else
 * changed.
 */
describe("restoring a collapsed dual-scope agent row", () => {
  beforeEach(() => {
    initializeMatrix(ALL_SKILLS_TEST_CATEGORIES_MATRIX);
    useWizardStore.getState().reset();
  });

  it("restores the pair with the model and effort the row was carrying", () => {
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

    // Subject guard. The restore branch is one of four `toggleAgent` can take, and the other
    // three leave `agentConfigs` looking plausible — a blocked toggle returns a toast and the
    // config untouched, which would satisfy a careless assertion about the tuning being present.
    expect(
      restored.selectedAgents,
      "the spec has to have taken the restore branch, not the blocked-toggle one",
    ).toStrictEqual([TUNED_AGENT]);
    expect(restored.toastMessage).toBeNull();

    expect(
      restored.agentConfigs,
      "the restored pair carries the model and effort the row had; minting it bare reverts both at the moment the user turns the agent back on",
    ).toStrictEqual([
      ...buildAgentConfigs([TUNED_AGENT], { scope: "project", ...TUNING }),
      ...buildAgentConfigs([TUNED_AGENT], { scope: "global", excluded: true, ...TUNING }),
    ]);
  });
});
