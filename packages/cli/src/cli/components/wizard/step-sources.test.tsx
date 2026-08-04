import { render } from "ink-testing-library";
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { StepSources, type StepSourcesProps } from "./step-sources";
import { useWizardStore } from "../../stores/wizard-store";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import {
  ENTER,
  ESCAPE,
  RENDER_DELAY_MS,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";
import { WEB_PAIR_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";

const mockMatrix = WEB_PAIR_MATRIX;

const defaultProps: StepSourcesProps = {
  onContinue: vi.fn(),
  onBack: vi.fn(),
};

const renderStepSources = (props: Partial<StepSourcesProps> = {}) => {
  return render(<StepSources {...defaultProps} {...props} />);
};

describe("StepSources component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(mockMatrix);
    // Set up some selected technologies so the step has data to display
    useWizardStore.setState({
      domainSelections: {
        web: {
          "web-framework": ["web-framework-react"],
          "web-client-state": ["web-state-zustand"],
        },
      },
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("customize view", () => {
    it("should show source grid with selected technologies", async () => {
      const { lastFrame, unmount } = renderStepSources();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("React");
      expect(output).toContain("Zustand");
      expect(output).toContain("Agents Inc");
    });

    it("should call onContinue when Enter pressed in customize view", async () => {
      const onContinue = vi.fn();
      const { stdin, unmount } = renderStepSources({ onContinue });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Press Enter to continue (starts directly in customize view)
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it("should call onBack when Escape pressed in customize view", async () => {
      const onBack = vi.fn();
      const { stdin, unmount } = renderStepSources({ onBack });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Press Escape (starts directly in customize view, goes back)
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("should show source grid content in customize view", async () => {
      const { lastFrame, unmount } = renderStepSources();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      const output = lastFrame();
      // ViewTitle removed; verify source grid renders (title shown by wizard-layout)
      expect(output).toContain("React");
    });
  });

  describe("edge cases", () => {
    it("should handle zero technologies", () => {
      useWizardStore.setState({
        domainSelections: {},
      });

      const { lastFrame, unmount } = renderStepSources();
      cleanup = unmount;

      const output = lastFrame();
      // ViewTitle removed; source grid renders empty state
      expect(output).toBeDefined();
    });

    it("should handle single technology", () => {
      useWizardStore.setState({
        domainSelections: {
          web: {
            "web-framework": ["web-framework-react"],
          },
        },
      });

      const { lastFrame, unmount } = renderStepSources();
      cleanup = unmount;

      const output = lastFrame();
      // ViewTitle removed; verify source grid shows the technology
      expect(output).toContain("React");
    });

    it("should handle multiple Enter presses in customize view", async () => {
      const onContinue = vi.fn();
      const { stdin, unmount } = renderStepSources({ onContinue });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onContinue).toHaveBeenCalledTimes(2);
    });
  });
});
