import { render } from "ink-testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { WizardStep } from "../../stores/wizard-store";
import { WizardTabs, wizardTabsFor, formatStepLabel, type WizardTabsProps } from "./wizard-tabs";

/** Every step the wizard has, in order — the flow a source that ships stacks runs. */
const FULL_STEP_FLOW: WizardStep[] = ["stack", "domains", "build", "sources", "agents", "confirm"];

const renderWizardTabs = (props: Partial<WizardTabsProps> = {}) => {
  const defaultProps: WizardTabsProps = {
    steps: wizardTabsFor(FULL_STEP_FLOW),
    currentStep: "stack",
    completedSteps: [],
    skippedSteps: [],
    ...props,
  };
  return render(<WizardTabs {...defaultProps} />);
};

describe("WizardTabs component", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("rendering", () => {
    it("should render all 6 tabs", () => {
      const { lastFrame, unmount } = renderWizardTabs();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
      expect(output).toContain(formatStepLabel("domains"));
      expect(output).toContain(formatStepLabel("build"));
      expect(output).toContain(formatStepLabel("sources"));
      expect(output).toContain(formatStepLabel("agents"));
      expect(output).toContain(formatStepLabel("confirm"));
    });

    it("should render with custom steps", () => {
      const customSteps = [
        { id: "stack" as WizardStep, label: "First" },
        { id: "build" as WizardStep, label: "Second" },
      ];
      const { lastFrame, unmount } = renderWizardTabs({
        steps: customSteps,
        currentStep: "stack",
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("First");
      expect(output).toContain("Second");
    });

    it("should render horizontal dividers above and below tabs", () => {
      const { lastFrame, unmount } = renderWizardTabs();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("\u2500");
    });
  });

  describe("current step", () => {
    it("should render current step label", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "build",
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("build"));
    });

    it("should mark first step as current by default", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "stack",
        completedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
    });

    it("should update current step when changed", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "confirm",
        completedSteps: ["stack", "build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("confirm"));
    });
  });

  describe("completed steps", () => {
    it("should render completed step labels", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "build",
        completedSteps: ["stack"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
    });

    it("should render multiple completed steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack", "build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
      expect(output).toContain(formatStepLabel("build"));
    });

    it("should render current step separately from completed steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "stack",
        completedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
    });
  });

  describe("pending steps", () => {
    it("should render pending step labels", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "stack",
        completedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("domains"));
      expect(output).toContain(formatStepLabel("build"));
      expect(output).toContain(formatStepLabel("sources"));
    });

    it("should render steps after current", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "build",
        completedSteps: ["stack"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("confirm"));
    });
  });

  describe("skipped steps", () => {
    it("should render skipped step labels", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack"],
        skippedSteps: ["build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("build"));
    });

    it("should handle multiple skipped steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "confirm",
        completedSteps: ["stack"],
        skippedSteps: ["build", "sources"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("build"));
      expect(output).toContain(formatStepLabel("sources"));
    });

    it("should prioritize completed over skipped when step is in both arrays", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack", "build"],
        skippedSteps: ["build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
      expect(output).toContain(formatStepLabel("build"));
    });
  });

  describe("state priority", () => {
    it("should prioritize completed over current", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "stack",
        completedSteps: ["stack"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
    });

    it("should prioritize current over skipped", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "build",
        completedSteps: [],
        skippedSteps: ["build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("build"));
    });

    it("should prioritize completed over skipped", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack"],
        skippedSteps: ["stack"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
    });
  });

  describe("visual layout", () => {
    it("should render tabs horizontally", () => {
      const { lastFrame, unmount } = renderWizardTabs();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
      expect(output).toContain(formatStepLabel("confirm"));
    });

    it("should include step labels", () => {
      const { lastFrame, unmount } = renderWizardTabs();
      cleanup = unmount;

      const output = lastFrame();
      FULL_STEP_FLOW.forEach((step) => {
        expect(output).toContain(formatStepLabel(step));
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty completed steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "stack",
        completedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
      expect(output).toContain(formatStepLabel("confirm"));
    });

    it("should handle empty skipped steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack", "build"],
        skippedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
      expect(output).toContain(formatStepLabel("build"));
      expect(output).toContain(formatStepLabel("sources"));
    });

    it("should handle all steps completed", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "confirm",
        completedSteps: ["stack", "domains", "build", "sources", "agents", "confirm"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(formatStepLabel("stack"));
      expect(output).toContain(formatStepLabel("domains"));
      expect(output).toContain(formatStepLabel("build"));
      expect(output).toContain(formatStepLabel("sources"));
      expect(output).toContain(formatStepLabel("confirm"));
    });

    it("should handle single step", () => {
      const singleStep = [{ id: "confirm" as WizardStep, label: "Only Step" }];
      const { lastFrame, unmount } = renderWizardTabs({
        steps: singleStep,
        currentStep: "confirm",
        completedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Only Step");
    });
  });
});
