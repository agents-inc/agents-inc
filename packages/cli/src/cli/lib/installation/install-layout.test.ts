// Folder names are literals: an assertion importing the product's constant could never fail.

import path from "path";
import { chmod, mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";
import { getProjectConfigPath } from "./install-base-dir.js";
import { providerInUse, sourceDir, sourceFolderInUse } from "./install-layout.js";

const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

// A consuming repository's own gate state under `.agents-inc/`, which is not a provider.
const GATE_STATE_FILES = ["baseline.json", "typecheck-baseline.json"] as const;
const GATE_STATE_DIR = "attempts";

describe("sourceFolderInUse", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("cc-source-layout-");
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  it("names the provider's folder when it holds a config", async () => {
    await writeTestTsConfig(root, buildProjectConfig(), CLAUDE_SOURCE_REL);

    expect(sourceFolderInUse(root, "claude")).toStrictEqual({
      dir: path.join(root, ".agents-inc", "claude"),
      relName: CLAUDE_SOURCE_REL,
    });
  });

  it("names the provider's folder when nothing is on disk at all", () => {
    expect(sourceFolderInUse(root, "codex")).toStrictEqual({
      dir: path.join(root, ".agents-inc", "codex"),
      relName: CODEX_SOURCE_REL,
    });
  });
});

describe("sourceDir", () => {
  it("joins each provider's folder under one root", () => {
    const root = path.join(path.sep, "somewhere", "project");

    expect({
      claude: sourceDir(root, "claude"),
      codex: sourceDir(root, "codex"),
    }).toStrictEqual({
      claude: path.join(root, ".agents-inc", "claude"),
      codex: path.join(root, ".agents-inc", "codex"),
    });
  });
});

describe("providerInUse", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("cc-provider-in-use-");
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  it("names the provider whose folder holds a config", async () => {
    await writeTestTsConfig(root, buildProjectConfig(), CLAUDE_SOURCE_REL);

    expect(providerInUse(root)).toBe("claude");
  });

  it("is decided by nothing when a provider folder is merely there and empty", async () => {
    await mkdir(path.join(root, ".agents-inc", "codex"), { recursive: true });

    expect(
      providerInUse(root),
      "an empty folder is on none of the rungs — ranking a bare mkdir with a live installation is what fired the disambiguation on one-provider installs",
    ).toBe("claude");
  });

  it("is decided by nothing when the parent folder holds only another program's state", async () => {
    await mkdir(path.join(root, ".agents-inc", GATE_STATE_DIR), { recursive: true });
    for (const file of GATE_STATE_FILES) {
      await writeFile(path.join(root, ".agents-inc", file), "{}");
    }

    expect(
      providerInUse(root),
      "a subfolder of `.agents-inc/` is a provider only when it is named as one — everything else belongs to whoever put it there",
    ).toBe("claude");
  });

  it("names the provider a new installation is created under for a root with nothing", () => {
    expect(providerInUse(root)).toBe("claude");
  });

  it("names the provider a new installation is created under for a caller with no root", () => {
    expect(
      providerInUse(undefined),
      "the compile engine built over no project has no disk to read and still has to name a folder",
    ).toBe("claude");
  });
});

// Callers use `getProjectConfigPath` as a total path builder outside any `try`. Skipped as root,
// which ignores `chmod 000`.
describe.skipIf(process.getuid?.() === 0)(
  "getProjectConfigPath answers for every directory",
  () => {
    let root: string;
    const locked: string[] = [];

    beforeEach(async () => {
      root = await createTempDir("cc-config-path-total-");
    });

    afterEach(async () => {
      // Unlock first: cleanup cannot walk a 000 directory.
      await Promise.all(locked.splice(0).map((dir) => chmod(dir, 0o755)));
      await cleanupTempDir(root);
    });

    async function lockedDir(...segments: readonly string[]): Promise<string> {
      const dir = path.join(root, ...segments);
      await mkdir(dir, { recursive: true });
      await chmod(dir, 0o000);
      locked.push(dir);
      return dir;
    }

    it("answers for a directory that is not there at all", () => {
      const absent = path.join(root, "never-created");

      expect(getProjectConfigPath(absent, "claude")).toBe(
        path.join(absent, ".agents-inc", "claude", "config.ts"),
      );
    });

    it("keeps naming a source folder it cannot read, rather than throwing on it", async () => {
      const unreadable = await lockedDir(".agents-inc", "claude");

      expect(
        getProjectConfigPath(root, "claude"),
        "a folder that is there and cannot be listed is not a leftover — send the CLI to it and let the read fail with its own errno",
      ).toBe(path.join(unreadable, "config.ts"));
    });

    it("answers for a project directory whose own parent cannot be stat-ed through", async () => {
      const vault = await lockedDir("vault");
      const project = path.join(vault, "project");

      expect(
        getProjectConfigPath(project, "claude"),
        "nothing under an unreadable parent can be probed, so the answer is where a new installation goes — and the write there fails naming this path",
      ).toBe(path.join(project, ".agents-inc", "claude", "config.ts"));
    });
  },
);
