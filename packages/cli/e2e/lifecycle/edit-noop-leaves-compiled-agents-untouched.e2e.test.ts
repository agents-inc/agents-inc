import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  readTreeSnapshot,
  sourceFolderIn,
} from "../helpers/test-utils.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * An edit that changes nothing writes nothing. "No changes made." proves the run reached the
 * decision; the mtime-carrying tree snapshot proves it was acted on, since an identical rewrite
 * is invisible to content alone.
 */

const COMPILED_AGENT_SUFFIX = ".md";

const STACK_AT_HOME_ID = "StackHm4";

describe("an edit that changes nothing leaves the installed scope untouched", () => {
  let store: SeedConfigStore;
  let globalHome: string;

  let compiledBefore: Record<string, TreeSnapshotEntry>;
  let compiledAfter: Record<string, TreeSnapshotEntry>;
  let configBefore: Record<string, TreeSnapshotEntry>;
  let configAfter: Record<string, TreeSnapshotEntry>;
  let editExitCode: number;
  let editOutput: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(STACK_AT_HOME_ID, e2eStackPayload({ scope: "global" }));
    globalHome = await createTempDir();
    await createPermissionsFile(globalHome);

    const install = await runInitFrom(
      store,
      STACK_AT_HOME_ID,
      { dir: globalHome },
      E2E_SOURCE.sourceDir,
    );
    expect(install.exitCode, `the install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

    compiledBefore = await readTreeSnapshot(agentsPath(globalHome));
    configBefore = await readTreeSnapshot(sourceFolderIn(globalHome));

    ({ exitCode: editExitCode, output: editOutput } = await applyEditFrom(store, STACK_AT_HOME_ID, {
      dir: globalHome,
    }));

    compiledAfter = await readTreeSnapshot(agentsPath(globalHome));
    configAfter = await readTreeSnapshot(sourceFolderIn(globalHome));
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (globalHome) await cleanupTempDir(globalHome);
  });

  // Subject guard: `readTreeSnapshot` answers `{}` for an absent directory.
  it("installs compiled agents and a generated config for the edit to leave alone", () => {
    expect(
      Object.keys(compiledBefore).sort(),
      "the install must compile exactly the stack's own sub-agents",
    ).toStrictEqual(E2E_STACK_AGENTS.map((name) => `${name}${COMPILED_AGENT_SUFFIX}`).sort());
    expect(configBefore, "the install generated no config sources").not.toStrictEqual({});
  });

  it("completes the passthrough edit successfully", () => {
    expect(editExitCode, `the passthrough edit must succeed: ${editOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
  });

  // Proof of execution: a crash before the comparison leaves the same clean tree.
  it("reports that it changed nothing", () => {
    expect(editOutput, `a passthrough must reach its decision and say so: ${editOutput}`).toContain(
      STEP_TEXT.EDIT_UNCHANGED,
    );
  });

  it("leaves every compiled agent unwritten, not merely identical", () => {
    expect(
      compiledAfter,
      "a passthrough edit must not recompile — the mtimes are what separate an unwritten file from one rewritten with the same bytes",
    ).toStrictEqual(compiledBefore);
  });

  it("leaves the generated config sources unwritten", () => {
    expect(
      configAfter,
      "a passthrough edit must not rewrite config.ts or regenerate config-types.ts",
    ).toStrictEqual(configBefore);
  });
});
