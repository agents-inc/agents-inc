import path from "path";
import type { Config } from "@oclif/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initHook from "./init";
import type { ConfigWithSource } from "../base-command";
import { DEFAULT_SOURCE } from "../lib/configuration/config";
import { createTempDir, cleanupTempDir } from "../lib/__tests__/test-fs-utils";

/**
 * The init hook resolves the marketplace BEFORE oclif has parsed anything, so it reads raw
 * argv rather than a flag record. That scan is the only place the flag's spelling is written
 * a second time — oclif's own definition is the first — and the two are not checked against
 * each other by anything at build time.
 *
 * Every spelling below is a LITERAL. Importing the flag name from the command would move both
 * sides of the assertion at once and pin nothing.
 */
const MARKETPLACE_FLAG = "--marketplace";
const MARKETPLACE_FLAG_SHORT = "-m";
/** The withdrawn spellings. Pre-1.0 aliases nothing, so the scan must not answer to them. */
const WITHDRAWN_FLAG = "--source";
const WITHDRAWN_FLAG_SHORT = "-s";

/** oclif's id for the one command that may name a marketplace. */
const INIT_COMMAND_ID = "init";
/** Any other command — it asks as `"stored"` and gets what the install recorded. */
const STORED_CALLER_COMMAND_ID = "compile";

const NAMED_MARKETPLACE = "github:named/skills";

type InitHookOptions = Parameters<typeof initHook>[0];

/**
 * The two framework values the hook is handed and never reads on the path under test: the
 * `Hook.Context` receiver, whose only user is the `id === undefined` dashboard branch, and
 * the `context` field beside the options. Neither is constructible outside oclif, and
 * standing an empty object in for them is why they are declared as `object` first — the
 * assertion is on a binding rather than on a literal.
 */
const UNREAD_BY_THE_HOOK: object = {};

/**
 * Boundary cast, the same one `src/cli/hooks/init.ts` makes in the other direction: oclif's
 * `Config` is a class rather than an augmentable interface, and the hook's only write to it
 * is the `sourceConfig` field `BaseCommand` reads back.
 */
const runHookFor = async (id: string, argv: string[]): Promise<ConfigWithSource> => {
  const config: ConfigWithSource = {};
  const options: InitHookOptions = {
    id,
    argv,
    config: config as unknown as Config,
    context: UNREAD_BY_THE_HOOK as InitHookOptions["context"],
  };
  await initHook.call(UNREAD_BY_THE_HOOK as ThisParameterType<typeof initHook>, options);
  return config;
};

describe("init hook marketplace scan", () => {
  let tempDir: string;
  let savedHome: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-init-hook-");
    // A project with no config of its own, and a HOME with none either, so the default is
    // what every rung below the flag resolves to.
    savedHome = process.env.HOME ?? "";
    process.env.HOME = path.join(tempDir, "home");
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env.HOME = savedHome;
    await cleanupTempDir(tempDir);
  });

  it("should read the marketplace named as a separate argument", async () => {
    const config = await runHookFor(INIT_COMMAND_ID, [MARKETPLACE_FLAG, NAMED_MARKETPLACE]);

    expect(config.sourceConfig?.source).toBe(NAMED_MARKETPLACE);
    expect(config.sourceConfig?.sourceOrigin).toBe("flag");
  });

  it("should read the marketplace named with an equals sign", async () => {
    const config = await runHookFor(INIT_COMMAND_ID, [`${MARKETPLACE_FLAG}=${NAMED_MARKETPLACE}`]);

    expect(config.sourceConfig?.source).toBe(NAMED_MARKETPLACE);
    expect(config.sourceConfig?.sourceOrigin).toBe("flag");
  });

  it("should read the marketplace named by the short form", async () => {
    const config = await runHookFor(INIT_COMMAND_ID, [MARKETPLACE_FLAG_SHORT, NAMED_MARKETPLACE]);

    expect(config.sourceConfig?.source).toBe(NAMED_MARKETPLACE);
    expect(config.sourceConfig?.sourceOrigin).toBe("flag");
  });

  it("should let the short form win over the long one", async () => {
    const config = await runHookFor(INIT_COMMAND_ID, [
      MARKETPLACE_FLAG,
      "github:long/skills",
      MARKETPLACE_FLAG_SHORT,
      NAMED_MARKETPLACE,
    ]);

    expect(
      config.sourceConfig?.source,
      "the historical mutation-order precedence: the short form is read first",
    ).toBe(NAMED_MARKETPLACE);
  });

  it.each([
    [WITHDRAWN_FLAG, [WITHDRAWN_FLAG, NAMED_MARKETPLACE]],
    [`${WITHDRAWN_FLAG}=`, [`${WITHDRAWN_FLAG}=${NAMED_MARKETPLACE}`]],
    [WITHDRAWN_FLAG_SHORT, [WITHDRAWN_FLAG_SHORT, NAMED_MARKETPLACE]],
  ])("should not answer to the withdrawn %s spelling", async (_name, argv) => {
    const config = await runHookFor(INIT_COMMAND_ID, argv);

    expect(
      config.sourceConfig?.source,
      "the withdrawn spelling is aliased to nothing, so this run named no marketplace",
    ).toBe(DEFAULT_SOURCE);
    expect(config.sourceConfig?.sourceOrigin).toBe("default");
  });

  it("should ignore the flag on a command that only reads the stored marketplace", async () => {
    const config = await runHookFor(STORED_CALLER_COMMAND_ID, [
      MARKETPLACE_FLAG,
      NAMED_MARKETPLACE,
    ]);

    expect(config.sourceConfig?.source).toBe(DEFAULT_SOURCE);
    expect(config.sourceConfig?.sourceOrigin).toBe("default");
  });
});
