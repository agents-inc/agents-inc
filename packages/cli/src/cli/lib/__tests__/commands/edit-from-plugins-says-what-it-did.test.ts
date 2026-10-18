import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
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
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import { fileExists } from "../test-fs-utils";
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

const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");
const VITEST = testMarketplaceSkillId("web-testing-vitest");
const SEED_ID = "Next";
const PROMPT_READY_MS = 600;

describe("what edit --from says of plugins", () => {
  useMockWorker();
  const terminal = standAtTerminal();
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
  async function applyAnswered(key: string) {
    const chunks: string[] = [];
    const painted = vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest) => {
      chunks.push(String(chunk));
      const onWritten = rest.find((argument) => typeof argument === "function");
      if (onWritten !== undefined) queueMicrotask(() => onWritten());
      return true;
    });
    try {
      const run = Edit.run(["--from", SEED_ID], { root: CLI_ROOT }).then(
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

  it("switches a local copy back to a plugin, installing it", async () => {
    await installPlugins([REACT]);
    serve(onWebDeveloper([REACT], "eject"));
    expect((await applyAnswered(KEY_Y)).error).toBeUndefined();
    serve(onWebDeveloper([REACT], "plugin"));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
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
      ].join("\n"),
    );
  });

  it("installs a plugin the configuration adds", async () => {
    await installPlugins([REACT]);
    serve(onWebDeveloper([REACT, HONO], "plugin"));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(`Changes:\n  + ${HONO} [P]\n`);
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

  it("names a skill copied into the project beside its global plugin once, as a project add", async () => {
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
    const onApiDeveloperAs = (install: "eject" | "plugin") =>
      buildSeedSkill({ install, scope: "project", assignments: { "api-developer": "lazy" } });
    serve(
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: { [REACT]: onApiDeveloperAs("eject"), [HONO]: onApiDeveloperAs("plugin") },
        agents: { "api-developer": { scope: "project" } },
      }),
    );

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
});
