// Auto-mock for src/cli/utils/logger.ts.
// It mirrors the module's full export list, and has to: a spy this file leaves out arrives at the
// call site as `undefined`, so the TypeError is raised inside the code under test and reads as a
// product defect. `drainBuffer` returns an array by default for the same reason — a `vi.fn()`
// answering `undefined` swaps one crash for another one line later.
import { vi } from "vitest";
import type { StartupMessage } from "../logger";

export const verbose = vi.fn();
export const warn = vi.fn();
export const log = vi.fn();
export const setVerbose = vi.fn();
export const enableBuffering = vi.fn();
export const drainBuffer = vi.fn((): StartupMessage[] => []);
export const disableBuffering = vi.fn();
export const pushBufferMessage = vi.fn();
