// Must mirror every export of utils/logger.ts: a missing spy is `undefined` inside the code under test.
import { vi } from "vitest";
import type * as logger from "../logger";

export const verbose = vi.fn<typeof logger.verbose>();
export const warn = vi.fn<typeof logger.warn>();
export const warnOnce = vi.fn<typeof logger.warnOnce>();
export const sayingEachWarningOnce = vi.fn<typeof logger.sayingEachWarningOnce>((body) => body());
export const log = vi.fn<typeof logger.log>();
export const setVerbose = vi.fn<typeof logger.setVerbose>();
export const enableBuffering = vi.fn<typeof logger.enableBuffering>();
export const drainBuffer = vi.fn<typeof logger.drainBuffer>(() => []);
export const disableBuffering = vi.fn<typeof logger.disableBuffering>();
