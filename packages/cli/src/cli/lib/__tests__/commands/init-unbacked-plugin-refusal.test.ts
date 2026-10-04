import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { buildAgentDefs } from "../factories/agent-factories.js";
import {
  buildConfigWriteResult,
  buildProjectConfig,
  buildSourceResult,
} from "../factories/config-factories.js";
import {
  buildCompilationResult,
  buildDiscoveredSkills,
  buildLoadedSource,
} from "../factories/operation-result-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import { MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX } from "../mock-data/mock-matrices";
import { CUSTOM_HOUSE_TOOLING_ID } from "../mock-data/mock-skills";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { EXIT_CODES } from "../../exit-codes";
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import type { SeedPayload } from "@workspace/matrix/seed";
import type { PluginHost } from "../../hosts/plugin-host.js";
import type {
  compileAgentsAllScopes,
  discoverInstalledSkills,
  loadAgentDefs,
  loadSource,
  writeProjectConfig,
} from "../../operations/index.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";

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
  mockInstallPlugin,
  mockLoadSource,
  mockWriteProjectConfig,
  mockLoadAgentDefs,
  mockDiscoverInstalledSkills,
  mockCompileAgentsAllScopes,
} = vi.hoisted(() => ({
  // Typed against the real functions, so a field a stub returns that the product has retired is
  // a compile error here rather than a dead value nothing reads.
  mockInstallPlugin: vi.fn<PluginHost["installPlugin"]>(),
  mockLoadSource: vi.fn<typeof loadSource>(),
  mockWriteProjectConfig: vi.fn<typeof writeProjectConfig>(),
  mockLoadAgentDefs: vi.fn<typeof loadAgentDefs>(),
  mockDiscoverInstalledSkills: vi.fn<typeof discoverInstalledSkills>(),
  mockCompileAgentsAllScopes: vi.fn<typeof compileAgentsAllScopes>(),
}));

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost({ installPlugin: mockInstallPlugin });
  return { hostAt: () => host, hostFor: () => host };
});

vi.mock("../../operations/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../operations/index.js")>();
  return {
    ...original,
    loadSource: mockLoadSource,
    loadAgentDefs: mockLoadAgentDefs,
    writeProjectConfig: mockWriteProjectConfig,
    discoverInstalledSkills: mockDiscoverInstalledSkills,
    compileAgentsAllScopes: mockCompileAgentsAllScopes,
  };
});

const { default: Init } = await import("../../../commands/init.js");

/** Serves one shared configuration to `fetchSeedConfig`, under the id these runs ask for. */
function serveSeed(payload: SeedPayload): void {
  configMockServer.use(storedConfigHandlerFor(SEED_ID, payload));
}

describe("init --from: a plugin install nothing backs", () => {
  // The lifecycle only: these specs assert on what the command DID with the payload, not
  // on the request that fetched it.
  useMockWorker();
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

    mockLoadSource.mockResolvedValue(
      buildLoadedSource(
        buildSourceResult(MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX, tempDir, {
          marketplace: MARKETPLACE,
        }),
      ),
    );
    mockWriteProjectConfig.mockResolvedValue(
      buildConfigWriteResult(
        buildProjectConfig({ name: "unbacked", skills: [], agents: [] }),
        getProjectConfigPath(projectDir, "claude"),
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

  it("refuses by name, never shells out, and writes no config", async () => {
    serveSeed(
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
      mockInstallPlugin,
      "the refusal is a precondition: nothing may reach the Claude CLI",
    ).not.toHaveBeenCalled();
    expect(mockWriteProjectConfig).not.toHaveBeenCalled();
    expect(
      await fileExists(getProjectConfigPath(projectDir, "claude")),
      "no config.ts may be left behind by a refused plugin install",
    ).toBe(false);
  });

  it("still installs a skill the marketplace carries", async () => {
    serveSeed(
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

    expect(mockInstallPlugin).toHaveBeenCalledWith(
      `web-framework-react@${MARKETPLACE}`,
      "project",
      process.cwd(),
    );
    expect(mockWriteProjectConfig).toHaveBeenCalledTimes(1);
  });
});
