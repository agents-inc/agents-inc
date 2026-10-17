/**
 * `utils/fs.writeFile` refuses every provider's global config pair without the gate token, and
 * still lets the gate and unrelated files through. `vi.importActual`, because the manual mock
 * replaces `writeFile`.
 */

import os from "os";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STANDARD_FILES } from "../../consts.js";
import { withGateToken } from "../config-gate/gate-token.js";
import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";

const REFUSAL = "may only be written through config-gate";

/** A roster, not built from a provider list, so a new provider shows up as a missing row. */
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
