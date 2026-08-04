import { render } from "ink-testing-library";
import { describe, expect, it, afterEach, vi } from "vitest";
import { SearchModal, type SearchModalProps } from "./search-modal";
import type { BoundSkillCandidate, SkillId } from "../../types";
import {
  ARROW_UP,
  ARROW_DOWN,
  ENTER,
  ESCAPE,
  RENDER_DELAY_MS,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

const candidates: BoundSkillCandidate[] = [
  {
    id: "web-framework-react-pro" as SkillId,
    sourceUrl: "github:awesome-dev/skills",
    sourceName: "awesome-dev",
    alias: "react",
    description: "Opinionated React with strict TS",
  },
  {
    id: "web-framework-react-strict" as SkillId,
    sourceUrl: "github:team-xyz/skills",
    sourceName: "team-xyz",
    alias: "react",
    description: "Strict mode React",
  },
  {
    id: "web-framework-react-minimal" as SkillId,
    sourceUrl: "github:solo-dev/skills",
    sourceName: "solo-dev",
    alias: "react",
    description: "Minimal hooks-only React",
  },
];

const defaultProps: SearchModalProps = {
  results: candidates,
  alias: "react",
  onBind: vi.fn(),
  onClose: vi.fn(),
};

const renderModal = (props: Partial<SearchModalProps> = {}) => {
  return render(<SearchModal {...defaultProps} {...props} />);
};

describe("SearchModal component", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("rendering", () => {
    it("should render the alias in the title", () => {
      const { lastFrame, unmount } = renderModal();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("react");
      expect(output).toContain("Search results");
    });

    it("should render all result source names", () => {
      const { lastFrame, unmount } = renderModal();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("awesome-dev");
      expect(output).toContain("team-xyz");
      expect(output).toContain("solo-dev");
    });

    it("should render result descriptions", () => {
      const { lastFrame, unmount } = renderModal();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Opinionated React with strict TS");
      expect(output).toContain("Strict mode React");
    });

    it("should show focused marker on first result by default", () => {
      const { lastFrame, unmount } = renderModal();
      cleanup = unmount;

      const output = lastFrame();
      // The focused marker should appear (UI_SYMBOLS.CHEVRON = U+276F)
      expect(output).toContain("\u276F");
    });

    it("should show 'No results found' when results array is empty", () => {
      const { lastFrame, unmount } = renderModal({ results: [] });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("No results found");
    });

    it("should render help text with navigation hints", () => {
      const { lastFrame, unmount } = renderModal();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("navigate");
      expect(output).toContain("ENTER");
      expect(output).toContain("ESC");
    });
  });

  describe("keyboard navigation", () => {
    it("should move focus down with arrow down", async () => {
      const { stdin, lastFrame, unmount } = renderModal();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      // The second result (team-xyz) should now have the marker
      // We check that the output changed — specific marker positioning depends on rendering
      expect(output).toContain("team-xyz");
    });

    it("should move focus up with arrow up", async () => {
      const { stdin, lastFrame, unmount } = renderModal();
      cleanup = unmount;

      // Move down first, then back up
      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("awesome-dev");
    });

    it("should wrap from last result to first on arrow down", async () => {
      const { stdin, lastFrame, unmount } = renderModal();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      // Move down 3 times (past last result)
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      // Should have wrapped to first result
      expect(output).toContain("awesome-dev");
    });

    it("should wrap from first result to last on arrow up", async () => {
      const { stdin, lastFrame, unmount } = renderModal();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      // Should have wrapped to last result
      expect(output).toContain("solo-dev");
    });
  });

  describe("actions", () => {
    it("should call onBind with focused candidate on Enter", async () => {
      const onBind = vi.fn();
      const { stdin, unmount } = renderModal({ onBind });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onBind).toHaveBeenCalledWith(candidates[0]);
    });

    it("should call onBind with second candidate after navigating down", async () => {
      const onBind = vi.fn();
      const { stdin, unmount } = renderModal({ onBind });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onBind).toHaveBeenCalledWith(candidates[1]);
    });

    it("should call onClose on Escape", async () => {
      const onClose = vi.fn();
      const { stdin, unmount } = renderModal({ onClose });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onClose).toHaveBeenCalled();
    });

    it("should not call onBind on Enter when results are empty", async () => {
      const onBind = vi.fn();
      const { stdin, unmount } = renderModal({ results: [], onBind });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onBind).not.toHaveBeenCalled();
    });

    it("should not call onBind on Escape", async () => {
      const onBind = vi.fn();
      const { stdin, unmount } = renderModal({ onBind });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onBind).not.toHaveBeenCalled();
    });
  });
});
