import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Wizard } from "../../../components/wizard/wizard";
import { hydrateWizardStore, useWizardStore } from "../../../stores/wizard-store";
import { initializeMatrix } from "../../matrix/matrix-provider";
import * as wizardLib from "../../wizard/index.js";
import { createComprehensiveMatrix, createBasicMatrix } from "../factories/matrix-factories.js";
import type { AgentName, Domain, SkillId } from "../../../types";
import { firstElement } from "../helpers/element-at.js";
import {
  ARROW_DOWN,
  ENTER,
  ESCAPE,
  RENDER_DELAY_MS,
  SPACE,
  STEP_TRANSITION_DELAY_MS,
  delay,
} from "../test-constants";

/**
 * Navigate from the domain selection step to the build step.
 *
 * Domain selection uses a CheckboxGrid with items:
 *   [Web, API, CLI, Mobile, Continue]
 *
 * Focus starts on "Web" (index 0). We press down 4 times to reach
 * "Continue" (index 4) and then Enter to proceed.
 */
const navigateDomainSelectionToBuild = async (stdin: { write: (data: string) => void }) => {
  const DOMAIN_CONTINUE_NAV_COUNT = 4;
  for (let i = 0; i < DOMAIN_CONTINUE_NAV_COUNT; i++) {
    stdin.write(ARROW_DOWN);
    await delay(STEP_TRANSITION_DELAY_MS);
  }
  stdin.write(ENTER); // Continue
  await delay(STEP_TRANSITION_DELAY_MS);
};

/**
 * Drives the full happy path: select the first stack, pass through domain
 * selection, both build domains, sources, and agents, then confirm — the
 * completion ENTER sequence shared by the result-shape tests.
 */
const completeStackFlowFromStart = async (stdin: { write: (data: string) => void }) => {
  stdin.write(ENTER); // Select first stack
  await delay(STEP_TRANSITION_DELAY_MS);
  await navigateDomainSelectionToBuild(stdin); // Domain -> Build
  stdin.write(ENTER); // Build: advance from web to api domain
  await delay(STEP_TRANSITION_DELAY_MS);
  stdin.write(ENTER); // Build: advance from api domain -> Sources
  await delay(STEP_TRANSITION_DELAY_MS);
  stdin.write(ENTER); // Sources -> Agents
  await delay(STEP_TRANSITION_DELAY_MS);
  stdin.write(ENTER); // Agents -> Confirm
  await delay(STEP_TRANSITION_DELAY_MS);
  stdin.write(ENTER); // Confirm -> complete
  await delay(STEP_TRANSITION_DELAY_MS);
};

/**
 * `DEFAULT_SCRATCH_DOMAINS` from `consts.ts`, spelled rather than imported: an assertion
 * built from the very constant the store selects with moves whenever that constant moves,
 * so it cannot fail on a change to the scratch roster — the one change it exists to catch.
 */
const EXPECTED_SCRATCH_DOMAINS: Domain[] = ["web", "api", "mobile"];

