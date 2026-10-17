import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

type ConsoleMethod = "log" | "warn" | "error" | "info" | "debug";

const DEFAULT_METHODS: ConsoleMethod[] = ["log", "warn", "error"];

/** No-op spies per test; restores only its own spies, unlike `vi.restoreAllMocks()`. */
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
