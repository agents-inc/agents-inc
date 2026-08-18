import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { buildGateReport, buildSourceResult } from "../factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import { REACT_HONO_WEB_API_DOMAINS_MATRIX } from "../mock-data/mock-matrices";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { EXIT_CODES } from "../../exit-codes";
import { CLAUDE_DIR, CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts";
import { buildMarketplacePluginRef } from "../../plugins/plugin-ref.js";
import type { SkillId } from "../../../types";

/**
 * The spine `init --from` shares with the wizard: plugin skills are handed to the
 * Claude CLI, once each, at the scope their own config entry names — and that
 * install GATES the config write.
 *
 * Both halves are load-bearing and neither is observable from the outside. The
 * ref and scope decide which registry key a later `uninstall` owns, so a skill
 * installed at the wrong scope uninstalls from the wrong place; and writing
 * config.ts after a failed install leaves entries claiming a skill is installed
 * that is not, with no marker to distinguish them from real ones.
 *
 * The seam is `Init.run` with the seam BELOW `installPluginSkills` mocked —
 * `claudePluginInstall` in utils/exec.js. That keeps `installPluginSkills` itself
 * real (the ref construction and the scope mapping are the things under test) and
 * costs nothing to run, while still driving the whole command: flag parsing, the
 * fetch, the seed decode, and the ordering of install against config write.
 */

const MARKETPLACE = "drift-lock-marketplace";
const SEED_ID = "DriftLock1";
const WEB_DEV = "web-developer";

/** Project-scoped in the payload — the Claude CLI calls that scope "project". */
const PROJECT_SKILL_ID = "web-framework-react" satisfies SkillId;
/** Global-scoped in the payload — the Claude CLI calls that scope "user". */
const GLOBAL_SKILL_ID = "api-framework-hono" satisfies SkillId;

const PROJECT_SKILL_REF = buildMarketplacePluginRef(PROJECT_SKILL_ID, MARKETPLACE);
const GLOBAL_SKILL_REF = buildMarketplacePluginRef(GLOBAL_SKILL_ID, MARKETPLACE);

const CLAUDE_INSTALL_FAILURE = "Plugin installation failed: no such plugin";

const {
  mockClaudePluginInstall,
  mockLoadSource,
  mockWriteProjectConfig,
  mockLoadAgentDefs,
  mockDiscoverInstalledSkills,
  mockCompileAgentsAllScopes,
} = vi.hoisted(() => ({
  mockClaudePluginInstall: vi.fn(),
  mockLoadSource: vi.fn(),
  mockWriteProjectConfig: vi.fn(),
  mockLoadAgentDefs: vi.fn(),
  mockDiscoverInstalledSkills: vi.fn(),
  mockCompileAgentsAllScopes: vi.fn(),
}));

// The one seam below the spine: everything from `installPluginSkills` upward runs
// for real, so the ref and the scope this records are the ones the Claude CLI
// would have been handed. The marketplace calls are stubbed too — `init` resolves
// the marketplace before it installs anything, and that resolution shells out.
vi.mock("../../../utils/exec.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../utils/exec.js")>()),
  claudePluginInstall: (...args: unknown[]) => mockClaudePluginInstall(...(args as [])),
  claudePluginMarketplaceExists: vi.fn().mockResolvedValue(true),
  claudePluginMarketplaceUpdate: vi.fn().mockResolvedValue(undefined),
  isClaudeCLIAvailable: vi.fn().mockResolvedValue(true),
}));

// `installPluginSkills` and `pluginInstallFailureError` are deliberately NOT
// overridden — they are the spine. Only the source load and the write/compile
// tail are stubbed, so the test neither fetches a marketplace nor compiles.
vi.mock("../../operations/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../operations/index.js")>();
  return {
    ...original,
    loadSource: (...args: unknown[]) => mockLoadSource(...(args as [])),
    loadAgentDefs: (...args: unknown[]) => mockLoadAgentDefs(...(args as [])),
    writeProjectConfig: (...args: unknown[]) => mockWriteProjectConfig(...(args as [])),
    discoverInstalledSkills: (...args: unknown[]) => mockDiscoverInstalledSkills(...(args as [])),
    compileAgentsAllScopes: (...args: unknown[]) => mockCompileAgentsAllScopes(...(args as [])),
  };
});

const { default: Init } = await import("../../../commands/init.js");

