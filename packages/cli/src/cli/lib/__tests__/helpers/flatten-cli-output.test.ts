import { mkdir, symlink } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLAUDE_DIR } from "../../../consts.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils.js";
import {
  compactCliOutput,
  compactedWithoutTempFolder,
  flattenCliOutput,
} from "./flatten-cli-output.js";

describe("flattenCliOutput", () => {
  it("rejoins a sentence oclif wrapped across lines", () => {
    const wrapped = " ›   Error: Local marketplace not found:\n ›   /tmp/nope\n";

    expect(flattenCliOutput(wrapped)).toBe("Error: Local marketplace not found: /tmp/nope");
  });

  it("leaves a sentence that was never wrapped alone", () => {
    expect(flattenCliOutput("already one line")).toBe("already one line");
  });

  it("collapses runs of whitespace to one space rather than removing them", () => {
    expect(flattenCliOutput("two    words\t\tapart")).toBe("two words apart");
  });

  it("answers empty for output that is only wrapping", () => {
    expect(flattenCliOutput(" ›   \n ›   ")).toBe("");
  });
});

describe("compactCliOutput", () => {
  const BROKEN_PATH =
    " ›   Error: config at '/tmp/a-very-long-temp-dir-0123\n ›   456789/config.ts' failed\n";
  const WHOLE_PATH = "config at '/tmp/a-very-long-temp-dir-0123456789/config.ts' failed";

  it("finds a sentence whose path oclif broke mid-word, where the flattened form cannot", () => {
    expect(flattenCliOutput(BROKEN_PATH)).not.toContain(WHOLE_PATH);
    expect(compactCliOutput(BROKEN_PATH)).toContain(compactCliOutput(WHOLE_PATH));
  });

  it("removes every space, so the text it is compared with must go through it too", () => {
    expect(compactCliOutput("two    words\tapart")).toBe("twowordsapart");
  });
});

describe("compactedWithoutTempFolder", () => {
  let base: string;
  let realTemp: string;
  let linkedTemp: string;

  beforeEach(async () => {
    base = await createTempDir();
    realTemp = path.join(base, CLAUDE_DIR, "tmp-real");
    linkedTemp = path.join(base, CLAUDE_DIR, "tmp-link");
    await mkdir(realTemp, { recursive: true });
    await symlink(realTemp, linkedTemp);
    vi.stubEnv("TMPDIR", linkedTemp);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(base);
  });

  it("leaves out the temp folder spelled through its link", () => {
    expect(compactedWithoutTempFolder(`wrote ${linkedTemp}/home/AGENTS.md`)).toBe(
      "wrote<tmp>/home/AGENTS.md",
    );
  });

  it("leaves out the temp folder spelled as its real path", () => {
    expect(compactedWithoutTempFolder(`wrote ${realTemp}/home/AGENTS.md`)).toBe(
      "wrote<tmp>/home/AGENTS.md",
    );
  });

  it("leaves out the temp folder when oclif broke it across lines", () => {
    const middle = Math.floor(realTemp.length / 2);
    const broken = `wrote ${realTemp.slice(0, middle)}\n ›   ${realTemp.slice(middle)}/home/AGENTS.md`;

    expect(compactedWithoutTempFolder(broken)).toBe("wrote<tmp>/home/AGENTS.md");
  });

  it("keeps a Claude folder the output names below the temp folder", () => {
    expect(compactedWithoutTempFolder(`wrote ${realTemp}/project/${CLAUDE_DIR}/skills`)).toBe(
      `wrote<tmp>/project/${CLAUDE_DIR}/skills`,
    );
  });
});
