import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { useWizardStore } from "../../stores/wizard-store";
import { StepAgents } from "./step-agents";

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
