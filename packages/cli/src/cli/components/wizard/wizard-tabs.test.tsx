import { render } from "ink-testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { WizardStep } from "../../stores/wizard-store";
import { WizardTabs, wizardTabsFor, type WizardTabsProps } from "./wizard-tabs";

/** Every step the wizard has, in order — the flow a marketplace that ships stacks runs. */
const FULL_STEP_FLOW: WizardStep[] = ["stack", "domains", "build", "sources", "agents", "confirm"];

/**
 * The label the bar paints for each step, spelled out here rather than read back out of the
 * component's own `WIZARD_STEP_LABELS`.
 *
 * An expectation taken from the table under test agrees with it however it changes: a WRONG
 * label moves both sides at once, so every assertion built that way can detect a MISSING tab
 * and nothing else. `e2e/pages/constants.ts` `WIZARD_TAB_LABELS` mirrors the same set for the
 * same reason, so a label moves in all three places or in none.
 *
 * The `sources` tab is named for what a user picks on the step — where each skill comes from —
 * and NOT for the config field the step writes. Renaming it to that field's noun was proposed
 * and withdrawn by the owner, so a later reader should read the mismatch with `SkillConfig.origin`
 * as deliberate rather than as a rename left half-finished.
 */
const WIZARD_TAB_LABEL = {
  stack: "Stack",
  domains: "Domains",
  build: "Skills",
  sources: "Sources",
  agents: "Agents",
  confirm: "Confirm",
} as const satisfies Record<WizardStep, string>;

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
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
      expect(output).toContain(WIZARD_TAB_LABEL.domains);
      expect(output).toContain(WIZARD_TAB_LABEL.build);
      expect(output).toContain(WIZARD_TAB_LABEL.sources);
      expect(output).toContain(WIZARD_TAB_LABEL.agents);
      expect(output).toContain(WIZARD_TAB_LABEL.confirm);
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
      expect(output).toContain(WIZARD_TAB_LABEL.build);
    });

    it("should mark first step as current by default", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "stack",
        completedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
    });

    it("should update current step when changed", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "confirm",
        completedSteps: ["stack", "build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.confirm);
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
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
    });

    it("should render multiple completed steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack", "build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
      expect(output).toContain(WIZARD_TAB_LABEL.build);
    });

    it("should render current step separately from completed steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "stack",
        completedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
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
      expect(output).toContain(WIZARD_TAB_LABEL.domains);
      expect(output).toContain(WIZARD_TAB_LABEL.build);
      expect(output).toContain(WIZARD_TAB_LABEL.sources);
    });

    it("should render steps after current", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "build",
        completedSteps: ["stack"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.confirm);
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
      expect(output).toContain(WIZARD_TAB_LABEL.build);
    });

    it("should handle multiple skipped steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "confirm",
        completedSteps: ["stack"],
        skippedSteps: ["build", "sources"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.build);
      expect(output).toContain(WIZARD_TAB_LABEL.sources);
    });

    it("should prioritize completed over skipped when step is in both arrays", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack", "build"],
        skippedSteps: ["build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
      expect(output).toContain(WIZARD_TAB_LABEL.build);
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
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
    });

    it("should prioritize current over skipped", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "build",
        completedSteps: [],
        skippedSteps: ["build"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.build);
    });

    it("should prioritize completed over skipped", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack"],
        skippedSteps: ["stack"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
    });
  });

  describe("visual layout", () => {
    it("should render tabs horizontally", () => {
      const { lastFrame, unmount } = renderWizardTabs();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
      expect(output).toContain(WIZARD_TAB_LABEL.confirm);
    });

    it("should include step labels", () => {
      const { lastFrame, unmount } = renderWizardTabs();
      cleanup = unmount;

      const output = lastFrame();
      FULL_STEP_FLOW.forEach((step) => {
        expect(output).toContain(WIZARD_TAB_LABEL[step]);
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
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
      expect(output).toContain(WIZARD_TAB_LABEL.confirm);
    });

    it("should handle empty skipped steps", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "sources",
        completedSteps: ["stack", "build"],
        skippedSteps: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
      expect(output).toContain(WIZARD_TAB_LABEL.build);
      expect(output).toContain(WIZARD_TAB_LABEL.sources);
    });

    it("should handle all steps completed", () => {
      const { lastFrame, unmount } = renderWizardTabs({
        currentStep: "confirm",
        completedSteps: ["stack", "domains", "build", "sources", "agents", "confirm"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(WIZARD_TAB_LABEL.stack);
      expect(output).toContain(WIZARD_TAB_LABEL.domains);
      expect(output).toContain(WIZARD_TAB_LABEL.build);
      expect(output).toContain(WIZARD_TAB_LABEL.sources);
      expect(output).toContain(WIZARD_TAB_LABEL.confirm);
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

  /**
   * The tab bar's own labels, which `e2e/pages/constants.ts` `WIZARD_TAB_LABELS` mirrors
   * as a whole set — a spec naming two of six cannot tell a complete bar from one that
   * dropped the steps it did not mention, so the label and the mirror move together.
   */
  describe("the vocabulary the tabs are labelled in", () => {
    it("should label every step in the flow, each spelled as the E2E mirror spells it", () => {
      expect(wizardTabsFor(FULL_STEP_FLOW)).toStrictEqual(
        FULL_STEP_FLOW.map((id) => ({ id, label: WIZARD_TAB_LABEL[id] })),
      );
    });

    it("should paint those labels onto the bar", () => {
      const { lastFrame, unmount } = renderWizardTabs();
      cleanup = unmount;

      const output = lastFrame();
      for (const step of FULL_STEP_FLOW) {
        expect(output).toContain(WIZARD_TAB_LABEL[step]);
      }
    });
  });
});
