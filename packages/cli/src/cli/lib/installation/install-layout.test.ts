/**
 * Which folder an installation is READ from, once `.claude-src/` and
 * `.agents-inc/<provider>/` can both be on disk.
 *
 * R1 of the source-folder rename teaches the CLI to find the new layout and changes nothing
 * else: no folder moves, no new name is written, and every golden file stays byte-identical.
 * So the whole of the step's behaviour is this resolver's preference order, and these specs are
 * that order written out — rung by rung, each with the disk state that reaches it.
 *
 * The order (from `todo/plans/CLI-source-folder-rename-plan.md`, Step R1):
 *   1. `.agents-inc/<provider>/` holding a config.ts
 *   2. `.claude-src/` holding a config.ts — CLAUDE ONLY
 *   3. a non-empty `.agents-inc/<provider>/`
 *   4. `.claude-src/` — claude only
 *   5. otherwise absent, and the new layout is what gets written
 * `both` is true whenever a legacy folder and a new folder both exist.
 *
 * Rungs 1 and 5 answer the SAME folder, and that is the design rather than a hole: the resolver
 * says which directory to read, and whether an installation is there is the caller's own
 * `fileExists` on the config inside it — which is how `loadProjectConfigFromDir` already asks.
 * What tells the two rungs apart is the pair of specs where a config decides the winner:
 * a legacy config.ts beats an empty new folder, and loses to a new folder that holds one.
 *
 * The folder names are literals throughout. They are text on people's disks, and an assertion
 * that imported the constant the product writes would move with it and could never fail.
 */

