import type { Instance } from "ink";
import { vi } from "vitest";

/**
 * What a mocked Ink `render` hands back: every member of Ink's `Instance`, each settling at once.
 *
 * Typed as `Instance` so a stub cannot fall behind the product. The literals this replaced carried
 * only the three members the commands used when they were written, so when the spinner's
 * take-down began calling `rerender` and `waitUntilRenderFlush`, every spec mocking `render`
 * failed on a TypeError from inside a `finally` — the stub's gap, not the product's.
 */
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
