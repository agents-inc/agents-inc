/**
 * `StepSettings` is still in the tree and still compiles, but the SURFACE that
 * reaches it — the `S` hotkey on the sources step — is gated off behind
 * `FEATURE_FLAGS.WIZARD_SETTINGS_OVERLAY` (D-307), so no user can open this
 * component today.
 *
 * These specs deliberately keep running: they render the component directly, so
 * they never depended on the hotkey, and they are what stops the component
 * rotting while it is unreachable. The end-to-end specs that drive it THROUGH the
 * wizard are the ones that skip with the flag.
 */
import { render } from "ink-testing-library";
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { TEST_SOURCE_URL } from "../../lib/__tests__/test-constants.js";
import { StepSettings, type StepSettingsProps } from "./step-settings";
import {
  ESCAPE,
  ARROW_UP,
  ARROW_DOWN,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

// Mock source-manager
vi.mock("../../lib/configuration/source-manager.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/configuration/source-manager.js")>()),
  getSourceSummary: vi.fn(),
  addSource: vi.fn(),
  removeSource: vi.fn(),
}));

const LOADING_SETTLE_MS = 200;

const defaultProps: StepSettingsProps = {
  projectDir: "/test/project",
  onClose: vi.fn(),
};

const renderStepSettings = (props: Partial<StepSettingsProps> = {}) => {
  return render(<StepSettings {...defaultProps} {...props} />);
};

describe("StepSettings component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    vi.resetAllMocks();

    const { getSourceSummary } = await import("../../lib/configuration/source-manager.js");
    vi.mocked(getSourceSummary).mockResolvedValue({
      sources: [
        { name: "public", url: TEST_SOURCE_URL, enabled: true },
        { name: "acme-corp", url: "github:acme-corp/claude-skills", enabled: true },
      ],
      localSkillCount: 3,
      pluginSkillCount: 1,
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("rendering", () => {
    it("should render configured marketplaces header", async () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);
      const output = lastFrame();
      // ViewTitle removed; verify content renders (title shown by wizard-layout)
      expect(output).toContain("Configured marketplaces:");
    });

    it("should render configured sources", async () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);
      const output = lastFrame();
      expect(output).toContain("Public");
      expect(output).toContain("acme-corp");
    });

    it("should show default label for public source", async () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);
      const output = lastFrame();
      expect(output).toContain("(default)");
    });

    it("should show source URLs", async () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);
      const output = lastFrame();
      expect(output).toContain("github:agents-inc/skills");
      expect(output).toContain("github:acme-corp/claude-skills");
    });

    it("should show local skill count", async () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);
      const output = lastFrame();
      expect(output).toContain("3");
      expect(output).toContain(".claude/skills/");
    });

    it("should show plugin count", async () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);
      const output = lastFrame();
      expect(output).toContain("1");
      expect(output).toContain("installed plugins");
    });

    it("should show add source input area", async () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);
      const output = lastFrame();
      expect(output).toContain("Add source");
    });

    it("should show loading state initially", () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Loading sources...");
    });
  });

  describe("keyboard navigation", () => {
    it("should navigate down with arrow down", async () => {
      const { lastFrame, stdin, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      // Move focus down
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      // The second source (acme-corp) should now be focused
      expect(output).toContain("acme-corp");
    });

    it("should navigate up with arrow up", async () => {
      const { lastFrame, stdin, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      // Move down then up
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("Public");
    });

    it("should not navigate above first item", async () => {
      const { lastFrame, stdin, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      // Try to move up from first item
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("Public");
    });
  });

  describe("escape to close", () => {
    it("should call onClose when Escape is pressed", async () => {
      const onClose = vi.fn();
      const { stdin, unmount } = renderStepSettings({ onClose });
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("add source input mode", () => {
    it("should enter add source mode on 'a' key", async () => {
      const { lastFrame, stdin, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      stdin.write("a");
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      // Should show cursor block character indicating input mode
      expect(output).toContain("\u2588");
    });

    it("should exit add source mode on Escape", async () => {
      const onClose = vi.fn();
      const { lastFrame, stdin, unmount } = renderStepSettings({ onClose });
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      // Enter add mode
      stdin.write("a");
      await delay(INPUT_DELAY_MS);

      // Escape from add mode (should NOT close settings)
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onClose).not.toHaveBeenCalled();

      const output = lastFrame();
      // Should still show the settings view (ViewTitle removed, check content)
      expect(output).toContain("Configured marketplaces:");
    });

    it("should show hint text for add mode", async () => {
      const { lastFrame, stdin, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      stdin.write("a");
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("ENTER submit");
      expect(output).toContain("ESC cancel");
    });

    it("should show hint text for normal mode", async () => {
      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      const output = lastFrame();
      expect(output).toContain("DEL remove");
      expect(output).toContain("close");
    });
  });

  describe("edge cases", () => {
    it("should handle empty sources list gracefully", async () => {
      const { getSourceSummary } = await import("../../lib/configuration/source-manager.js");
      vi.mocked(getSourceSummary).mockResolvedValue({
        sources: [{ name: "public", url: TEST_SOURCE_URL, enabled: true }],
        localSkillCount: 0,
        pluginSkillCount: 0,
      });

      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      const output = lastFrame();
      expect(output).toContain("Public");
      expect(output).toContain("0");
    });

    it("should handle getSourceSummary failure gracefully", async () => {
      const { getSourceSummary } = await import("../../lib/configuration/source-manager.js");
      vi.mocked(getSourceSummary).mockRejectedValue(new Error("Config read failed"));

      const { lastFrame, unmount } = renderStepSettings();
      cleanup = unmount;

      await delay(LOADING_SETTLE_MS);

      const output = lastFrame();
      // Should show fallback with default source
      expect(output).toContain("Public");
    });
  });
});
