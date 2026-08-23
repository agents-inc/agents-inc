import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockMatrix } from "../../lib/__tests__/factories/matrix-factories";
import { createMockResolvedStack } from "../../lib/__tests__/factories/stack-factories";
import { EMPTY_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import {
  ARROW_DOWN,
  ENTER,
  ESCAPE,
  INPUT_DELAY_MS,
  RENDER_DELAY_MS,
  SPACE,
  delay,
} from "../../lib/__tests__/test-constants";
import { initializeMatrix, matrix } from "../../lib/matrix/matrix-provider";
import { useWizardStore } from "../../stores/wizard-store";
import { AGENT_NAMES } from "../../types/generated/source-types";
import { typedKeys } from "../../utils/typed-object";
import { StepAgents } from "./step-agents";

import type { Category, SkillId } from "../../types/index";

describe("StepAgents component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(EMPTY_MATRIX);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("rendering", () => {
    it("should render agent group headers", () => {
      const { lastFrame, unmount } = render(<StepAgents />);
      cleanup = unmount;

      const output = lastFrame();
      // ViewTitle removed; verify agent groups render (title shown by wizard-layout)
      expect(output).toContain("Web");
      expect(output).toContain("API");
      expect(output).toContain("Meta");
    });

    it("should render all agents", () => {
      const { lastFrame, unmount } = render(<StepAgents />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Web Developer");
      expect(output).toContain("Web Researcher");
      expect(output).toContain("Web Tester");
      expect(output).toContain("API Developer");
      expect(output).toContain("API Researcher");
      expect(output).toContain("API Tester");
      expect(output).toContain("AI Developer");
      expect(output).toContain("AI Researcher");
      expect(output).toContain("AI Tester");
      expect(output).toContain("CLI Developer");
      expect(output).toContain("CLI Tester");
      expect(output).toContain("CLI Researcher");
      // The two consolidated role agents sit in the Meta group, once each.
      expect(output).toContain("PM");
      expect(output).toContain("Reviewer");
      expect(output).toContain("Agent Summoner");
      expect(output).toContain("Skill Summoner");
      expect(output).toContain("Codex Keeper");
    });

    it("should render agent descriptions", () => {
      const { lastFrame, unmount } = render(<StepAgents />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Frontend features, components, TypeScript");
      expect(output).toContain("Backend routes, database, middleware");
      expect(output).toContain("CLI commands, interactive prompts");
    });

    it("should render group headers", () => {
      const { lastFrame, unmount } = render(<StepAgents />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Web");
      expect(output).toContain("API");
      expect(output).toContain("AI");
      expect(output).toContain("CLI");
      expect(output).toContain("Meta");
    });

    it("should show continue arrow", () => {
      const { lastFrame, unmount } = render(<StepAgents />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("\u2192");
      expect(output).toContain("Continue");
    });

    it("should show continue option with agent count when agents selected", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      store.toggleAgent("api-developer");
      store.toggleAgent("reviewer");

      const { lastFrame, unmount } = render(<StepAgents />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Continue with 3 agent(s)");
    });

    it("should show 'Continue without agents' when no agents selected", () => {
      const { lastFrame, unmount } = render(<StepAgents />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Continue without agents");
    });
  });

  describe("keyboard interaction", () => {
    it("should toggle agent on SPACE", async () => {
      const { stdin, lastFrame, unmount } = render(<StepAgents />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      const store = useWizardStore.getState();
      expect(store.selectedAgents).toContain("web-developer");
      expect(lastFrame()).toContain("Continue with 1 agent(s)");
    });

    it("should toggle correct agent after navigation", async () => {
      const { stdin, unmount } = render(<StepAgents />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      const store = useWizardStore.getState();
      expect(store.selectedAgents).toContain("web-researcher");
    });

    it("should navigate to confirm on ENTER when agents selected", async () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      // Set step to agents so setStep("confirm") actually navigates
      store.setStep("agents");

      const { stdin, unmount } = render(<StepAgents />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      const updatedStore = useWizardStore.getState();
      expect(updatedStore.step).toBe("confirm");
    });

    it("should navigate to confirm on ENTER even with no agents selected", async () => {
      const store = useWizardStore.getState();
      store.setStep("agents");

      const { stdin, unmount } = render(<StepAgents />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      const updatedStore = useWizardStore.getState();
      expect(updatedStore.step).toBe("confirm");
    });

    it("should go back on ESC", async () => {
      const store = useWizardStore.getState();
      store.setStep("sources");
      store.setStep("agents");

      const { stdin, unmount } = render(<StepAgents />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      const updatedStore = useWizardStore.getState();
      expect(updatedStore.step).toBe("sources");
    });

    it("should toggle agent off when already selected", async () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");

      const { stdin, unmount } = render(<StepAgents />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      // First item is web-developer, toggle it off
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      const updatedStore = useWizardStore.getState();
      expect(updatedStore.selectedAgents).not.toContain("web-developer");
    });
  });
});

/**
 * A sub-agent id a marketplace's stack names and the CLI's own `src/agents/` does not declare.
 *
 * Plain `string`, deliberately not cast to `AgentName`: that union is generated from that
 * directory by `scripts/generate-source-types.ts`, so a marketplace's own name is outside it by
 * construction — which is the whole reason a grid row offering one is a defect.
 */
const MARKETPLACE_ONLY_AGENT = "fixture-only-agent";

/** How `buildAgentGroups` would label a custom row, and the group header it would sit under. */
const MARKETPLACE_ONLY_AGENT_LABEL = "Fixture Only Agent";

/** A built-in the same stack names, so the fixture is not simply an empty stack. */
const A_BUILT_IN_AGENT_THE_STACK_NAMES = "web-developer";

/**
 * A marketplace stack's agent keys, typed as the `string`s they arrive as.
 *
 * `ResolvedStack.skills` is keyed by `AgentName`, and the whole subject here is a key that is
 * not one — so the fixture is typed at the boundary the YAML actually crosses rather than cast
 * through the union it is meant to fall outside of.
 */
const FIXTURE_STACK_SKILLS: Record<string, Partial<Record<Category, SkillId[]>>> = {
  [MARKETPLACE_ONLY_AGENT]: {},
  [A_BUILT_IN_AGENT_THE_STACK_NAMES]: {},
};

/**
 * The grid may only offer sub-agents the CLI itself defines.
 *
 * A row here is a name the user can put into `config.agents`, and only `src/agents/` declares a
 * sub-agent that a compile pass can honour — `loadAgentDefs` is the single definition of that
 * roster, CLI-only by owner ruling 2026-08-21. So a marketplace stack naming an agent the CLI
 * does not ship must produce no row at all: offering one writes a config entry that reaches
 * `AgentName`, `SelectedAgentName` and `ProjectAgentName` alike and then compiles to nothing.
 */
describe("a sub-agent only a marketplace's stack names", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(
      createMockMatrix(
        {},
        {
          suggestedStacks: [
            createMockResolvedStack("fixture-stack", "Fixture Stack", {
              skills: FIXTURE_STACK_SKILLS,
            }),
          ],
        },
      ),
    );
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  /**
   * The control, and the half without which the assertion below means nothing: it would read
   * identically against a fixture whose stack names no agent at all. This proves the loaded
   * matrix really does carry the name, and that the name is outside the compile-time roster.
   */
  it("is carried by the loaded matrix and is outside AGENT_NAMES", () => {
    expect(
      matrix.suggestedStacks.flatMap((stack) => typedKeys(stack.skills)),
      "the fixture stack has to name it, or the grid has nothing to refuse",
    ).toContain(MARKETPLACE_ONLY_AGENT);

    expect(
      (AGENT_NAMES as readonly string[]).includes(MARKETPLACE_ONLY_AGENT),
      "the generated roster is built from the CLI's own src/agents/ — a marketplace name is not in it",
    ).toBe(false);
  });

  it("gets no grid row, because nothing could compile the name the row would write", () => {
    const { lastFrame, unmount } = render(<StepAgents />);
    cleanup = unmount;

    expect(lastFrame()).not.toContain(MARKETPLACE_ONLY_AGENT_LABEL);
  });

  it("still leaves the built-in the same stack names on the grid", () => {
    const { lastFrame, unmount } = render(<StepAgents />);
    cleanup = unmount;

    expect(lastFrame()).toContain("Web Developer");
  });
});
