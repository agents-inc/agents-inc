// Must mirror every export of utils/fs.ts: a missing one is `undefined` inside the code under test.
import { vi } from "vitest";

// Real: a mocked path predicate would invert every boundary check under test.
export { isPathWithin } from "../fs";

export const readFile = vi.fn();
export const readFileSafe = vi.fn();
export const readFileOptional = vi.fn();
export const writeFile = vi.fn();
export const ensureDir = vi.fn();
export const remove = vi.fn();
export const copy = vi.fn();
export const glob = vi.fn();
export const fileExists = vi.fn();
export const directoryExists = vi.fn();
export const listDirectories = vi.fn();
export const isDirectoryEmpty = vi.fn();
export const removeDirIfEmpty = vi.fn();