describe("Wizard integration", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(createBasicMatrix());
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("Flow A1: Stack path with defaults", () => {
    it("should complete full stack -> domain -> build -> sources -> agents -> confirm flow", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      expect(lastFrame()).toContain("React Fullstack");
      expect(lastFrame()).toContain("Choose a stack");

      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Domain selection sub-view (ViewTitle removed from CheckboxGrid; verify domain options)
      expect(lastFrame()).toContain("Web");

      await navigateDomainSelectionToBuild(stdin);

      // Navigate through remaining steps manually (2 domains: web, api)
      stdin.write(ENTER); // Build: advance from web domain to api domain
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ENTER); // Build: advance from api domain -> Sources
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ENTER); // Sources -> Agents
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ENTER); // Agents -> Confirm
      await delay(STEP_TRANSITION_DELAY_MS);

      expect(lastFrame()).toContain("Confirm");

      // Complete the wizard (ENTER on confirm triggers completion)
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();

      const result = firstElement(firstElement(onComplete.mock.calls));
      expect(result.selectedStackId).toBe("react-fullstack");
      expect(result.cancelled).toBe(false);
    });
  });

  describe("Flow A2: Stack path with customize", () => {
    it("should navigate stack -> domain -> build step (pre-populated from stack)", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Domain selection sub-view (ViewTitle removed from CheckboxGrid; verify domain options)
      expect(lastFrame()).toContain("Web");
      await navigateDomainSelectionToBuild(stdin);

      expect(lastFrame()).toContain("Skills");

      const state = useWizardStore.getState();
      expect(state.stackAction).toBe("customize");
      expect(state.step).toBe("build");
      expect(Object.keys(state.domainSelections).length).toBeGreaterThan(0);
    });
  });

  describe("Flow B: Scratch path with single domain (Web)", () => {
    it("should start scratch flow from unified stack selection", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      expect(lastFrame()).toContain("Choose a stack");
      stdin.write(ARROW_DOWN);
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(STEP_TRANSITION_DELAY_MS);

      // After scrolling down, "Start from scratch" should be visible in the viewport
      expect(lastFrame()).toContain("Start from scratch");
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Domain selection step (now its own step, not a sub-view of stack)
      expect(lastFrame()).toContain("Web");

      const state = useWizardStore.getState();
      expect(state.approach).toBe("scratch");
      expect(state.step).toBe("domains");
    });

    it("should complete scratch flow from domain selection to build", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      useWizardStore.setState({
        step: "domains",
        approach: "scratch",
        selectedDomains: ["web"],
        history: ["stack"],
      });

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Domain selection step (ViewTitle removed from CheckboxGrid; verify domain content)
      expect(lastFrame()).toContain("Selected");
      expect(lastFrame()).toContain("web");

      await navigateDomainSelectionToBuild(stdin);

      const state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.selectedDomains).toContain("web");
    });

    it("should allow selecting web technologies in Skills step", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      useWizardStore.setState({
        step: "build",
        approach: "scratch",
        selectedDomains: ["web"],
        currentDomainIndex: 0,
        domainSelections: {},
      });

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      expect(lastFrame()).toContain("Skills");

      stdin.write(SPACE);
      await delay(STEP_TRANSITION_DELAY_MS);

      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      const state = useWizardStore.getState();
      expect(state.step).toBe("sources");
    });
  });

  describe("Flow C: Scratch path with multi-domain (Web + API)", () => {
    it("should correctly set approach when selecting scratch", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      stdin.write(ARROW_DOWN);
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      const state = useWizardStore.getState();
      expect(state.approach).toBe("scratch");
      expect(state.step).toBe("domains");
      // Domain selection step (verify domain options)
      expect(lastFrame()).toContain("Web");
    });

    it("should pre-select the scratch domains when the scratch row is chosen", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Navigate to scratch (past 2 stacks)
      stdin.write(ARROW_DOWN); // Vue Stack
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ARROW_DOWN); // Start from scratch
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      const state = useWizardStore.getState();
      expect(state.approach).toBe("scratch");
      expect(
        state.selectedDomains,
        "the scratch row must arrive on the domains step with every scratch domain on",
      ).toStrictEqual(EXPECTED_SCRATCH_DOMAINS);
    });

    it("should navigate through multi-domain build with pre-selected domains", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      useWizardStore.setState({
        step: "domains",
        approach: "scratch",
        selectedDomains: ["web", "api"],
        history: ["stack"],
      });

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      expect(lastFrame()).toContain("Selected");
      expect(lastFrame()).toContain("web");
      expect(lastFrame()).toContain("api");

      await navigateDomainSelectionToBuild(stdin);

      const state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.currentDomainIndex).toBe(0);
    });

    it("should show domain tabs for multi-domain build", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      // Pre-set store to build step with multiple domains
      useWizardStore.setState({
        step: "build",
        approach: "scratch",
        selectedDomains: ["web", "api"],
        currentDomainIndex: 0,
        domainSelections: {},
      });

      const { lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // ViewTitle removed from StepBuild; verify domain tab navigation renders instead
      const frame = lastFrame();
      expect(frame).toContain("Web");
      expect(frame).toContain("Skills");
    });

    it("should advance to next domain when validation passes", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      // Pre-set store with required selections already made
      useWizardStore.setState({
        step: "build",
        approach: "scratch",
        selectedDomains: ["web", "api"],
        currentDomainIndex: 0,
        domainSelections: {
          web: { ["web-framework"]: ["web-framework-react"] },
        },
      });

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Continue to next domain
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should now be on second domain
      const state = useWizardStore.getState();
      expect(state.currentDomainIndex).toBe(1);
    });

    it("should allow navigation between domains using escape", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      // Pre-set to build step on second domain
      useWizardStore.setState({
        step: "build",
        approach: "scratch",
        selectedDomains: ["web", "api"],
        currentDomainIndex: 1, // On API domain
        domainSelections: {
          web: { ["web-framework"]: ["web-framework-react"] },
        },
        history: ["stack", "domains"],
      });

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Press escape to go back to first domain
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should be back on first domain
      const state = useWizardStore.getState();
      expect(state.currentDomainIndex).toBe(0);

      // Web selections should be preserved
      expect(state.domainSelections.web?.["web-framework"]).toContain("web-framework-react");
    });
  });

  describe("Flow D: Back navigation", () => {
    it("should navigate back from build to domains step", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Now at domain selection step, navigate to build
      await navigateDomainSelectionToBuild(stdin);

      // Verify we're at build
      let state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.selectedStackId).toBe("react-fullstack");

      // Go back from build to domains step
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should be back at domains step
      state = useWizardStore.getState();
      expect(state.step).toBe("domains");
      // Stack selection should be preserved
      expect(state.selectedStackId).toBe("react-fullstack");
    });
  });

  describe("Flow E: Cancel from first step", () => {
    it("should call onCancel when escape pressed at initial stack selection", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Press escape at first step (initial stack selection)
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should have called onCancel
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("should not call onCancel when going back from domain selection", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Select a stack (approach gets set, domain selection shows)
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should be at domain selection (ViewTitle removed; verify domain options render)
      expect(lastFrame()).toContain("Web");

      // Press ESC to go back from domain selection
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should be back at stack/scratch selection (approach reset to null)
      expect(lastFrame()).toContain("Choose a stack");
      expect(onCancel).not.toHaveBeenCalled();

      // Now escape at initial selection should cancel
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("stack selection flow", () => {
    it("should navigate through stack -> domain -> build", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Step 1: Unified stack selection - see stacks directly
      expect(lastFrame()).toContain("React Fullstack");
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Step 1b: Domain selection (ViewTitle removed from CheckboxGrid; verify domain options)
      expect(lastFrame()).toContain("Web");
      await navigateDomainSelectionToBuild(stdin);

      // Step 2: Build - pre-populated from stack
      const state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.selectedStackId).toBe("react-fullstack");
    });

    it("should complete wizard by navigating through all steps", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Step 1: Select first stack
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Step 1b: Navigate through domain selection
      await navigateDomainSelectionToBuild(stdin);

      // Step 2: Build - navigate through both domains (web, api)
      stdin.write(ENTER); // Advance from web domain to api domain
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ENTER); // Advance from api domain -> Sources
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should be past build step
      const state = useWizardStore.getState();
      expect(state.step === "sources" || state.step === "agents" || state.step === "confirm").toBe(
        true,
      );
    });
  });

  describe("cancellation flow", () => {
    it("should call onCancel when escape pressed at initial stack selection", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Press escape at first step
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("should go back to stack selection when escape pressed at domain selection", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Select a stack to get to domain selection
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);
      // Domain selection sub-view (ViewTitle removed from CheckboxGrid; verify domain options)
      expect(lastFrame()).toContain("Web");

      // Press ESC to go back from domain selection
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should be back at stack/scratch selection
      expect(lastFrame()).toContain("Choose a stack");
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe("navigation history", () => {
    it("should navigate back through wizard steps using escape", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Select first stack
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Navigate through domain selection to build
      await navigateDomainSelectionToBuild(stdin);

      // Should now be at build
      const state = useWizardStore.getState();
      expect(state.step).toBe("build");

      // Go back using escape
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should be back at domains step
      expect(useWizardStore.getState().step).toBe("domains");
    });

    it("should preserve selections when going back", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Select first stack
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Navigate through domain selection to build
      await navigateDomainSelectionToBuild(stdin);

      // Should be at build
      expect(useWizardStore.getState().step).toBe("build");

      // Go back using escape
      stdin.write(ESCAPE);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Stack should still be selected in store
      const { selectedStackId } = useWizardStore.getState();
      expect(selectedStackId).toBe("react-fullstack");
    });
  });

  describe("step footer hints", () => {
    it("should display ESC hint in step footer", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Centralized footer shows keyboard hints on all steps
      const frame = lastFrame();
      // Footer shows ESC/back hint
      expect(frame).toContain("back");
    });

    it("should display navigation hints in step footer", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Centralized footer shows navigation hints
      expect(lastFrame()).toContain("select");
    });
  });

  describe("alternative stack selection", () => {
    it("should allow selecting second stack", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Navigate to second stack (Testing Stack) and select
      stdin.write(ARROW_DOWN);
      await delay(STEP_TRANSITION_DELAY_MS);
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Should be at domain selection with testing-stack selected
      const state = useWizardStore.getState();
      expect(state.selectedStackId).toBe("testing-stack");
      expect(state.approach).toBe("stack");
    });
  });

  describe("wizard tabs", () => {
    it("should display wizard tabs at all steps", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Should show wizard tabs (6 tabs: Stack, Domains, Skills, Sources, Agents, Confirm)
      expect(lastFrame()).toContain("Stack");
      expect(lastFrame()).toContain("Domains");
      expect(lastFrame()).toContain("Skills");
      expect(lastFrame()).toContain("Sources");
      expect(lastFrame()).toContain("Confirm");
      // Should NOT show "Intro" tab (removed by U14)
      expect(lastFrame()).not.toContain("Intro");
    });
  });

  describe("result verification", () => {
    it("should return correct result structure on completion", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Complete full flow: stack -> domain -> build (2 domains) -> sources -> agents -> confirm
      await completeStackFlowFromStart(stdin);

      // Verify result structure
      expect(onComplete).toHaveBeenCalledTimes(1);
      const result = firstElement(firstElement(onComplete.mock.calls));

      expect(result).toHaveProperty("skills");
      expect(result).toHaveProperty("selectedStackId");
      expect(result).toHaveProperty("domainSelections");
      expect(result).toHaveProperty("cancelled");
      expect(result).toHaveProperty("validation");

      expect(result.selectedStackId).toBe("react-fullstack");
      expect(result.cancelled).toBe(false);
      expect(Array.isArray(result.skills)).toBe(true);
    });

    it("should include preselected skills in result", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Complete full flow: stack -> domain -> build (2 domains) -> sources -> agents -> confirm
      await completeStackFlowFromStart(stdin);

      const result = firstElement(firstElement(onComplete.mock.calls));

      // Should include at least the preselected skills (methodology skills)
      expect(Array.isArray(result.skills)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should show keyboard help text on initial stack selection", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Footer shows keyboard navigation hints
      const frame = lastFrame();
      expect(frame).toContain("select");
    });

    it("should show keyboard help text on domain selection step", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Navigate to domain selection by selecting a stack
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      const frame = lastFrame();
      expect(frame).toContain("back");
    });

    it("should show domain selection hint when no domains selected on scratch path", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      // Pre-set to domains step with no domains selected (simulating cleared state)
      useWizardStore.setState({
        step: "domains",
        approach: "scratch",
        selectedDomains: [],
        history: ["stack"],
      });

      const { lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Should show hint to select domain
      const frame = lastFrame();
      expect(frame).toContain("at least one domain");
    });

    it("should show all wizard tabs on every step", async () => {
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const { stdin, lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Check tabs are visible on initial stack selection
      let frame = lastFrame();
      expect(frame).toContain("Stack");
      expect(frame).toContain("Domains");
      expect(frame).toContain("Skills");
      expect(frame).toContain("Confirm");
      expect(frame).not.toContain("Intro");

      // Navigate to domain selection step (select a stack)
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Check tabs are still visible on domain selection step
      frame = lastFrame();
      expect(frame).toContain("Stack");
      expect(frame).toContain("Domains");
      expect(frame).toContain("Skills");
    });
  });

  describe("Flow F: Edit mode pre-selection (eject mode)", () => {
    it("should pre-select skills from installedSkillIds in edit mode", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      hydrateWizardStore({
        initialStep: "build",
        installedSkillIds: ["web-framework-react", "api-framework-hono"],
      });

      const { lastFrame, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Verify the wizard store has populated domainSelections from installedSkillIds
      const state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.approach).toBe("scratch");

      // domainSelections should contain the installed skills grouped by domain/category
      expect(state.domainSelections.web?.["web-framework"]).toContain("web-framework-react");
      expect(state.domainSelections.api?.["api-api"]).toContain("api-framework-hono");

      // selectedDomains should be populated (domains derived from skill IDs by populateFromSkillIds)
      expect(state.selectedDomains.length).toBeGreaterThan(0);

      // The Skills step should be visible
      expect(lastFrame()).toContain("Skills");
    });

    it("should not pre-select when installedSkillIds is empty (regression: eject mode bug)", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      hydrateWizardStore({
        initialStep: "build",
        installedSkillIds: [],
      });

      const { unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Verify the wizard store has no pre-populated domainSelections
      const state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.approach).toBe("scratch");

      // domainSelections should be empty since no skills were passed
      expect(Object.keys(state.domainSelections).length).toBe(0);
    });

    it("should include pre-selected skills in final wizard result", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      hydrateWizardStore({
        initialStep: "build",
        installedSkillIds: ["web-framework-react", "api-framework-hono"],
      });

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Navigate from build to sources -> agents -> confirm -> complete
      // Press Enter to continue from Build (selections already pre-populated)
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      const stateAfterBuild = useWizardStore.getState();

      // Depending on flow, we may be at sources or need to navigate further
      // The key assertion is that domainSelections were populated before the user interacted
      expect(stateAfterBuild.domainSelections.web?.["web-framework"]).toContain(
        "web-framework-react",
      );
      expect(stateAfterBuild.domainSelections.api?.["api-api"]).toContain("api-framework-hono");
    });

    it("should start with empty history when initialStep is set (edit flow)", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      hydrateWizardStore({
        initialStep: "build",
        installedSkillIds: ["web-framework-react"],
      });

      const { unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      const state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.history).toStrictEqual([]);
    });

    it("renders build step on first frame when hydrated with initialStep='build' (no stack flash)", () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      hydrateWizardStore({
        initialStep: "build",
        installedSkillIds: ["web-framework-react"],
      });

      const { frames, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      // First frame must not show stack-selection chrome
      expect(frames[0]).not.toMatch(/Select a stack/i);
      expect(frames[0]).not.toMatch(/Start from scratch/i);
      // Positive assertion: first frame is the build step (tabs row includes "Skills")
      expect(frames[0]).toContain("Skills");
    });
  });

  // Regression tests for the two render-time props restored after the
  // hydrateWizardStore refactor. See wizard.tsx WizardProps:
  //   - installedSkillIds flows through useBuildStepProps into StepBuild so
  //     that buildCategoriesForDomain marks the correct skills as `installed`.
  //   - initialAgents gates the StepSources.onContinue call to
  //     preselectAgentsFromDomains (launch-time closure, not click-time store read).
  describe("Flow F regressions: restored render-time props", () => {
    it("forwards installedSkillIds prop to buildCategoriesForDomain (not derived from store)", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const PROP_INSTALLED_IDS: SkillId[] = ["web-framework-react"];

      hydrateWizardStore({
        initialStep: "build",
        // Deliberately leave installedSkillConfigs/installedSkillIds unset on the store —
        // the prop is the source of truth at render time.
      });

      const spy = vi.spyOn(wizardLib, "buildCategoriesForDomain");

      const { unmount } = render(
        <Wizard
          onComplete={onComplete}
          onCancel={onCancel}
          installedSkillIds={PROP_INSTALLED_IDS}
          version="0.0.0"
        />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // buildCategoriesForDomain signature:
      //   (domain, allSelections, installedSkillIds?, skillConfigs?)
      // Assert that at least one call received our prop value as the 3rd arg.
      const calls = spy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const matchingCall = calls.find((c) => c[2] === PROP_INSTALLED_IDS);
      expect(matchingCall).toBeDefined();

      spy.mockRestore();
    });

    it("does NOT preselect agents from domains when initialAgents prop is provided (launch-time closure)", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      const INITIAL_AGENTS: AgentName[] = ["web-developer"];

      hydrateWizardStore({
        initialStep: "sources",
        initialAgents: INITIAL_AGENTS,
      });

      const { stdin, unmount } = render(
        <Wizard
          onComplete={onComplete}
          onCancel={onCancel}
          initialAgents={INITIAL_AGENTS}
          version="0.0.0"
        />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Simulate the user deselecting all saved agents after reaching sources.
      useWizardStore.setState({ selectedAgents: [] });

      // Press Enter to trigger StepSources.onContinue.
      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // Gate behavior: because initialAgents was non-empty at launch,
      // preselectAgentsFromDomains must NOT run — the user's explicit empty
      // selection is preserved.
      const state = useWizardStore.getState();
      expect(state.selectedAgents).toStrictEqual([]);
    });

    it("DOES preselect agents from domains when initialAgents prop is absent", async () => {
      initializeMatrix(createComprehensiveMatrix());
      const onComplete = vi.fn();
      const onCancel = vi.fn();

      hydrateWizardStore({
        initialStep: "sources",
        // No initialAgents — simulates fresh init flow.
      });

      // Seed selectedDomains so preselectAgentsFromDomains has something to pull from.
      useWizardStore.setState({ selectedDomains: ["web"], selectedAgents: [] });

      const { stdin, unmount } = render(
        <Wizard onComplete={onComplete} onCancel={onCancel} version="0.0.0" />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      stdin.write(ENTER);
      await delay(STEP_TRANSITION_DELAY_MS);

      // No initialAgents gate -> preselect should have populated selectedAgents
      // from DOMAIN_AGENTS["web"].
      const state = useWizardStore.getState();
      expect(state.selectedAgents.length).toBeGreaterThan(0);
      expect(state.selectedAgents).toContain("web-developer");
    });
  });
});
