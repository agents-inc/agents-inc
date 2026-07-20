import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

type ConsoleMethod = "log" | "warn" | "error" | "info" | "debug";

const DEFAULT_METHODS: ConsoleMethod[] = ["log", "warn", "error"];

/**
 * Registers a `beforeEach` that replaces the given console methods (default
 * log/warn/error) with no-op spies, and an `afterEach` that restores them via
 * `mockRestore`. Returns a live record of the spies so a test can assert on
 * the captured calls (e.g. `spies.log`). Only the requested `methods` get an
 * entry — the rest stay `undefined`.
 *
 * Call once at the top of a describe block. Only restores the console spies it
 * created — unlike `vi.restoreAllMocks()`, it leaves unrelated spies untouched.
 */
export function silenceConsole(
  methods: ConsoleMethod[] = DEFAULT_METHODS,
): Partial<Record<ConsoleMethod, MockInstance>> {
  const spies: Partial<Record<ConsoleMethod, MockInstance>> = {};

  beforeEach(() => {
    for (const method of methods) {
      spies[method] = vi.spyOn(console, method).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    for (const method of methods) {
      spies[method]?.mockRestore();
    }
  });

  return spies;
}
