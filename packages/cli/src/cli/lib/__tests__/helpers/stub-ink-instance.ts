import type { Instance } from "ink";
import { vi } from "vitest";

/** Typed as the full `Instance` so a mocked `render` can't fall behind Ink's API. */
export function stubInkInstance(): Instance {
  return {
    rerender: vi.fn(),
    unmount: vi.fn(),
    waitUntilExit: () => Promise.resolve(),
    waitUntilRenderFlush: () => Promise.resolve(),
    cleanup: vi.fn(),
    clear: vi.fn(),
  };
}
