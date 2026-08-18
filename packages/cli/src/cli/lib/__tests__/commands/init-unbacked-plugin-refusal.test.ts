import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { buildGateReport, buildSourceResult } from "../factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import { MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX } from "../mock-data/mock-matrices";
import { CUSTOM_HOUSE_TOOLING_ID } from "../mock-data/mock-skills";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { EXIT_CODES } from "../../exit-codes";
import { CLAUDE_DIR, CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts";

/**
 * A skill that exists only in this project cannot be pulled from a marketplace, so an
 * install that asks for one has to be refused rather than attempted — and refused by
 * NAME, because the generic plugin-install advice ("check the id, refresh the
 * marketplace") is impossible to act on for a skill the user wrote themselves.
 *
 * Driven through `init --from`, which states an install mode explicitly and so is the
 * one route that can still ask for a plugin install of an unbacked skill: the wizard's
 * own Sources grid no longer offers the cell. The seam below `installPluginSkills` is
 * mocked (`claudePluginInstall`), so "never shelled out" is observable.
 */

const MARKETPLACE = "unbacked-refusal-marketplace";
const SEED_ID = "Unbacked1";
const WEB_DEV = "web-developer";

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

vi.mock("../../../utils/exec.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../utils/exec.js")>()),
  claudePluginInstall: (...args: unknown[]) => mockClaudePluginInstall(...(args as [])),
  claudePluginMarketplaceExists: vi.fn().mockResolvedValue(true),
  claudePluginMarketplaceUpdate: vi.fn().mockResolvedValue(undefined),
  isClaudeCLIAvailable: vi.fn().mockResolvedValue(true),
}));

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

describe("init --from: a plugin install nothing backs", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-init-unbacked-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    vi.stubEnv("HOME", tempDir);

    await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
    process.chdir(projectDir);

    initializeMatrix(MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX);

    mockLoadSource.mockResolvedValue({
      sourceResult: buildSourceResult(MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX, tempDir, {
        marketplace: MARKETPLACE,
      }),
      startupMessages: [],
    });
    mockWriteProjectConfig.mockResolvedValue({
      config: { name: "unbacked", skills: [], agents: [] },
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

  it("refuses by name, never shells out, and writes no config", async () => {
    stubSeedFetch(
      buildSeedPayload({
        skills: {
          [CUSTOM_HOUSE_TOOLING_ID]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );

    const error = await Init.run(["--from", SEED_ID, "--marketplace", tempDir], {
      root: CLI_ROOT,
    }).then(
      () => undefined,
      (e: Error & { oclif?: { exit?: number } }) => e,
    );

    expect(error, "a plugin install nothing can serve must not exit successfully").toBeDefined();
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(
      error?.message,
      "the refusal must name the skill it is about — the generic marketplace advice cannot",
    ).toContain(CUSTOM_HOUSE_TOOLING_ID);
    expect(
      mockClaudePluginInstall,
      "the refusal is a precondition: nothing may reach the Claude CLI",
    ).not.toHaveBeenCalled();
    expect(mockWriteProjectConfig).not.toHaveBeenCalled();
    expect(
      await fileExists(path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS)),
      "no config.ts may be left behind by a refused plugin install",
    ).toBe(false);
  });

  it("still installs a skill the marketplace carries", async () => {
    stubSeedFetch(
      buildSeedPayload({
        skills: {
          "web-framework-react": buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );

    await Init.run(["--from", SEED_ID, "--marketplace", tempDir], { root: CLI_ROOT });

    expect(mockClaudePluginInstall).toHaveBeenCalledWith(
      `web-framework-react@${MARKETPLACE}`,
      "project",
      process.cwd(),
    );
    expect(mockWriteProjectConfig).toHaveBeenCalledTimes(1);
  });
});
