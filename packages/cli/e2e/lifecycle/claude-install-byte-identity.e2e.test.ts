import { realpath } from "fs/promises";
import path from "path";
import { format, resolveConfig } from "prettier";
import { afterEach, describe, expect, it } from "vitest";
import { cliVersion } from "../../src/cli/lib/agents/agent-provenance.js";
import { typedEntries } from "../../src/cli/utils/typed-object.js";
import { CLI } from "../fixtures/cli.js";
import {
  createDualScopeEnv,
  createTestEnvironment,
  initGlobalWithEject,
  runEditWithFirstSkillAction,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { createE2EPluginSource } from "../helpers/create-e2e-plugin-source.js";
import { DIRS, EXIT_CODES, FILES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  CLI_ROOT,
  cleanupTempDir,
  createTempDir,
  fileExists,
  isClaudeCLIAvailable,
  normalizeInstallTree,
  readInstallTree,
  type InstallTree,
} from "../helpers/test-utils.js";

/**
 * Every file a Claude install leaves behind, pinned byte for byte against a golden tree recorded
 * from the product as it stood before the Codex target work began (`todo/plans/CLI-codex-target-plan.md`,
 * Step 0a).
 *
 * **What this is for.** Each later step of that plan claims "no behaviour change for Claude users",
 * and the path-funnel refactor in particular moves every place an install path is spelled. The
 * existing specs each assert what THEY are about; none of them can see a file that moved, appeared
 * or changed by a byte outside its subject. These three journeys read the WHOLE tree — the fake
 * HOME and the project inside it — after each phase and compare it with the golden, so the claim
 * is checked rather than asserted.
 *
 * **A golden records behaviour, not correctness.** Whatever today's product writes is what the
 * golden holds, including anything a later fix is meant to change. A red here says the bytes
 * moved; whether they SHOULD have moved is the reader's call, and a deliberate change is
 * re-recorded on purpose with `-u` over the existing file — see {@link expectGoldenTree}.
 *
 * **What is normalised, and nothing else:** the temp roots, the CLI version inside a compiled
 * agent's `Compiled by` line, the date `eject` stamps into each copied skill's `forkedFrom`, and
 * the ISO instants the Claude CLI's own plugin registry records. `readInstallTree` never reads an
 * mtime. `src/cli/lib/__tests__/helpers/golden-tree.test.ts` pins each rule, and the golden file
 * names the paths it leaves unpinned under `notPinned`.
 *
 * **Watched failing once**, per the mutation rule: in a scratch copy of this package, one byte of
 * `src/agents/_templates/agent.liquid` changed (`Skill tool` to `skill tool` in the
 * skill-activation lead-in) and the copy rebuilt, every journey went red on exactly that byte in
 * each agent it compiled, in every phase, and on nothing else.
 */

/** Where the golden trees live — one JSON file per journey. */
const GOLDEN_TREES_DIR = path.join(CLI_ROOT, "e2e", "fixtures", "claude-golden-trees");

/**
 * What the Claude CLI keeps about its OWN sessions beside a plugin install, relative to the HOME
 * it was handed: a first-start time, a machine id, the Claude version that wrote it, the lock it
 * takes on that record, and timestamped backups of it. Nothing this CLI does can move any of it,
 * and all of it moves with every run or every Claude release, so the plugin journey leaves it out
 * and records that it did. The plugin REGISTRY beside it is pinned: which plugins were installed,
 * at which scope and from where is what this CLI decided.
 */
const CLAUDE_SESSION_STATE = [
  path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_JSON),
  path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_LOCK),
  path.posix.join(DIRS.CLAUDE, DIRS.CLAUDE_BACKUPS),
];

/** One journey's recorded trees: each phase by name, and the paths the journey does not pin. */
type GoldenTree = {
  notPinned: readonly string[];
  phases: Record<string, InstallTree>;
};

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * The whole tree under `root`, normalised against the run that wrote it.
 *
 * `roots` names every machine-specific directory the run was handed; each is written as its
 * placeholder in both of its spellings, because a symlinked temp dir reaches the CLI resolved.
 */
async function installTreeUnder(
  root: string,
  roots: Record<string, string>,
  notPinned: readonly string[] = [],
): Promise<InstallTree> {
  const spellings = await Promise.all(
    typedEntries(roots).map(async ([name, dir]) => [name, await everySpellingOf(dir)] as const),
  );

  return normalizeInstallTree(await readInstallTree(root, { skip: notPinned }), {
    roots: Object.fromEntries(spellings),
    cliVersion: await cliVersion(),
  });
}

/** A directory as it was handed out and as the filesystem resolves it — one entry when they agree. */
async function everySpellingOf(dir: string): Promise<string[]> {
  return [...new Set([dir, await realpath(dir)])];
}

/** The compiled agents a tree holds under one scope directory (`""` for the root itself). */
function compiledAgentFiles(tree: InstallTree, scopeDir: string): string[] {
  const agentsDir = path.posix.join(scopeDir, DIRS.CLAUDE, DIRS.AGENTS);

  return Object.keys(tree.files).filter((file) => path.posix.dirname(file) === agentsDir);
}

/** The file one compiled agent is written to under a scope directory. */
function compiledAgentFile(scopeDir: string, agent: string): string {
  return path.posix.join(scopeDir, DIRS.CLAUDE, DIRS.AGENTS, `${agent}.md`);
}

