import { afterEach, describe, expect, it, vi } from "vitest";

// The flags read their env overrides at module load, so each case gets a fresh
// module registry and imports the module after arranging the environment —
// importing at the top of the file would freeze every flag before any test ran.
const loadFlags = async () => {
  vi.resetModules();
  const { FEATURE_FLAGS } = await import("./feature-flags.js");
  return FEATURE_FLAGS;
};

describe("FEATURE_FLAGS env overrides", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the defaults when nothing is set", async () => {
    const flags = await loadFlags();

    expect(flags.INFO_PANEL).toBe(true);
    expect(flags.NEW_SKILL_COMMAND).toBe(false);
  });

  it("switches a flag on for '1' and 'true'", async () => {
    vi.stubEnv("AGENTSINC_FLAG_NEW_SKILL_COMMAND", "1");
    vi.stubEnv("AGENTSINC_FLAG_SOURCE_SEARCH", "true");

    const flags = await loadFlags();

    expect(flags.NEW_SKILL_COMMAND).toBe(true);
    expect(flags.SOURCE_SEARCH).toBe(true);
  });

  it("switches a flag off for '0' and 'false', beating a true default", async () => {
    vi.stubEnv("AGENTSINC_FLAG_INFO_PANEL", "0");

    const flags = await loadFlags();

    expect(flags.INFO_PANEL).toBe(false);
  });

  it("falls back to the default on an unrecognised value", async () => {
    vi.stubEnv("AGENTSINC_FLAG_NEW_SKILL_COMMAND", "yes");
    vi.stubEnv("AGENTSINC_FLAG_INFO_PANEL", "");

    const flags = await loadFlags();

    expect(flags.NEW_SKILL_COMMAND).toBe(false);
    expect(flags.INFO_PANEL).toBe(true);
  });
});
