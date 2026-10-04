/**
 * The runtime tripwire on the global config pair, held against every provider rather than one.
 *
 * Every write in the CLI funnels through `utils/fs.writeFile`, which resolves its target and
 * refuses the two halves of the GLOBAL pair unless the caller holds the config gate's token.
 * `isGlobalPairPath` is what it asks.
 *
 * A global pair can sit in `~/.agents-inc/<provider>/` for each provider. A guard that knows one
 * of them lets the others through with nothing failing anywhere, which is the quietest way a
 * config-gate ruling can stop being true — the gate's static layers (module privacy, the lint bans, the source scanner) are
 * all satisfied by a write that simply lands somewhere they were not told about.
 *
 * Both directions are pinned in this file on purpose. A refusal on its own cannot tell a
 * correctly-scoped guard from one that has swallowed its whole domain: the `withGateToken` specs
 * are what say the gate can still write its own pair, and the unrelated-file spec is what says
 * the folder itself is not off limits.
 *
 * `vi.importActual` on purpose: `src/cli/utils/__mocks__/fs.ts` replaces `writeFile` with a
 * `vi.fn()`, and a spec asserting on the guard while holding the mock asserts on nothing.
 */

import os from "os";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STANDARD_FILES } from "../../consts.js";
import { withGateToken } from "../config-gate/gate-token.js";
import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";

/** The sentence the write primitive refuses with. Its wording is the user-facing half. */
const REFUSAL = "may only be written through config-gate";

/**
 * Every folder a GLOBAL config pair can sit in, paired with each half of the pair.
 *
 * Written out as a roster rather than assembled from a provider list, so a provider added to the
 * product without a row here reads as a missing row rather than as a loop that grew on its own.
 */
const GLOBAL_PAIR_LOCATIONS = [
  { label: "the claude folder", segments: [".agents-inc", "claude"] },
  { label: "the codex folder", segments: [".agents-inc", "codex"] },
] as const;

const PAIR_HALVES = [
  { label: "the config half", file: STANDARD_FILES.CONFIG_TS },
  { label: "the types half", file: STANDARD_FILES.CONFIG_TYPES_TS },
] as const;

const PAIR_PATHS = GLOBAL_PAIR_LOCATIONS.flatMap((location) =>
  PAIR_HALVES.map((half) => ({
    label: `${half.label} in ${location.label}`,
    segments: [...location.segments, half.file],
  })),
);

describe("the write primitive refuses a global config pair wherever it lives", () => {
  let tempHome: string;
  let realWriteFile: (filePath: string, content: string) => Promise<void>;

  beforeEach(async () => {
    tempHome = await createTempDir("cc-provider-pair-tripwire-");
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    ({ writeFile: realWriteFile } =
      await vi.importActual<typeof import("../../utils/fs.js")>("../../utils/fs.js"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(tempHome);
  });

  it.each(PAIR_PATHS)("throws on $label when no token is held", async ({ segments }) => {
    await expect(realWriteFile(path.join(tempHome, ...segments), "rogue")).rejects.toThrow(REFUSAL);
  });

  it.each(PAIR_PATHS)("writes $label inside withGateToken", async ({ segments }) => {
    const pairPath = path.join(tempHome, ...segments);

    await withGateToken(async () => {
      await realWriteFile(pairPath, "gated");
    });

    expect(await readFile(pairPath, "utf-8")).toBe("gated");
  });

  it("leaves every other file in a provider folder alone", async () => {
    const unrelated = path.join(tempHome, ".agents-inc", "claude", "notes.md");
    await mkdir(path.dirname(unrelated), { recursive: true });

    await realWriteFile(unrelated, "fine");

    expect(
      await readFile(unrelated, "utf-8"),
      "the guard names two files, not a directory — widening it to the folder would refuse a project's own notes",
    ).toBe("fine");
  });

  it("leaves a project's own config pair alone", async () => {
    const projectPair = path.join(
      tempHome,
      "project",
      ".agents-inc",
      "claude",
      STANDARD_FILES.CONFIG_TS,
    );

    await realWriteFile(projectPair, "project");

    expect(
      await readFile(projectPair, "utf-8"),
      "the tripwire is the GLOBAL pair's, and a project below the home root is not it",
    ).toBe("project");
  });
});
