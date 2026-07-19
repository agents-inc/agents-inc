import { render } from "ink-testing-library";
import { describe, expect, it, afterEach, vi } from "vitest";
import { StepRefine, type StepRefineProps } from "./step-refine";
import {
  ENTER,
  ESCAPE,
  ARROW_UP,
  ARROW_DOWN,
  RENDER_DELAY_MS,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";
import { DEFAULT_BRANDING, UI_SYMBOLS } from "../../consts";

const defaultProps: StepRefineProps = {
  technologyCount: 12,
  refineAction: "all-recommended",
  onSelectAction: vi.fn(),
  onContinue: vi.fn(),
  onBack: vi.fn(),
};

const renderStepRefine = (props: Partial<StepRefineProps> = {}) => {
  return render(<StepRefine {...defaultProps} {...props} />);
};

describe("StepRefine component", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("rendering", () => {
    it("should render technology count correctly", () => {
      const { lastFrame, unmount } = renderStepRefine({ technologyCount: 12 });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("12");
      expect(output).toContain("technologies");
    });

    it("should render different technology count", () => {
      const { lastFrame, unmount } = renderStepRefine({ technologyCount: 5 });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("5");
      expect(output).toContain("technologies");
    });

    it("should render 'Use all recommended' option", () => {
      const { lastFrame, unmount } = renderStepRefine();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Use all recommended skills (verified)");
    });

    it("should show 'Use all recommended' option as highlighted", () => {
      const { lastFrame, unmount } = renderStepRefine({
        refineAction: "all-recommended",
      });
      cleanup = unmount;

      const output = lastFrame();
      // The focused card should have the chevron indicator
      expect(output).toContain(UI_SYMBOLS.CHEVRON);
      expect(output).toContain("Use all recommended skills");
    });

    it("should render verification description", () => {
      const { lastFrame, unmount } = renderStepRefine();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("fastest option");
      expect(output).toContain("verified");
      expect(output).toContain(DEFAULT_BRANDING.NAME);
    });
  });

  describe("customize option", () => {
    it("should show 'Customize' option as disabled/grayed", () => {
      const { lastFrame, unmount } = renderStepRefine();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Customize skill sources");
    });

    it("should show customize option without coming soon label", () => {
      const { lastFrame, unmount } = renderStepRefine();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Customize skill sources");
      expect(output).not.toContain("(coming soon)");
    });

    it("should show customize description", () => {
      const { lastFrame, unmount } = renderStepRefine();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Choose alternative skills for each technology");
    });
  });

  describe("keyboard shortcuts display", () => {
    it("should render recommended option content", () => {
      const { lastFrame, unmount } = renderStepRefine();
      cleanup = unmount;

      const output = lastFrame();
      // Keyboard hints are now in WizardLayout footer, not in StepRefine
      // Verify core content renders
      expect(output).toContain("Use all recommended");
      expect(output).toContain("Customize skill sources");
    });
  });

  describe("keyboard navigation", () => {
    it("should call onContinue when Enter key is pressed", async () => {
      const onContinue = vi.fn();
      const { stdin, unmount } = renderStepRefine({ onContinue });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it("should call onBack when Escape key is pressed", async () => {
      const onBack = vi.fn();
      const { stdin, unmount } = renderStepRefine({ onBack });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("should toggle to 'customize' on arrow up when recommended is selected", async () => {
      const onSelectAction = vi.fn();
      const { stdin, unmount } = renderStepRefine({
        onSelectAction,
        refineAction: "all-recommended",
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      expect(onSelectAction).toHaveBeenCalledWith("customize");
    });

    it("should toggle to 'all-recommended' on arrow down when customize is selected", async () => {
      const onSelectAction = vi.fn();
      const { stdin, unmount } = renderStepRefine({
        onSelectAction,
        refineAction: "customize",
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      expect(onSelectAction).toHaveBeenCalledWith("all-recommended");
    });
  });

  describe("selection state", () => {
    it("should handle null refineAction (defaults to recommended)", () => {
      const { lastFrame, unmount } = renderStepRefine({ refineAction: null });
      cleanup = unmount;

      const output = lastFrame();
      // Should still show the recommended option with the focus indicator
      expect(output).toContain(UI_SYMBOLS.CHEVRON);
      expect(output).toContain("Use all recommended");
    });

    it("should handle 'all-recommended' refineAction", () => {
      const { lastFrame, unmount } = renderStepRefine({
        refineAction: "all-recommended",
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Use all recommended");
    });

    it("should handle 'customize' refineAction (even though disabled)", () => {
      const { lastFrame, unmount } = renderStepRefine({
        refineAction: "customize",
      });
      cleanup = unmount;

      const output = lastFrame();
      // Should still render, even if customize is selected
      expect(output).toContain("Use all recommended");
      expect(output).toContain("Customize skill sources");
    });
  });

  describe("edge cases", () => {
    it("should handle zero technology count", () => {
      const { lastFrame, unmount } = renderStepRefine({ technologyCount: 0 });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("0");
      expect(output).toContain("technologies");
    });

    it("should handle single technology count", () => {
      const { lastFrame, unmount } = renderStepRefine({ technologyCount: 1 });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("1");
      // Note: "technologies" is plural even for 1 (simple implementation)
      expect(output).toContain("technologies");
    });

    it("should handle large technology count", () => {
      const { lastFrame, unmount } = renderStepRefine({ technologyCount: 100 });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("100");
      expect(output).toContain("technologies");
    });
  });

  describe("multiple keyboard events", () => {
    it("should allow multiple Enter presses", async () => {
      const onContinue = vi.fn();
      const { stdin, unmount } = renderStepRefine({ onContinue });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onContinue).toHaveBeenCalledTimes(2);
    });

    it("should allow multiple Escape presses", async () => {
      const onBack = vi.fn();
      const { stdin, unmount } = renderStepRefine({ onBack });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onBack).toHaveBeenCalledTimes(2);
    });
  });
});
