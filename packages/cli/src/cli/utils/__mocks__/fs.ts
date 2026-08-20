// Auto-mock for src/cli/utils/fs.ts.
// All functions return undefined by default; configure with vi.mocked() in beforeEach.
// It mirrors the module's full export list, and has to: `vi.mock("../../utils/fs")` replaces the
// WHOLE module, so an export this file leaves out arrives at the call site as `undefined` and the
// TypeError is raised inside the code under test, where it reads as a product defect.
// `readFileSafe` and `isDirectoryEmpty` were both missing until the parity spec measured it.
import { vi } from "vitest";

// Real implementation — pure lexical path predicate; mocking it to undefined
// would silently invert every boundary check in consumers under test.
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
