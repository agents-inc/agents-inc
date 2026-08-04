import { describe, it, expect } from "vitest";
import { computeRowScrollTop } from "./use-section-scroll";

describe("computeRowScrollTop", () => {
  describe("focused row within viewport", () => {
    it("should return current scroll top when focused row is visible", () => {
      // Viewport shows rows 0-9 (scrollTop=0, height=10), focus on row 5
      const result = computeRowScrollTop(5, 0, 10);
      expect(result).toBe(0);
    });

    it("should return current scroll top when focused row is at top edge", () => {
      // Viewport shows rows 3-12 (scrollTop=3, height=10), focus on row 3
      const result = computeRowScrollTop(3, 3, 10);
      expect(result).toBe(3);
    });

    it("should return current scroll top when focused row is at bottom edge", () => {
      // Viewport shows rows 2-6 (scrollTop=2, height=5), focus on row 6
      // Row 6 is at position 6, bottom = 7, scrollTop + height = 7 -> visible
      const result = computeRowScrollTop(6, 2, 5);
      expect(result).toBe(2);
    });
  });

  describe("focused row below viewport", () => {
    it("should scroll down to show focused row", () => {
      // Viewport shows rows 0-4 (scrollTop=0, height=5), focus on row 8
      // Need scrollTop = 8 + 1 - 5 = 4
      const result = computeRowScrollTop(8, 0, 5);
      expect(result).toBe(4);
    });

    it("should scroll down by minimum amount", () => {
      // Viewport shows rows 0-4 (scrollTop=0, height=5), focus on row 5
      // Need scrollTop = 5 + 1 - 5 = 1
      const result = computeRowScrollTop(5, 0, 5);
      expect(result).toBe(1);
    });
  });

  describe("focused row above viewport", () => {
    it("should scroll up to show focused row", () => {
      // Viewport shows rows 5-14 (scrollTop=5, height=10), focus on row 2
      const result = computeRowScrollTop(2, 5, 10);
      expect(result).toBe(2);
    });

    it("should scroll up to row 0", () => {
      // Viewport shows rows 3-7 (scrollTop=3, height=5), focus on row 0
      const result = computeRowScrollTop(0, 3, 5);
      expect(result).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle viewport of height 1", () => {
      const result = computeRowScrollTop(3, 0, 1);
      expect(result).toBe(3);
    });

    it("should handle focus on row 0 with scrollTop 0", () => {
      const result = computeRowScrollTop(0, 0, 10);
      expect(result).toBe(0);
    });

    it("should handle sequential navigation down", () => {
      let scrollTop = 0;
      const viewportHeight = 3;

      // Navigate down through rows 0-5
      scrollTop = computeRowScrollTop(0, scrollTop, viewportHeight);
      expect(scrollTop).toBe(0);

      scrollTop = computeRowScrollTop(1, scrollTop, viewportHeight);
      expect(scrollTop).toBe(0);

      scrollTop = computeRowScrollTop(2, scrollTop, viewportHeight);
      expect(scrollTop).toBe(0);

      // Row 3 pushes past viewport
      scrollTop = computeRowScrollTop(3, scrollTop, viewportHeight);
      expect(scrollTop).toBe(1);

      scrollTop = computeRowScrollTop(4, scrollTop, viewportHeight);
      expect(scrollTop).toBe(2);

      scrollTop = computeRowScrollTop(5, scrollTop, viewportHeight);
      expect(scrollTop).toBe(3);
    });

    it("should handle sequential navigation up", () => {
      let scrollTop = 5;
      const viewportHeight = 3;

      // Viewport shows rows 5-7 (scrollTop=5, height=3)
      scrollTop = computeRowScrollTop(7, scrollTop, viewportHeight);
      expect(scrollTop).toBe(5);

      // Row 6 is within viewport (5-7), no change
      scrollTop = computeRowScrollTop(6, scrollTop, viewportHeight);
      expect(scrollTop).toBe(5);

      // Row 5 is at top edge, still visible
      scrollTop = computeRowScrollTop(5, scrollTop, viewportHeight);
      expect(scrollTop).toBe(5);

      // Row 4 is above viewport, scroll up
      scrollTop = computeRowScrollTop(4, scrollTop, viewportHeight);
      expect(scrollTop).toBe(4);

      scrollTop = computeRowScrollTop(3, scrollTop, viewportHeight);
      expect(scrollTop).toBe(3);

      scrollTop = computeRowScrollTop(2, scrollTop, viewportHeight);
      expect(scrollTop).toBe(2);
    });
  });
});
