import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { printAtWidth, standAtTerminal } from "../helpers/terminal-input.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
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
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";
import { directoryExists, fileExists } from "../test-fs-utils";
import { delay, KEY_Y } from "../test-constants";

/**
 * The host is the seam: the real one runs `claude`. Imported from source so the module mock reaches
 * it; the load, copies, config write and compile run for real.
 */
vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

const { default: Edit } = await import("../../../commands/edit.js");
const { default: Init } = await import("../../../commands/init.js");

const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");
const VITEST = testMarketplaceSkillId("web-testing-vitest");
const SEED_ID = "Next";
const PROMPT_READY_MS = 600;

/** Wide enough that no test-marketplace id wraps inside the panel, whose rows these specs pin. */
const PANEL_COLUMNS = 160;

/** Each command a spec here answers, run from source so the host mock reaches it. */
const RUN_FROM_SEED = {
  edit: () => Edit.run(["--from", SEED_ID], { root: CLI_ROOT }),
  init: () => Init.run(["--from", SEED_ID], { root: CLI_ROOT }),
};

describe("what edit --from says of plugins", () => {
  useMockWorker();
  const terminal = standAtTerminal();
  printAtWidth(PANEL_COLUMNS);
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-edit-from-plugins-test-"));
    dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
    await cleanup();
  });

  async function installPlugins(skillIds: string[], origin = TEST_MARKETPLACE_NAME): Promise<void> {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        marketplace: dirs.sourceDir,
        marketplaceName: TEST_MARKETPLACE_NAME,
        skills: buildSkillConfigs(skillIds, { scope: "project", origin }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        stack: {
          "web-developer": Object.fromEntries(
            skillIds.map((id) => [
              id.includes("hono") ? "api-api" : "web-framework",
              [{ id, preloaded: false }],
            ]),
          ),
        },
      }),
    );
  }

  function serve(payload: SeedPayload): void {
    configMockServer.use(storedConfigHandlerFor(SEED_ID, payload));
  }

  /** Captures what the run prints, answering Ink's write callbacks, and answers the confirm. */
  async function applyAnswered(key: string, command: keyof typeof RUN_FROM_SEED = "edit") {
    const chunks: string[] = [];
    const painted = vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest) => {
      chunks.push(String(chunk));
      const onWritten = rest.find((argument) => typeof argument === "function");
      if (onWritten !== undefined) queueMicrotask(() => onWritten());
      return true;
    });
    try {
      const run = RUN_FROM_SEED[command]().then(
        () => undefined,
        (error: Error & { oclif?: { exit?: number } }) => error,
      );
      await delay(PROMPT_READY_MS);
      terminal.input.push(key);
      const error = await run;
      return { stdout: chunks.join(""), error };
    } finally {
      painted.mockRestore();
    }
  }

  function onWebDeveloper(skillIds: string[], install: "eject" | "plugin"): SeedPayload {
    return buildSeedPayload({
      marketplace: dirs.sourceDir,
      skills: Object.fromEntries(
        skillIds.map((id) => [
          id,
          buildSeedSkill({ install, scope: "project", assignments: { "web-developer": "lazy" } }),
        ]),
      ),
      agents: { "web-developer": { scope: "project" } },
    });
  }

  it("switches a plugin to a local copy and removes a plugin the configuration drops", async () => {
    await installPlugins([REACT, HONO]);
    serve(onWebDeveloper([REACT], "eject"));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Changes:",
        `  - ${HONO} [P]`,
        `  ~ ${REACT} (${TEST_MARKETPLACE_NAME} → Eject)`,
        "  ~ web-developer (agent: skills reassigned)",
        "",
        "Switching 1 skill(s) to Eject (local copy)",
        "Copied 1 local skill(s)",
        "Removed 1 plugin(s)",
        "1 agent rewritten, 0 unchanged",
      ].join("\n"),
    );
  });

  it("names the local copy a switch to a plugin overwrites before asking, then installs the plugin", async () => {
    await installPlugins([REACT]);
    serve(onWebDeveloper([REACT], "eject"));
    expect((await applyAnswered(KEY_Y)).error).toBeUndefined();
    serve(onWebDeveloper([REACT], "plugin"));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(` ↻ ${REACT} `);
    expect(stdout).not.toContain(`↻ ${REACT} ⏏`);
    expect(stdout).toContain("┘\n\nApply this configuration?\n");
    expect(stdout).toContain(
      [
        "Changes:",
        `  ~ ${REACT} (Eject → ${TEST_MARKETPLACE_NAME})`,
        "",
        "Switching 1 skill(s) to Plugin (native install)",
        "Installing skill plugins...",
        `  Installed ${REACT}@${TEST_MARKETPLACE_NAME}`,
        "Installed 1 skill plugin",
        "",
        "",
      ].join("\n"),
    );
  });

  it("installs a plugin the configuration adds", async () => {
    await installPlugins([REACT]);
    serve(onWebDeveloper([REACT, HONO], "plugin"));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      `Changes:\n  + ${HONO} [P]\n  ~ web-developer (agent: skills reassigned)\n\n`,
    );
    expect(stdout).toContain(`  Installed ${HONO}@${TEST_MARKETPLACE_NAME}\n`);
  });

  it("copies only the skill it adds as a local copy, installing the one it adds as a plugin", async () => {
    await installPlugins([REACT]);
    const onWebDeveloperAs = (install: "eject" | "plugin") =>
      buildSeedSkill({ install, scope: "project", assignments: { "web-developer": "lazy" } });
    serve(
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: {
          [REACT]: onWebDeveloperAs("plugin"),
          [HONO]: onWebDeveloperAs("plugin"),
          [VITEST]: onWebDeveloperAs("eject"),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );
    const skillFile = (id: string) =>
      path.join(projectDir, CLAUDE_DIR, "skills", id, STANDARD_FILES.SKILL_MD);

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(`  Installed ${HONO}@${TEST_MARKETPLACE_NAME}\n`);
    expect(stdout).toContain("\nCopied 1 local skill(s)\n");
    expect(await fileExists(skillFile(VITEST))).toBe(true);
    expect(await fileExists(skillFile(HONO))).toBe(false);
  });

  it("names a source by its display label in the change it lists", async () => {
    await installPlugins([REACT], "public");
    serve(onWebDeveloper([REACT], "eject"));

    const { stdout } = await applyAnswered(KEY_Y);

    expect(stdout).toContain(`  ~ ${REACT} (Public → Eject)\n`);
  });

  /** React a global plugin for web-developer; the project's own config adds Hono for api-developer. */
  async function installReactGloballyBesideAProjectHono(): Promise<void> {
    const globalReact = buildSkillConfigs([REACT], {
      scope: "global",
      origin: TEST_MARKETPLACE_NAME,
    });
    const globalAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
    const globalStack = { "web-developer": { "web-framework": [{ id: REACT, preloaded: false }] } };
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        marketplace: dirs.sourceDir,
        marketplaceName: TEST_MARKETPLACE_NAME,
        skills: globalReact,
        agents: globalAgents,
        stack: globalStack,
      }),
    );
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        marketplace: dirs.sourceDir,
        marketplaceName: TEST_MARKETPLACE_NAME,
        skills: [
          ...globalReact,
          ...buildSkillConfigs([HONO], { scope: "project", origin: TEST_MARKETPLACE_NAME }),
        ],
        agents: [...globalAgents, ...buildAgentConfigs(["api-developer"], { scope: "project" })],
        stack: { ...globalStack, "api-developer": { "api-api": [{ id: HONO, preloaded: false }] } },
      }),
    );
  }

  function onApiDeveloper(installs: Record<string, "eject" | "plugin">): SeedPayload {
    return buildSeedPayload({
      marketplace: dirs.sourceDir,
      skills: Object.fromEntries(
        Object.entries(installs).map(([id, install]) => [
          id,
          buildSeedSkill({ install, scope: "project", assignments: { "api-developer": "lazy" } }),
        ]),
      ),
      agents: { "api-developer": { scope: "project" } },
    });
  }

  it("names a skill copied into the project beside its global plugin once, as a project add", async () => {
    await installReactGloballyBesideAProjectHono();
    serve(onApiDeveloper({ [REACT]: "eject", [HONO]: "plugin" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      ["Changes:", `  + ${REACT} [P]`, "  ~ api-developer (agent: skills reassigned)", "", ""].join(
        "\n",
      ),
    );
    expect(
      await fileExists(path.join(projectDir, CLAUDE_DIR, "skills", REACT, STANDARD_FILES.SKILL_MD)),
    ).toBe(true);
  });

  it("says it copies a skill into the project beside its global plugin, rather than switching it", async () => {
    await installReactGloballyBesideAProjectHono();
    serve(onApiDeveloper({ [REACT]: "eject", [HONO]: "plugin" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain("\nCopying 1 skill into this project (the global plugin stays)\n");
    expect(stdout).not.toContain("Switching 1 skill(s) to Eject (local copy)");
  });

  it("says which skill it copies beside its global plugin and which it switches, counting each", async () => {
    await installReactGloballyBesideAProjectHono();
    serve(onApiDeveloper({ [REACT]: "eject", [HONO]: "eject" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "",
        "Switching 1 skill(s) to Eject (local copy)",
        "Copying 1 skill into this project (the global plugin stays)",
        "Copied 2 local skill(s)",
        "1 agent rewritten, 0 unchanged",
      ].join("\n"),
    );
  });

  const globalReactCopy = () => path.join(fakeHome, CLAUDE_DIR, STANDARD_DIRS.SKILLS, REACT);

  /** React a global local copy, made by an `init --from` at home; the project's own init adds Hono. */
  async function installReactGloballyAsACopyBesideAProjectHono(
    honoInstall: "eject" | "plugin",
  ): Promise<void> {
    process.chdir(fakeHome);
    serve(
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: {
          [REACT]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { "web-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "global" } },
      }),
    );
    expect((await applyAnswered(KEY_Y, "init")).error).toBeUndefined();
    expect(await directoryExists(globalReactCopy())).toBe(true);
    process.chdir(projectDir);
    serve(onApiDeveloper({ [HONO]: honoInstall }));
    expect((await applyAnswered(KEY_Y, "init")).error).toBeUndefined();
  }

  it("says it installs a skill as a plugin in this project beside its global copy, rather than switching it", async () => {
    await installReactGloballyAsACopyBesideAProjectHono("plugin");
    serve(onApiDeveloper({ [REACT]: "plugin", [HONO]: "plugin" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      "\nInstalling 1 skill as a plugin in this project (the global copy stays)\n",
    );
    expect(stdout).not.toContain("Switching 1 skill(s) to Plugin (native install)");
    expect(await directoryExists(globalReactCopy())).toBe(true);
    // Subject guard for the absence below: the confirm was painted.
    expect(stdout).toContain("Apply this configuration?");
    expect(stdout, "the global copy stays, so nothing of it is overwritten").not.toContain("↻");
  });

  it("says which skill it installs as a plugin beside its global copy and which it switches, counting each", async () => {
    await installReactGloballyAsACopyBesideAProjectHono("eject");
    serve(onApiDeveloper({ [REACT]: "plugin", [HONO]: "plugin" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "",
        "Switching 1 skill(s) to Plugin (native install)",
        "Installing 1 skill as a plugin in this project (the global copy stays)",
        "Installing skill plugins...",
      ].join("\n"),
    );
  });
});