/** A payload naming one project-scoped and one global-scoped plugin skill. */
function buildTwoScopePluginPayload() {
  return buildSeedPayload({
    skills: {
      [PROJECT_SKILL_ID]: buildSeedSkill({
        install: "plugin",
        scope: "project",
        assignments: { [WEB_DEV]: "lazy" },
      }),
      [GLOBAL_SKILL_ID]: buildSeedSkill({
        install: "plugin",
        scope: "global",
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    // Pinned into the project because the project-scoped skill is assigned to it: a sub-agent
    // resting at the shared selection default could not hold that skill, and the decode refuses
    // the pair rather than handing the pipeline a row it has nowhere to write.
    agents: { [WEB_DEV]: { scope: "project" } },
  });
}

/**
 * Serves one shared configuration to `fetchSeedConfig`.
 *
 * Stubbing `fetch` rather than the module keeps the schema decode and the
 * seed -> wizard-result mapping real: a payload shape the CLI would reject on
 * the wire must reject here too. The URL is not asserted on — the store's own
 * specs cover that, and this one is about what happens after the payload lands.
 */
function stubSeedFetch(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

/** `claudePluginInstall` arguments as `[ref, scope]`, dropping the project dir. */
function installedRefsAndScopes(): Array<[string, string]> {
  return mockClaudePluginInstall.mock.calls.map(([ref, scope]) => [ref, scope]);
}

describe("init --from: plugin install spine", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-init-from-plugin-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    // `--from` is greenfield-only, and the global half of that check reads `os.homedir()`. Without
    // a fake HOME this spec would consult the developer's own ~/.claude-src and refuse to install
    // the global-scoped skill on any machine that happens to have one.
    vi.stubEnv("HOME", tempDir);

    // A settings file that already grants a permission, so the post-install
    // permission notice resolves to null and never renders.
    await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
    process.chdir(projectDir);

    // The payload's skill ids must resolve to a category and a domain, which the
    // decode reads from the ACTIVE matrix, not from sourceResult.
    initializeMatrix(REACT_HONO_WEB_API_DOMAINS_MATRIX);

    mockLoadSource.mockResolvedValue({
      sourceResult: buildSourceResult(REACT_HONO_WEB_API_DOMAINS_MATRIX, tempDir, {
        marketplace: MARKETPLACE,
      }),
      startupMessages: [],
    });
    mockWriteProjectConfig.mockResolvedValue({
      config: { name: "drift-lock", skills: [], agents: [] },
      configPath: path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
      wasMerged: false,
      filesWritten: 1,
      propagation: buildGateReport(),
    });
    mockLoadAgentDefs.mockResolvedValue({
      agents: {},
      sourcePath: tempDir,
      agentSourcePaths: { agentsDir: tempDir, templatesDir: tempDir, sourcePath: tempDir },
    });
    mockDiscoverInstalledSkills.mockResolvedValue({
      allSkills: {},
      totalSkillCount: 0,
      pluginSkillCount: 0,
      localSkillCount: 0,
      globalPluginSkillCount: 0,
      globalLocalSkillCount: 0,
    });
    mockCompileAgentsAllScopes.mockResolvedValue({
      compiled: [],
      rewritten: [],
      failed: [],
      warnings: [],
    });
    mockClaudePluginInstall.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  it("hands every plugin skill to the Claude CLI once, at the scope its entry names", async () => {
    stubSeedFetch(buildTwoScopePluginPayload());

    await Init.run(["--from", SEED_ID, "--marketplace", tempDir], { root: CLI_ROOT });

    // Exhaustive, not "contains": a second call for the same skill would install
    // it twice, and a call for a skill the payload never named would install
    // something nobody asked for. Both are invisible to a per-call assertion.
    expect(installedRefsAndScopes()).toStrictEqual([
      [PROJECT_SKILL_REF, "project"],
      [GLOBAL_SKILL_REF, "user"],
    ]);
    // Third argument: every install is anchored to the directory the command runs
    // in, which is what decides where a project-scoped install is recorded.
    for (const call of mockClaudePluginInstall.mock.calls) {
      expect(call[2]).toBe(process.cwd());
    }
  });

  it("writes the config only after every plugin install has succeeded", async () => {
    stubSeedFetch(buildTwoScopePluginPayload());

    await Init.run(["--from", SEED_ID, "--marketplace", tempDir], { root: CLI_ROOT });

    expect(mockWriteProjectConfig).toHaveBeenCalledTimes(1);
    const [installOrder] = mockClaudePluginInstall.mock.invocationCallOrder.slice(-1);
    const [writeOrder] = mockWriteProjectConfig.mock.invocationCallOrder;
    expect(
      installOrder,
      "the last plugin install must precede the config write, not follow it",
    ).toBeLessThan(writeOrder ?? 0);
  });

  it("reaches neither the Claude CLI nor the config write when run at the global root", async () => {
    // Same payload, run from HOME instead of the project. There the two scopes collapse onto one
    // directory, so a project-scoped entry would be registered against `$HOME` as a project and
    // recorded in the global config — and no layer below this one re-reads the scope to notice.
    // The refusal has to land before BOTH seams, which is what the two negatives below say.
    stubSeedFetch(buildTwoScopePluginPayload());
    process.chdir(tempDir);

    const error = await Init.run(["--from", SEED_ID, "--marketplace", tempDir], {
      root: CLI_ROOT,
    }).then(
      () => undefined,
      (e: Error & { oclif?: { exit?: number } }) => e,
    );

    expect(
      error,
      "a project-scoped payload at the global root must not exit successfully",
    ).toBeDefined();
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(mockClaudePluginInstall).not.toHaveBeenCalled();
    expect(mockWriteProjectConfig).not.toHaveBeenCalled();
  });

  it("never reaches the config write when a plugin install fails, and exits non-zero", async () => {
    stubSeedFetch(buildTwoScopePluginPayload());
    // The first skill installs, the second does not — the partial-failure shape.
    // A config written here would claim BOTH skills are installed.
    mockClaudePluginInstall
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error(CLAUDE_INSTALL_FAILURE));

    const error = await Init.run(["--from", SEED_ID, "--marketplace", tempDir], {
      root: CLI_ROOT,
    }).then(
      () => undefined,
      (e: Error & { oclif?: { exit?: number } }) => e,
    );

    expect(error, "a failed plugin install must not exit successfully").toBeDefined();
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(mockWriteProjectConfig).not.toHaveBeenCalled();
    expect(
      await fileExists(path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS)),
      "no config.ts may be left behind by a failed plugin install",
    ).toBe(false);
  });
});