/**
 * Compares one journey's trees with its golden file.
 *
 * The file must already exist. Vitest writes a missing file snapshot and passes, so a golden that
 * was deleted would otherwise be re-recorded from whatever the product does today — which is the
 * one thing a golden must never do. Re-recording is a deliberate act: `-u` over the existing file.
 *
 * The golden is serialised through this package's own Prettier config, so the file `-u` writes is
 * the one `format:check` accepts; `JSON.stringify` alone expands the short arrays Prettier folds.
 */
async function expectGoldenTree(journey: string, golden: GoldenTree): Promise<void> {
  const goldenPath = path.join(GOLDEN_TREES_DIR, `${journey}.json`);

  expect(
    await fileExists(goldenPath),
    `${goldenPath} is missing — a golden tree is recorded on purpose, never re-created by a run`,
  ).toBe(true);

  const serialised = await format(JSON.stringify(golden), {
    ...(await resolveConfig(goldenPath)),
    filepath: goldenPath,
  });
  await expect(serialised).toMatchFileSnapshot(goldenPath);
}

describe("a Claude install leaves every file byte-identical to its golden tree", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("a global install in eject mode", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    const home = await createTempDir();
    cleanup = () => cleanupTempDir(home);

    const init = await initGlobalWithEject(E2E_SOURCE, home);
    expect(init.exitCode, `global eject init failed: ${init.output}`).toBe(EXIT_CODES.SUCCESS);

    const afterInit = await installTreeUnder(home, { home, source: E2E_SOURCE.sourceDir });

    // Subject guard: the install compiled its agents at global scope. A golden recorded from a
    // run that compiled nothing would otherwise pin the absence and pass on every later run.
    expect(compiledAgentFiles(afterInit, "")).toStrictEqual(
      E2E_AGENTS.WEB_AND_API.map((agent) => compiledAgentFile("", agent)),
    );

    await expectGoldenTree("global-eject", { notPinned: [], phases: { "after init": afterInit } });
  });

  it.skipIf(!claudeAvailable)(
    "a project install in plugin mode, one skill and one agent at project scope",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const source = await createE2EPluginSource();
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      cleanup = () => cleanupTempDir(tempDir);

      const wizard = await InitWizard.launchInProject({
        source,
        projectDir,
        globalHome: fakeHome,
        ...TERMINAL_SIZE.TALL,
      });
      try {
        const domain = await wizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();
        await build.focusSkill(E2E_SKILL.vitest.display);
        await build.toggleScopeOnFocusedSkill();
        await build.advanceDomain();
        await build.advanceDomain();
        const sources = await build.advanceToSources();
        const agents = await sources.acceptDefaults();
        await agents.navigateCursorToAgent(E2E_AGENT["api-developer"].display);
        await agents.toggleScopeOnFocusedAgent();
        const confirm = await agents.advance("init");
        const result = await confirm.confirm();
        expect(await result.exitCode, `plugin init failed: ${result.rawOutput}`).toBe(
          EXIT_CODES.SUCCESS,
        );
        await result.destroy();
      } finally {
        await wizard.destroy();
      }

      const afterInit = await installTreeUnder(
        fakeHome,
        { home: fakeHome, project: projectDir, source: source.sourceDir },
        CLAUDE_SESSION_STATE,
      );

      // Subject guard: the agent the journey moved to project scope was compiled there.
      expect(compiledAgentFiles(afterInit, path.basename(projectDir))).toStrictEqual([
        compiledAgentFile(path.basename(projectDir), E2E_AGENT["api-developer"].name),
      ]);

      await expectGoldenTree("project-plugin", {
        notPinned: CLAUDE_SESSION_STATE,
        phases: { "after init": afterInit },
      });
    },
  );

  it(
    "a dual-scope install, edited into a pair, compiled and uninstalled from the project",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createDualScopeEnv(E2E_SOURCE);
      cleanup = env.destroy;
      const { fakeHome, projectDir } = env;
      const roots = { home: fakeHome, project: projectDir, source: E2E_SOURCE.sourceDir };

      const afterSetup = await installTreeUnder(fakeHome, roots);

      await runEditWithFirstSkillAction(projectDir, fakeHome, E2E_SOURCE, "scope");
      const afterEdit = await installTreeUnder(fakeHome, roots);

      const compiled = await CLI.run(["compile"], { dir: projectDir }, { env: { HOME: fakeHome } });
      expect(compiled.exitCode, `compile failed: ${compiled.output}`).toBe(EXIT_CODES.SUCCESS);
      const afterCompile = await installTreeUnder(fakeHome, roots);

      const uninstalled = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );
      expect(uninstalled.exitCode, `uninstall failed: ${uninstalled.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      const afterUninstall = await installTreeUnder(fakeHome, roots);

      // Subject guard: the setup really was dual-scope — agents compiled at both scopes — so the
      // phases below start from the state the journey is named for.
      expect(compiledAgentFiles(afterSetup, "")).toStrictEqual(
        E2E_AGENTS.WEB_AND_API.map((agent) => compiledAgentFile("", agent)),
      );
      expect(compiledAgentFiles(afterSetup, path.basename(projectDir))).toStrictEqual([
        compiledAgentFile(path.basename(projectDir), E2E_AGENT["api-developer"].name),
      ]);

      await expectGoldenTree("dual-scope-edit-compile-uninstall", {
        notPinned: [],
        phases: {
          "after dual-scope setup": afterSetup,
          "after the edit pairs a global skill at project scope": afterEdit,
          "after compile from the project": afterCompile,
          "after uninstall from the project": afterUninstall,
        },
      });
    },
  );
});
