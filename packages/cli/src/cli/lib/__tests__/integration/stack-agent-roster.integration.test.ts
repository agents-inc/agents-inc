import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useWizardStore } from "../../../stores/wizard-store.js";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix.js";
import { DEFAULT_PLUGIN_NAME } from "../../../consts.js";
import { typedKeys } from "../../../utils/typed-object.js";
import {
  buildStackProperty,
  generateProjectConfigFromSkills,
} from "../../configuration/config-generator.js";
import { activeAgentNames } from "../../configuration/scope-predicates.js";
import { defaultStacks } from "../../configuration/default-stacks.js";
import { initializeMatrix, matrix } from "../../matrix/matrix-provider.js";
import type {
  AgentName,
  ProjectConfig,
  ResolvedStack,
  SkillId,
  Stack,
} from "../../../types/index.js";

/**
 * A stack's `agents` keys are the roster its selection installs — for every
 * stack, by name.
 *
 * This is the binding between the stack definitions and the config an install
 * writes, replayed through the real store in the order the wizard drives it:
 * the stack step's preselection, then the Sources step's domain derivation, then
 * the generator. Domain derivation serves the from-scratch flow; a stack's
 * declared roster is not a thing it gets an opinion about.
 *
 * Names, not counts: a count agrees with a swap (one declared agent dropped, one
 * undeclared agent added) and reports a number when it does disagree. The
 * expected value is read off each stack rather than written down beside it, so a
 * roster change lands on the stack that changed instead of on a list that mirrors
 * it.
 */

/** The wizard's stack step: `applyStack` in `components/wizard/stack-selection.tsx`. */
function applyStack(stack: ResolvedStack): void {
  const store = useWizardStore.getState();
  store.selectStack(stack.id);
  store.setStackAction("customize");
  store.preselectAgentsFromStack(typedKeys<AgentName>(stack.skills));
  store.populateFromSkillIds([...stack.allSkillIds]);
  store.setApproach("stack");
}

/** The wizard's Sources step: `StepSources.onContinue` derives a roster on a fresh init. */
function continuePastSourcesStep(): void {
  useWizardStore.getState().preselectAgentsFromDomains();
}

/** The config an install writes for the current store state (`buildInstallConfig`). */
function generateConfigFromStore(declaration: Stack): ProjectConfig {
  const store = useWizardStore.getState();
  const skillIds: SkillId[] = store.getAllSelectedTechnologies();

  return generateProjectConfigFromSkills(DEFAULT_PLUGIN_NAME, skillIds, {
    selectedAgents: store.selectedAgents,
    skillConfigs: store.skillConfigs,
    agentConfigs: store.agentConfigs,
    existingStack: buildStackProperty(declaration),
    newlyAddedSkillIds: skillIds,
  });
}

/** Every sub-agent the stack names, sorted the way an installed roster is. */
function declaredAgents(declaration: Stack): AgentName[] {
  return typedKeys<AgentName>(declaration.agents).sort();
}

/** The stack as the wizard offers it — a declared stack with no row is a broken list. */
function offeredStack(declaration: Stack): ResolvedStack {
  const offered = matrix.suggestedStacks.find((stack) => stack.id === declaration.id);
  if (!offered) throw new Error(`Stack '${declaration.id}' is missing from the wizard's list`);
  return offered;
}

/** The config an install writes after the wizard's stack path, Sources step included. */
function installConfigForStack(declaration: Stack): ProjectConfig {
  applyStack(offeredStack(declaration));
  continuePastSourcesStep();
  return generateConfigFromStore(declaration);
}

describe("Integration: a stack's declared sub-agent roster is the installed one", () => {
  beforeAll(() => {
    initializeMatrix(BUILT_IN_MATRIX);
  });

  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  it("offers every declared stack for selection", () => {
    expect(
      matrix.suggestedStacks.map((stack) => stack.id),
      "the wizard's stack list must be the declared stacks — otherwise the per-stack cases below cover less than they claim",
    ).toStrictEqual(defaultStacks.map((stack) => stack.id));
  });

  for (const declaration of defaultStacks) {
    describe(declaration.id, () => {
      it("installs exactly the sub-agents it declares", () => {
        const config = installConfigForStack(declaration);

        expect(
          activeAgentNames(config.agents).sort(),
          `config.agents must name exactly the sub-agents '${declaration.id}' declares`,
        ).toStrictEqual(declaredAgents(declaration));
      });

      it("gives no undeclared sub-agent a stack entry", () => {
        const config = installConfigForStack(declaration);
        const declared = new Set<string>(declaredAgents(declaration));

        expect(
          typedKeys<AgentName>(config.stack ?? {}).filter((agent) => !declared.has(agent)),
          `config.stack must carry no sub-agent '${declaration.id}' never declared`,
        ).toStrictEqual([]);
      });
    });
  }
});