import path from "path";
import { chmod, mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";
import { getProjectConfigPath } from "./install-base-dir.js";
import { providerInUse, resolveSourceDir, sourceDir } from "./install-layout.js";

/** The new layout, per provider, as it is written on disk and shown to a user. */
const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

/** The name every installation made before the rename still carries. */
const LEGACY_SOURCE_REL = ".claude-src";

/**
 * What the hand gate of a consuming repository keeps under `.agents-inc/`, and therefore the
 * state `providerInUse` must not read as a provider. Taken from the benchmark repository's own gate
 * (`agents-inc/vendor/lint/gate.mjs`), which is where this hazard is real rather than imagined.
 */
const GATE_STATE_FILES = ["baseline.json", "typecheck-baseline.json"] as const;
const GATE_STATE_DIR = "attempts";

describe("resolveSourceDir", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("cc-source-layout-");
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  /** Writes a real config.ts into `folder` under the temp root. */
  async function plantConfig(folder: string): Promise<void> {
    await writeTestTsConfig(root, buildProjectConfig(), folder);
  }

  /** Creates a directory under the temp root, with nothing in it unless a caller adds some. */
  async function plantDir(...segments: readonly string[]): Promise<void> {
    await mkdir(path.join(root, ...segments), { recursive: true });
  }

  describe("rung 1 — the new folder holding a config", () => {
    it("is read when it is the only folder present", async () => {
      await plantConfig(CLAUDE_SOURCE_REL);

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, ".agents-inc", "claude"),
        relName: CLAUDE_SOURCE_REL,
        legacy: false,
        both: false,
      });
    });

    it("beats a legacy folder that also holds one, and reports both", async () => {
      await plantConfig(CLAUDE_SOURCE_REL);
      await plantConfig(LEGACY_SOURCE_REL);

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, ".agents-inc", "claude"),
        relName: CLAUDE_SOURCE_REL,
        legacy: false,
        both: true,
      });
    });
  });

  describe("rung 2 — a legacy folder holding a config", () => {
    it("is read when no new folder is there", async () => {
      await plantConfig(LEGACY_SOURCE_REL);

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, LEGACY_SOURCE_REL),
        relName: LEGACY_SOURCE_REL,
        legacy: true,
        both: false,
      });
    });

    it("beats an empty leftover new folder", async () => {
      await plantConfig(LEGACY_SOURCE_REL);
      await plantDir(".agents-inc", "claude");

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, LEGACY_SOURCE_REL),
        relName: LEGACY_SOURCE_REL,
        legacy: true,
        both: true,
      });
    });

    it("beats a new folder holding content but no config", async () => {
      await plantConfig(LEGACY_SOURCE_REL);
      await plantDir(".agents-inc", "claude", "agents", "my-agent");

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, LEGACY_SOURCE_REL),
        relName: LEGACY_SOURCE_REL,
        legacy: true,
        both: true,
      });
    });

    it("is never reached for a provider other than claude", async () => {
      await plantConfig(LEGACY_SOURCE_REL);

      expect(
        resolveSourceDir(root, "codex"),
        "the old name belonged to one provider, so a codex installation may not be found in it",
      ).toStrictEqual({
        dir: path.join(root, ".agents-inc", "codex"),
        relName: CODEX_SOURCE_REL,
        legacy: false,
        both: false,
      });
    });
  });

  describe("rung 3 — a new folder holding content but no config", () => {
    it("beats a legacy folder that holds no config either", async () => {
      await plantDir(".agents-inc", "claude", "agents", "my-agent");
      await plantDir(LEGACY_SOURCE_REL, "agents", "_templates");

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, ".agents-inc", "claude"),
        relName: CLAUDE_SOURCE_REL,
        legacy: false,
        both: true,
      });
    });
  });

  describe("rung 4 — a legacy folder holding no config", () => {
    it("is read when it holds only ejected templates", async () => {
      await plantDir(LEGACY_SOURCE_REL, "agents", "_templates");

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, LEGACY_SOURCE_REL),
        relName: LEGACY_SOURCE_REL,
        legacy: true,
        both: false,
      });
    });
  });

  describe("rung 5 — neither folder holds anything", () => {
    it("names the new layout when there is no folder at all", async () => {
      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, ".agents-inc", "claude"),
        relName: CLAUDE_SOURCE_REL,
        legacy: false,
        both: false,
      });
    });

    it("names the new layout when the only folder is an empty leftover of it", async () => {
      await plantDir(".agents-inc", "claude");

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, ".agents-inc", "claude"),
        relName: CLAUDE_SOURCE_REL,
        legacy: false,
        both: false,
      });
    });
  });

  describe("gate state under the parent folder", () => {
    /**
     * A repository whose own tooling keeps state in `.agents-inc/` has a parent folder and no
     * provider folder. That is not a new installation and it is not half of a `both` state, and
     * a resolver that read the parent as the folder would take a legacy install's config away
     * from it on the strength of a `baseline.json`.
     */
    it("leaves a legacy installation being read, and reports no both state", async () => {
      await plantConfig(LEGACY_SOURCE_REL);
      await plantDir(".agents-inc", GATE_STATE_DIR);
      for (const file of GATE_STATE_FILES) {
        await writeFile(path.join(root, ".agents-inc", file), "{}");
      }

      expect(resolveSourceDir(root, "claude")).toStrictEqual({
        dir: path.join(root, LEGACY_SOURCE_REL),
        relName: LEGACY_SOURCE_REL,
        legacy: true,
        both: false,
      });
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

/**
 * The same preference order, asked across PROVIDERS instead of across names — which is the whole
 * of "the folder says the provider, so no command needs a flag".
 *
 * `providerAt` answered this question a second way until 2026-09-21, on rungs of its own:
 * `PROVIDERS.filter(provider => directoryExists(sourceDir(root, provider)))`. Two bugs came with
 * that, and both are pinned below rather than described — a bare `mkdir` ranked equal with a live
 * installation, and the legacy folder was invisible, so every pre-rename machine answered "no
 * provider at all". It is gone; `detectInstallations` is what a caller asks when it needs the
 * LIST, and it carries each installation's scope and config path with it.
 *
 * A root whose folder names Codex resolves onto the Codex host, and the Claude arrangements that
 * must keep answering Claude beside it are
 * `__tests__/a-codex-folder-resolves-onto-the-codex-host.test.ts`'s subject.
 */
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

  it("names the provider of a scope still on the folder every pre-rename machine carries", async () => {
    await writeTestTsConfig(root, buildProjectConfig(), LEGACY_SOURCE_REL);

    expect(
      providerInUse(root),
      "a resolver blind to `.claude-src/` answers nothing for every machine that has not moved its folder by hand",
    ).toBe("claude");
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

/**
 * The resolver answers for EVERY directory, and `getProjectConfigPath` is where that matters.
 *
 * It was `path.join(dir, CLAUDE_SRC_DIR, CONFIG_TS)` — pure, disk-free and total by construction.
 * Routing it through {@link resolveSourceDir}'s funnel is what makes a scope on either name work,
 * and it also put three `fs` probes under a function ~30 call sites treat as a path builder: an
 * expression in the middle of a `Promise.all`, a `configDirsInPlay(...).map(...)`, a `throw new
 * GlobalPairWriteViolation(...)`. None of them is inside a `try`, and a path builder is not a
 * thing anyone wraps.
 *
 * **The decision, taken deliberately: it is TOTAL, and the failure surfaces at the read or the
 * write instead.** The alternative — every caller handling the throw — buys nothing: there is no
 * useful answer a caller could give, and the operation it was about to perform on that path fails
 * a line later with an errno naming the actual file. Degrading here and failing there puts one
 * error in front of the user (`EACCES: .../config.ts`) rather than two.
 *
 * Which answer the degrade gives is the half worth pinning, and it is not "absent". A folder that
 * IS on disk and cannot be looked inside stays the folder in use, so the CLI goes on reading and
 * writing where the installation actually is. Answering "absent" would send it to the folder a NEW
 * installation is created in — the half-routed path this whole module exists to prevent — and the
 * assertions below name the directory rather than merely refusing to throw, so that reading
 * reddens them.
 *
 * `chmod 000` is the only way to reach the fault, and root ignores it: the guard states that
 * rather than letting the specs pass for the wrong reason on a container that runs as root.
 */
describe.skipIf(process.getuid?.() === 0)(
  "getProjectConfigPath answers for every directory",
  () => {
    let root: string;
    const locked: string[] = [];

    beforeEach(async () => {
      root = await createTempDir("cc-config-path-total-");
    });

    afterEach(async () => {
      // Unlocked before the tree is removed; a 000 directory cannot be walked by the cleanup either.
      await Promise.all(locked.splice(0).map((dir) => chmod(dir, 0o755)));
      await cleanupTempDir(root);
    });

    /** A real directory this process cannot look inside — the shape a wrong umask leaves. */
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
        // `statSync(..., { throwIfNoEntry: false })` answers undefined for ENOENT AND for ENOTDIR,
        // so this input never threw — it is pinned because it is the input the finding named.
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
