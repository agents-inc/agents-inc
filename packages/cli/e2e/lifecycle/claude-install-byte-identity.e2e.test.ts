import { realpath } from "fs/promises";
import path from "path";
import { format, resolveConfig } from "prettier";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cliVersion } from "../../src/cli/lib/agents/agent-provenance.js";
import { typedEntries } from "../../src/cli/utils/typed-object.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  DUAL_SCOPE,
  applyEditFrom,
  e2eStackPayload,
  installDualScopeStack,
} from "../fixtures/e2e-stack-seed.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { createE2EPluginSource } from "../helpers/create-e2e-plugin-source.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import { buildSeedSkill } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { formatInstalledConfigs } from "../../src/cli/lib/__tests__/helpers/golden-tree.js";
import {
  CLI_ROOT,
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  fileExists,
  isClaudeCLIAvailable,
  normalizeInstallTree,
  readInstallTree,
  type InstallTree,
} from "../helpers/test-utils.js";

/**
 * Every file a Claude install leaves, pinned byte for byte against golden trees, so "no behaviour
 * change for Claude users" is checked. A golden records behaviour, not correctness; re-record
 * deliberately with `-u`. Normalised: temp roots, version line, `forkedFrom` date, registry
 * instants, and config.ts line breaks.
 */

const GOLDEN_TREES_DIR = path.join(CLI_ROOT, "e2e", "fixtures", "claude-golden-trees");

/**
 * The Claude CLI's own session state: nothing here moves it, and every run or release does. The
 * plugin registry beside it is pinned.
 */
const CLAUDE_SESSION_STATE = [
  path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_JSON),
  path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_LOCK),
  path.posix.join(DIRS.CLAUDE, DIRS.CLAUDE_BACKUPS),
];

type GoldenTree = {
  notPinned: readonly string[];
  phases: Record<string, InstallTree>;
};

const claudeAvailable = await isClaudeCLIAvailable();

const GLOBAL_EJECT_ID = "Golden01";

const PROJECT_PLUGIN_ID = "Golden02";

const DUAL_SCOPE_PLUS_SPARE_ID = "Golden03";
const DUAL_SCOPE_PAYLOAD = e2eStackPayload(DUAL_SCOPE);
const DUAL_SCOPE_PLUS_SPARE_PAYLOAD = {
  ...DUAL_SCOPE_PAYLOAD,
  skills: {
    ...DUAL_SCOPE_PAYLOAD.skills,
    [E2E_SKILL["visual-regression"].id]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [E2E_AGENT["api-developer"].name]: "lazy" },
    }),
  },
};

/**
 * `roots` are written as placeholders in both spellings, since a symlinked temp dir reaches the CLI
 * resolved. Each `config.ts` is reformatted after the swap, so a line a long `TMPDIR` broke still
 * compares equal; the file as read is held to that format first.
 */
async function installTreeUnder(
  root: string,
  roots: Record<string, string>,
  notPinned: readonly string[] = [],
): Promise<InstallTree> {
  const spellings = await Promise.all(
    typedEntries(roots).map(async ([name, dir]) => [name, await everySpellingOf(dir)] as const),
  );

  const tree = await readInstallTree(root, { skip: notPinned });
  expect(
    await formatInstalledConfigs(tree),
    "an install writes config.ts already formatted, however long the paths it holds",
  ).toStrictEqual(tree);

  return formatInstalledConfigs(
    normalizeInstallTree(tree, {
      roots: Object.fromEntries(spellings),
      cliVersion: await cliVersion(),
    }),
  );
}

/** One entry when the handed-out and resolved spellings agree. */
async function everySpellingOf(dir: string): Promise<string[]> {
  return [...new Set([dir, await realpath(dir)])];
}

function compiledAgentFiles(tree: InstallTree, scopeDir: string): string[] {
  const agentsDir = path.posix.join(scopeDir, DIRS.CLAUDE, DIRS.AGENTS);

  return Object.keys(tree.files).filter((file) => path.posix.dirname(file) === agentsDir);
}

function compiledAgentFile(scopeDir: string, agent: string): string {
  return path.posix.join(scopeDir, DIRS.CLAUDE, DIRS.AGENTS, `${agent}.md`);
}

/**
 * The file must already exist: vitest would write a missing one and pass. Serialised through
 * Prettier so the file `-u` writes is the one `format:check` accepts.
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
  let store: SeedConfigStore;
  let cleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(GLOBAL_EJECT_ID, e2eStackPayload({ scope: "global" }));
    store.publish(PROJECT_PLUGIN_ID, e2eStackPayload({ ...DUAL_SCOPE, install: "plugin" }));
    store.publish(DUAL_SCOPE_PLUS_SPARE_ID, DUAL_SCOPE_PLUS_SPARE_PAYLOAD);
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("a global install in eject mode", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    const home = await createTempDir();
    cleanup = () => cleanupTempDir(home);
    await createPermissionsFile(home);

    const init = await runInitFrom(store, GLOBAL_EJECT_ID, { dir: home }, E2E_SOURCE.sourceDir);
    expect(init.exitCode, `global eject init failed: ${init.output}`).toBe(EXIT_CODES.SUCCESS);

    const afterInit = await installTreeUnder(home, { home, source: E2E_SOURCE.sourceDir });

    // Subject guard: a golden recorded from a run that compiled nothing would pin the absence.
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

      const init = await runInitFrom(
        store,
        PROJECT_PLUGIN_ID,
        { dir: projectDir, globalHome: fakeHome },
        source.sourceDir,
      );
      expect(init.exitCode, `plugin init failed: ${init.output}`).toBe(EXIT_CODES.SUCCESS);

      const afterInit = await installTreeUnder(
        fakeHome,
        { home: fakeHome, project: projectDir, source: source.sourceDir },
        CLAUDE_SESSION_STATE,
      );

      // Subject guard: the agent the journey placed at project scope was compiled there.
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
    "a dual-scope install, edited, compiled and uninstalled from the project",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await installDualScopeStack(store, E2E_SOURCE.sourceDir);
      cleanup = () => cleanupTempDir(env.tempDir);
      const { fakeHome, projectDir } = env;
      const roots = { home: fakeHome, project: projectDir, source: E2E_SOURCE.sourceDir };

      const afterSetup = await installTreeUnder(fakeHome, roots);

      const edited = await applyEditFrom(store, DUAL_SCOPE_PLUS_SPARE_ID, {
        dir: projectDir,
        globalHome: fakeHome,
      });
      expect(edited.exitCode, `edit failed: ${edited.output}`).toBe(EXIT_CODES.SUCCESS);
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

      // Subject guard: the setup really was dual-scope.
      expect(compiledAgentFiles(afterSetup, "")).toStrictEqual([
        compiledAgentFile("", E2E_AGENT["web-developer"].name),
      ]);
      expect(compiledAgentFiles(afterSetup, path.basename(projectDir))).toStrictEqual([
        compiledAgentFile(path.basename(projectDir), E2E_AGENT["api-developer"].name),
      ]);

      await expectGoldenTree("dual-scope-edit-compile-uninstall", {
        notPinned: [],
        phases: {
          "after dual-scope setup": afterSetup,
          "after the edit adds a skill at project scope": afterEdit,
          "after compile from the project": afterCompile,
          "after uninstall from the project": afterUninstall,
        },
      });
    },
  );
});
