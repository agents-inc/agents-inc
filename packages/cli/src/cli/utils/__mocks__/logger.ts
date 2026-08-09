// Auto-mock for src/cli/utils/logger.ts.
import { vi } from "vitest";

export const verbose = vi.fn();
export const warn = vi.fn();
export const log = vi.fn();
export const setVerbose = vi.fn();
