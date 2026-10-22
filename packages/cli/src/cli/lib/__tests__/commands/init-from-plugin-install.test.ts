import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { buildAgentDefs } from "../factories/agent-factories.js";
import { buildSourceResult } from "../factories/config-factories.js";
import {
  buildCompilationResult,
  buildDiscoveredSkills,
  buildLoadedSource,
} from "../factories/operation-result-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import { REACT_HONO_WEB_API_DOMAINS_MATRIX } from "../mock-data/mock-matrices";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { EXIT_CODES } from "../../exit-codes";
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import { buildMarketplacePluginRef } from "../../plugins/plugin-ref.js";
import type { SeedPayload } from "@workspace/matrix/seed";
import type { PluginHost } from "../../hosts/plugin-host.js";
import type {
  compileAgentsAllScopes,
  discoverInstalledSkills,
  loadAgentDefs,
  loadSource,
} from "../../operations/index.js";
import type { SkillId } from "../../../types";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";

/**
 * `init --from` hands each plugin skill to the host once, at its own scope, and that install gates
 * the config write. Below `installPluginSkills` only the host is mocked, so ref construction, scope
 * mapping and the config write run for real.
 */

const MARKETPLACE = "drift-lock-marketplace";
const SEED_ID = "DriftLock1";
const WEB_DEV = "web-developer";

const PROJECT_SKILL_ID = "web-framework-react" satisfies SkillId;
/** The host translates scope words; `--scope user` is pinned in the Claude host's own specs. */
const GLOBAL_SKILL_ID = "api-framework-hono" satisfies SkillId;

const PROJECT_SKILL_REF = buildMarketplacePluginRef(PROJECT_SKILL_ID, MARKETPLACE);
const GLOBAL_SKILL_REF = buildMarketplacePluginRef(GLOBAL_SKILL_ID, MARKETPLACE);

const CLAUDE_INSTALL_FAILURE = "Plugin installation failed: no such plugin";

const {
  mockInstallPlugin,
  mockLoadSource,
  mockLoadAgentDefs,
  mockDiscoverInstalledSkills,
  mockCompileAgentsAllScopes,
} = vi.hoisted(() => ({
  // Typed against the real functions so a retired stub field is a compile error.
  mockInstallPlugin: vi.fn<PluginHost["installPlugin"]>(),
  mockLoadSource: vi.fn<typeof loadSource>(),
  mockLoadAgentDefs: vi.fn<typeof loadAgentDefs>(),
  mockDiscoverInstalledSkills: vi.fn<typeof discoverInstalledSkills>(),
  mockCompileAgentsAllScopes: vi.fn<typeof compileAgentsAllScopes>(),
}));

// The whole host is stubbed: `init`'s marketplace resolution shells out too.
vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost({ installPlugin: mockInstallPlugin });
  return { hostAt: () => host, hostFor: () => host };
});

// `installPluginSkills` and the config write stay real; the source load and the compile are stubbed.
vi.mock("../../operations/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../operations/index.js")>();
  return {
    ...original,
    loadSource: mockLoadSource,
    loadAgentDefs: mockLoadAgentDefs,
    discoverInstalledSkills: mockDiscoverInstalledSkills,
    compileAgentsAllScopes: mockCompileAgentsAllScopes,
  };
});

const { default: Init } = await import("../../../commands/init.js");

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
    // Pinned into the project: a sub-agent at the shared default could not hold a project skill.
    agents: { [WEB_DEV]: { scope: "project" } },
  });
}

/** Answering the network keeps the schema decode and seed -> selection mapping real. */
function serveSeed(payload: SeedPayload): void {
  configMockServer.use(storedConfigHandlerFor(SEED_ID, payload));
}

function installedRefsAndScopes(): Array<[string, string]> {
  return mockInstallPlugin.mock.calls.map(([ref, scope]) => [ref, scope]);
}

describe("init --from: plugin install spine", () => {
  // Lifecycle only: these specs assert on what the command did, not on the fetch.
  useMockWorker();
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-init-from-plugin-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    // `--from`'s greenfield check reads `os.homedir()`, so HOME must not be the developer's.
    vi.stubEnv("HOME", tempDir);

    // An existing permission grant keeps the post-install permission notice from rendering.
    await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
    process.chdir(projectDir);

    // The decode resolves categories from the ACTIVE matrix, not from sourceResult.
    initializeMatrix(REACT_HONO_WEB_API_DOMAINS_MATRIX);

    mockLoadSource.mockResolvedValue(
      buildLoadedSource(
        buildSourceResult(REACT_HONO_WEB_API_DOMAINS_MATRIX, tempDir, { marketplace: MARKETPLACE }),
      ),
    );
    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs({}, tempDir));
    mockDiscoverInstalledSkills.mockResolvedValue(buildDiscoveredSkills());
    mockCompileAgentsAllScopes.mockResolvedValue(buildCompilationResult());
    mockInstallPlugin.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  it("hands every plugin skill to the Claude CLI once, at the scope its entry names", async () => {
    serveSeed(buildTwoScopePluginPayload());

    await Init.run(["--from", SEED_ID, "--marketplace", tempDir], { root: CLI_ROOT });

    // Exhaustive: no duplicate install and no skill the payload never named.
    expect(installedRefsAndScopes()).toStrictEqual([
      [PROJECT_SKILL_REF, "project"],
      [GLOBAL_SKILL_REF, "global"],
    ]);
    // Anchored to the cwd, which decides where a project-scoped install is recorded.
    for (const call of mockInstallPlugin.mock.calls) {
      expect(call[2]).toBe(process.cwd());
    }
  });

  /** The allowed half of the refusals below: with every install landed, the config is written. */
  it("writes the config once every plugin install has succeeded", async () => {
    serveSeed(buildTwoScopePluginPayload());

    await Init.run(["--from", SEED_ID, "--marketplace", tempDir], { root: CLI_ROOT });

    expect(await fileExists(getProjectConfigPath(projectDir, "claude"))).toBe(true);
  });

  it("reaches neither the Claude CLI nor the config write when run at the global root", async () => {
    // At HOME both scopes collapse onto one directory, so the refusal must land before both seams.
    serveSeed(buildTwoScopePluginPayload());
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
    expect(mockInstallPlugin).not.toHaveBeenCalled();
    expect(await fileExists(getProjectConfigPath(tempDir, "claude"))).toBe(false);
  });

  it("never reaches the config write when a plugin install fails, and exits non-zero", async () => {
    serveSeed(buildTwoScopePluginPayload());
    // Partial failure: a config written now would claim both skills are installed.
    mockInstallPlugin
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
    expect(
      await fileExists(getProjectConfigPath(projectDir, "claude")),
      "no config.ts may be left behind by a failed plugin install",
    ).toBe(false);
  });
});
