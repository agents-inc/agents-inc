// Auto-mock for src/cli/utils/logger.ts.
// It mirrors the module's full export list, and has to: a spy this file leaves out arrives at the
// call site as `undefined`, so the TypeError is raised inside the code under test and reads as a
// product defect. `drainBuffer` returns an array by default for the same reason — a `vi.fn()`
// answering `undefined` swaps one crash for another one line later.
//
// Each spy is typed against the function it stands in for, so a function renamed or removed in
// logger.ts fails `tsc` here rather than leaving a spy that stands in for nothing, and the default
// implementation below is held to the real signature. A function ADDED there is not caught this
// way — mirroring it is still this file's job.
import { vi } from "vitest";
import type * as logger from "../logger";

export const verbose = vi.fn<typeof logger.verbose>();
export const warn = vi.fn<typeof logger.warn>();
export const warnOnce = vi.fn<typeof logger.warnOnce>();
export const log = vi.fn<typeof logger.log>();
export const setVerbose = vi.fn<typeof logger.setVerbose>();
export const enableBuffering = vi.fn<typeof logger.enableBuffering>();
export const drainBuffer = vi.fn<typeof logger.drainBuffer>(() => []);
export const disableBuffering = vi.fn<typeof logger.disableBuffering>();
