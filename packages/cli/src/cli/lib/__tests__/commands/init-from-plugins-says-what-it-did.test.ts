import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { captureOutput } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import type { PluginHost } from "../../hosts/plugin-host.js";
import { EXIT_CODES } from "../../exit-codes";
import { fetchMarketplace } from "../../loading/index.js";
import { fileExists } from "../test-fs-utils";

/**
 * The host is the seam: the real one runs `claude`. Imported from source so the module mock reaches
 * it; the source load, copies, config write and compile all run for real.
 */
const { mockMarketplaceExists } = vi.hoisted(() => ({
  mockMarketplaceExists: vi.fn<PluginHost["marketplaceExists"]>(),
}));

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost({ marketplaceExists: mockMarketplaceExists });
  return { hostAt: () => host, hostFor: () => host };
});

// Only `ensureMarketplace` reads the barrel's export; the loader imports its own module.
vi.mock("../../loading/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../loading/index.js")>();
  return { ...original, fetchMarketplace: vi.fn(original.fetchMarketplace) };
});

const { default: Init } = await import("../../../commands/init.js");

const SEED_ID = "Plugins1";
const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");

describe("what init --from says of plugin installs", () => {
  useMockWorker();
  let projectDir: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-init-from-plugins-test-"));
    dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
    mockMarketplaceExists.mockResolvedValue(true);
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
    await cleanup();
  });

  function serve(payload: SeedPayload): void {
    configMockServer.use(storedConfigHandlerFor(SEED_ID, payload));
  }

  function initFrom(): ReturnType<typeof captureOutput> {
    return captureOutput(
      () => Init.run(["--from", SEED_ID, "--marketplace", dirs.sourceDir], { root: CLI_ROOT }),
      { print: false },
    );
  }

  it("names each plugin it installed and copies nothing", async () => {
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { "web-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Selected 1 skill",
        "Install mode: Plugin (native install)",
        "Installing skill plugins...",
        `  Installed ${REACT}@${TEST_MARKETPLACE_NAME}`,
        "Installed 1 skill plugin",
        "",
        "Generating configuration...",
      ].join("\n"),
    );
    expect(stdout).not.toContain("Skills copied to:");
  });

  it("says it is registering a marketplace the host does not know yet", async () => {
    mockMarketplaceExists.mockResolvedValue(false);
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { "web-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout } = await initFrom();

    expect(stdout).toContain(
      `Registering marketplace "${TEST_MARKETPLACE_NAME}"...\nInstalling skill plugins...\n`,
    );
  });

  /** The default catalogue names its marketplace only once fetched, so offline it names none. */
  it("refuses plugins when the default catalogue's marketplace cannot be fetched, and writes nothing", async () => {
    vi.mocked(fetchMarketplace).mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));
    serve(
      buildSeedPayload({
        skills: {
          "web-framework-react": buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { "web-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { error } = await captureOutput(() => Init.run(["--from", SEED_ID], { root: CLI_ROOT }), {
      print: false,
    });

    expect(error?.message).toBe(
      "Cannot install plugin skills: marketplace could not be resolved from 'github:agents-inc/skills'. Plugin install mode requires a marketplace — fix the marketplace or switch the affected skills to eject mode.",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(
      await fileExists(path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)),
    ).toBe(false);
  });

  it("counts both halves of a mixed install, copying only the ejected one", async () => {
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { "web-developer": "lazy" },
          }),
          [HONO]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { "web-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Selected 2 skills",
        "Install mode: Mixed (1 eject, 1 plugin)",
        "Copying skills to local directory...",
        `Copied 1 local skill to ${path.join(projectDir, CLAUDE_DIR, "skills")}/`,
        "Installing skill plugins...",
      ].join("\n"),
    );
    expect(stdout).toContain(
      [
        "Skills copied to:",
        `  ${path.join(projectDir, CLAUDE_DIR, "skills")}`,
        `    ${REACT}/`,
        "",
        "",
      ].join("\n"),
    );
  });
});
