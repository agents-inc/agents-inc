import os from "os";
import path from "path";
import { mkdir, realpath, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mutateGlobal } from "../index.js";
import { consequenceTier } from "../classify.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { renderConfigTs } from "../../__tests__/content-generators.js";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts.js";
import type { GateDeps } from "../index.js";

/**
 * The two ways `mutateGlobal` decides it has nothing to do — no global config to
 * mutate at all, and a mutation whose transform is a no-op — and the report each
 * one hands back.
 *
 * The report matters beyond the files it did not write: `changes` is the caller's
 * only account of what moved, so a no-op must classify to T4. It once did not.
 * The "nothing happened" change set was built by diffing an absent config against
 * a synthetic `{ name: "", skills: [], agents: [] }`, and `name: ""` against an
 * absent name is a scalar change — so every no-op reported `scalarsChanged:
 * ["name"]` and classified as T2, the tier that propagates the config half to
 * every registered project. No caller branched on the tier, so nothing lied to a
 * user; the first one to branch on it would have inherited the phantom.
 *
 * Both projects are real directories: `deregister-project` normalizes its
 * argument through `realpathSync`, which throws on a path that does not exist.
 */
describe("mutateGlobal — a mutation that moves nothing", () => {
  let tempHome: string;
  let registeredProject: string;
  let unregisteredProject: string;
  let deps: GateDeps;

  beforeEach(async () => {
    tempHome = await createTempDir("cc-mutate-global-noop-");
    registeredProject = await makeDir(path.join(tempHome, "registered"));
    unregisteredProject = await makeDir(path.join(tempHome, "unregistered"));
    // `mutateGlobal` resolves the global config through `os.homedir()`, so the temp home has
    // to be what that call returns. The spy says so directly; `vi.stubEnv("HOME", ...)` would
    // reach it too, since `os.homedir()` reads `$HOME` on POSIX.
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    deps = { loadMatrix: vi.fn(), loadAgents: vi.fn() };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(tempHome);
  });

  /** A directory, named by the same normalization the registrar applies. */
  async function makeDir(dir: string): Promise<string> {
    await mkdir(dir, { recursive: true });
    return realpath(dir);
  }

  async function writeGlobalConfig(config: Record<string, unknown>): Promise<void> {
    await mkdir(path.join(tempHome, CLAUDE_SRC_DIR), { recursive: true });
    await writeFile(
      path.join(tempHome, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
      renderConfigTs(config),
    );
  }

  it("reports T4 and no write when there is no global config to mutate", async () => {
    const report = await mutateGlobal(
      { kind: "deregister-project", projectDir: unregisteredProject },
      deps,
    );

    expect(report.changes.scalarsChanged).toStrictEqual([]);
    expect(consequenceTier(report.changes)).toBe("T4");
    expect(report.globalWritten).toBe(false);
  });

  it("reports T4 and no write when deregistering a path that was never registered", async () => {
    await writeGlobalConfig({
      name: "global",
      skills: [],
      agents: [],
      projects: [registeredProject],
    });

    const report = await mutateGlobal(
      { kind: "deregister-project", projectDir: unregisteredProject },
      deps,
    );

    expect(report.changes.scalarsChanged).toStrictEqual([]);
    expect(consequenceTier(report.changes)).toBe("T4");
    expect(report.globalWritten).toBe(false);
  });
});
