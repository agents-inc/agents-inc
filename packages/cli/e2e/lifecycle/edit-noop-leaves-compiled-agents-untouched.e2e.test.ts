import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finishWizard } from "../fixtures/dual-scope-helpers.js";
import { E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";

/**
 * An edit the user changes nothing in must write nothing.
 *
 * This is the positive statement of a behaviour five specs used to depend on the OPPOSITE of.
 * `edit` hydrated its agent roster from a field most configs did not carry, fell back to the
 * wizard's default roster, and `detectConfigChanges` then found a diff nobody made — so a
 * passthrough rewrote config.ts and recompiled every agent. The specs riding on that phantom
 * write asserted `toHaveCompiledAgents()` and a substring of the emitted config, which held only
 * because a write had happened. Retargeting them at their real subjects removed the last
 * assertion touching this behaviour and left it stated nowhere.
 *
 * Both halves are needed and neither is sufficient:
 *
 *   - "No changes made." proves the run REACHED the decision. Without it a run that crashed
 *     before writing satisfies every unchanged-state assertion below for free.
 *   - The unchanged state proves the decision was ACTED ON. `readTreeSnapshot` carries each
 *     file's mtime beside its content, which is what separates "not rewritten" from "rewritten
 *     identically" — a recompile of an unchanged config produces the same bytes, so content
 *     alone cannot see it, and it is invisible in a diff while being plainly a write.
 *
 * From scratch: the install is a real `init` through the PTY, so what the edit passes through is
 * a tree the CLI wrote, not one a fixture described.
 */

/** Where the generated config lives, relative to the installed scope. */
const CONFIG_SOURCES = DIRS.CLAUDE_SRC;

/** What a compiled sub-agent is called on disk: its name, and this. */
const COMPILED_AGENT_SUFFIX = ".md";

describe("an edit that changes nothing leaves the installed scope untouched", () => {
  let globalHome: string;

  let compiledBefore: Record<string, TreeSnapshotEntry>;
  let compiledAfter: Record<string, TreeSnapshotEntry>;
  let configBefore: Record<string, TreeSnapshotEntry>;
  let configAfter: Record<string, TreeSnapshotEntry>;
  let editExitCode: number;
  let editOutput: string;

  beforeAll(async () => {
    globalHome = await createTempDir();

    // Phase A — a real install, so the artefacts the edit must leave alone are the CLI's own.
    const installWizard = await InitWizard.launchInGlobal({
      projectDir: globalHome,
      ...TERMINAL_SIZE.TALL,
    });
    const install = await finishWizard(await completeWithLocalSources(installWizard));
    expect(install.exitCode, `the install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

    compiledBefore = await readTreeSnapshot(agentsPath(globalHome));
    configBefore = await readTreeSnapshot(path.join(globalHome, CONFIG_SOURCES));

    // Phase B — the same wizard, walked end to end with no key that selects, deselects or
    // rescopes anything: Build through every domain, Sources untouched, Agents on defaults.
    const editWizard = await EditWizard.launchInGlobal({
      projectDir: globalHome,
      source: E2E_SOURCE,
      ...TERMINAL_SIZE.TALL,
    });
    try {
      const sources = await editWizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const edit = await finishWizard(await confirm.confirm());
      editExitCode = edit.exitCode;
      editOutput = edit.output;
    } catch (error) {
      await editWizard.destroy();
      throw error;
    }

    compiledAfter = await readTreeSnapshot(agentsPath(globalHome));
    configAfter = await readTreeSnapshot(path.join(globalHome, CONFIG_SOURCES));
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (globalHome) await cleanupTempDir(globalHome);
  });

  // The subject guard for both comparisons below. `readTreeSnapshot` answers `{}` for an absent
  // directory, so an install that compiled nothing — or a scope read at the wrong path — would
  // satisfy "unchanged" on both sides while comparing nothing at all. Named rather than counted,
  // and off the stack object: the roster the edit must leave alone is the one the stack declares.
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

  // Proof of execution. The report is the only observable saying the run got as far as comparing
  // the wizard's result against the config — a crash on the way there leaves the same clean tree.
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
