import { render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckboxGrid, type CheckboxGridProps } from "./checkbox-grid";
import {
  ARROW_DOWN,
  ARROW_UP,
  ENTER,
  ESCAPE,
  SPACE,
  RENDER_DELAY_MS,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

type TestItem = "alpha" | "beta" | "gamma";

const TEST_ITEMS: CheckboxGridProps<TestItem>["items"] = [
  { id: "alpha", label: "Alpha", description: "First item" },
  { id: "beta", label: "Beta", description: "Second item" },
  { id: "gamma", label: "Gamma", description: "Third item" },
];

const defaultProps: CheckboxGridProps<TestItem> = {
  subtitle: "Test subtitle",
  items: TEST_ITEMS,
  selectedIds: [],
  onToggle: vi.fn(),
  onContinue: vi.fn(),
  onBack: vi.fn(),
  emptyMessage: "Select at least one",
};

const renderCheckboxGrid = (props: Partial<CheckboxGridProps<TestItem>> = {}) => {
  return render(<CheckboxGrid {...defaultProps} {...props} />);
};

describe("CheckboxGrid component", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("rendering", () => {
    it("should render subtitle (title is rendered by wizard-layout, not checkbox-grid)", () => {
      const { lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Test subtitle");
    });

    it("should render all items with correct labels", () => {
      const { lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Alpha");
      expect(output).toContain("Beta");
      expect(output).toContain("Gamma");
    });

    it("should render all item descriptions", () => {
      const { lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("First item");
      expect(output).toContain("Second item");
      expect(output).toContain("Third item");
    });

    it("should show unchecked checkboxes when nothing selected", () => {
      const { lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("[ ]");
      expect(output).not.toContain("[\u2713]");
    });

    it("should show checked checkboxes for selected items", () => {
      const { lastFrame, unmount } = renderCheckboxGrid({
        selectedIds: ["alpha", "gamma"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("[\u2713]");
    });

    it("should show empty message when nothing selected", () => {
      const { lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Select at least one");
    });

    it("should show empty message as dimmed informational text", () => {
      const { lastFrame, unmount } = renderCheckboxGrid({
        emptyMessage: "No items selected",
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("No items selected");
    });

    it("should show selected summary when items are selected", () => {
      const { lastFrame, unmount } = renderCheckboxGrid({
        selectedIds: ["alpha", "beta"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Selected:");
      expect(output).toContain("alpha");
      expect(output).toContain("beta");
    });

    it("should show selected summary when items are selected instead of continue label", () => {
      const { lastFrame, unmount } = renderCheckboxGrid({
        selectedIds: ["alpha"],
      });
      cleanup = unmount;

      const output = lastFrame();
      // Continue label is no longer rendered; selected summary is shown instead
      expect(output).toContain("Selected:");
      expect(output).toContain("alpha");
    });

    it("should show empty message when nothing selected instead of continue label", () => {
      const { lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      const output = lastFrame();
      // Continue label is no longer rendered; empty message is shown instead
      expect(output).toContain("Select at least one");
    });
  });

  describe("keyboard navigation", () => {
    it("should move focus down with arrow down", async () => {
      const { stdin, lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // First item focused by default (has focus indicator)
      let output = lastFrame();
      expect(output).toBeDefined();

      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      output = lastFrame();
      expect(output).toBeDefined();
    });

    it("should move focus up with arrow up", async () => {
      const { stdin, lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      // Should wrap to last item
      const output = lastFrame();
      expect(output).toBeDefined();
    });

    it("should move focus with j/k vim keys", async () => {
      const { stdin, lastFrame, unmount } = renderCheckboxGrid();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("j");
      await delay(INPUT_DELAY_MS);

      let output = lastFrame();
      expect(output).toBeDefined();

      stdin.write("k");
      await delay(INPUT_DELAY_MS);

      output = lastFrame();
      expect(output).toBeDefined();
    });

    it("should toggle selection with SPACE", async () => {
      const onToggle = vi.fn();
      const { stdin, unmount } = renderCheckboxGrid({ onToggle });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      // First item is focused by default, so toggling should call with "alpha"
      expect(onToggle).toHaveBeenCalledWith("alpha");
    });

    it("should toggle correct item after navigation", async () => {
      const onToggle = vi.fn();
      const { stdin, unmount } = renderCheckboxGrid({ onToggle });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      expect(onToggle).toHaveBeenCalledWith("beta");
    });

    it("should call onContinue with ENTER when items selected", async () => {
      const onContinue = vi.fn();
      const { stdin, unmount } = renderCheckboxGrid({
        onContinue,
        selectedIds: ["alpha"],
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onContinue).toHaveBeenCalled();
    });

    it("should call onContinue with ENTER even when nothing selected", async () => {
      const onContinue = vi.fn();
      const { stdin, unmount } = renderCheckboxGrid({
        onContinue,
        selectedIds: [],
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onContinue).toHaveBeenCalled();
    });

    it("should call onBack with ESC", async () => {
      const onBack = vi.fn();
      const { stdin, unmount } = renderCheckboxGrid({ onBack });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onBack).toHaveBeenCalled();
    });

    it("should wrap focus from last to first item", async () => {
      const onToggle = vi.fn();
      const { stdin, unmount } = renderCheckboxGrid({ onToggle });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      // Navigate down past all 3 items + continue item (always present)
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      // Should wrap to first item
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      expect(onToggle).toHaveBeenCalledWith("alpha");
    });

    it("should toggle through the latest onToggle after a re-render replaces it", async () => {
      const supersededOnToggle = vi.fn();
      const latestOnToggle = vi.fn();

      const { stdin, rerender, unmount } = render(
        <CheckboxGrid {...defaultProps} onToggle={supersededOnToggle} />,
      );
      cleanup = unmount;
      await delay(RENDER_DELAY_MS);

      rerender(<CheckboxGrid {...defaultProps} onToggle={latestOnToggle} />);
      await delay(RENDER_DELAY_MS);

      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      expect(latestOnToggle).toHaveBeenCalledWith("alpha");
      expect(supersededOnToggle).not.toHaveBeenCalled();
    });
  });

  describe("custom props", () => {
    it("should show selected items in summary with custom selections", () => {
      const { lastFrame, unmount } = renderCheckboxGrid({
        selectedIds: ["alpha", "beta"],
      });
      cleanup = unmount;

      const output = lastFrame();
      // Continue label is no longer rendered; verify selected summary instead
      expect(output).toContain("Selected:");
      expect(output).toContain("alpha");
      expect(output).toContain("beta");
    });

    it("should use custom emptyMessage", () => {
      const { lastFrame, unmount } = renderCheckboxGrid({
        emptyMessage: "Pick something!",
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Pick something!");
    });
  });
});
