import path from "path";
import { chmod, mkdir, readFile, writeFile } from "fs/promises";
import { STORED_ID, storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { runCliCommand } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { fileExists } from "../test-fs-utils";
import { compactCliOutput, flattenCliOutput } from "../helpers/flatten-cli-output.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../factories/seed-factories.js";
import {
  renderMetadataYaml,
  renderSkillMd,
  renderUnparseableMetadataYaml,
} from "../content-generators";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { readTestTsConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS, EXTRA_DOMAIN_TEST_SKILLS } from "../mock-data/mock-skills";
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { delay, KEY_N, KEY_Y } from "../test-constants";
import type { ProjectConfig } from "../../../types";

const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");
const VITEST = testMarketplaceSkillId("web-testing-vitest");

/** Long enough for a load and the first frame of the confirm. */
const PROMPT_READY_MS = 600;

/**
 * `edit --from` run whole, through `dist/`, over an installation `init --from` made: the payloads
 * come from the mock worker, the skills from a test marketplace on disk, and each confirm is
 * answered at a stand-in terminal.
 */
describe("what edit --from says", () => {
  useMockWorker();
  const terminal = standAtTerminal();
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-edit-from-says-test-"));
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

  function serve(id: string, payload: SeedPayload): void {
    configMockServer.use(storedConfigHandlerFor(id, payload));
  }

  function ejected(skillId: string, agent = "web-developer") {
    return {
      [skillId]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: { [agent]: "lazy" },
      }),
    };
  }

  async function answered(argv: string[], key: string) {
    const run = runCliCommand(argv);
    await delay(PROMPT_READY_MS);
    terminal.input.push(key);
    return run;
  }

  /** React for web-developer, installed through `init --from` the way a person would have. */
  async function installReact(): Promise<void> {
    serve(
      "Installed",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: ejected(REACT),
        agents: { "web-developer": { scope: "project" } },
      }),
    );
    const { error } = await answered(["init", "--from", "Installed"], KEY_Y);
    expect(error).toBeUndefined();
  }

  const configPath = () => path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);

  it("lists what arrives and what goes, asks, then names each change it made", async () => {
    await installReact();
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: ejected(HONO),
        agents: { "web-developer": { scope: "project", model: "opus" } },
      }),
    );

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        "Fetching configuration Next...",
        "Loading skills...",
        "Into this project:",
        "  Skills:",
        `    ${HONO}`,
        "  Sub-agents:",
        "    web-developer",
        "Applying this configuration will remove:",
        "",
        " Skills:",
        `   ${REACT}`,
        "",
        "Apply this configuration?",
        "y/N",
        "",
        "Changes:",
        `  + ${HONO} [P]`,
        `  - ${REACT} [P]`,
        "  ~ web-developer (agent: defaults → model opus)",
        "  ~ web-developer (agent: skills reassigned)",
        "",
        "Copied 1 local skill(s)",
        "1 agent rewritten, 0 unchanged",
        `Claude Code runs a project sub-agent's completion gate (its Stop hook — the project's typecheck, unless the sub-agent declares its own) only once you trust the folder: open Claude Code in ${projectDir} and accept the trust prompt. Until then, 1 sub-agent's completion gate will not run, and nothing will say so.`,
        "",
        "✓ Done",
        "",
        "",
      ].join("\n"),
    );
    expect(await readFile(configPath(), "utf-8")).toContain(HONO);
  });

  it("says nothing is removed, and that nothing changed, for the configuration already installed", async () => {
    await installReact();

    const { stdout, error } = await answered(["edit", "--from", "Installed"], KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        "Fetching configuration Installed...",
        "Loading skills...",
        "Nothing is removed — this configuration only adds and re-tunes.",
        "",
        "",
        "Apply this configuration?",
        "y/N",
        "No changes made.",
        "",
      ].join("\n"),
    );
  });

  it("changes nothing on a no, and says it was cancelled", async () => {
    await installReact();
    const before = await readFile(configPath(), "utf-8");
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: ejected(HONO),
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_N);

    expect(stdout.endsWith("\nEdit cancelled\n")).toBe(true);
    expect(error?.message).toBe("Cancelled");
    expect(error?.oclif?.exit).toBe(EXIT_CODES.CANCELLED);
    expect(await readFile(configPath(), "utf-8")).toBe(before);
  });

  it("warns which sub-agents the catalogue does not know", async () => {
    await installReact();
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: ejected(REACT),
        agents: { "web-developer": { scope: "project" }, "no-such-agent": { scope: "project" } },
      }),
    );

    const { stderr } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(flattenCliOutput(stderr)).toBe("Warning: Skipped 1 unknown sub-agent(s): no-such-agent");
  });

  it("recompiles only the project when nothing global changed, beside a global installation", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      }),
    );
    await installReact();
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: { ...ejected(REACT), ...ejected(VITEST) },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain("\n1 agent rewritten, 0 unchanged\n");
  });

  it("warns which skills the catalogue does not know, and keeps them", async () => {
    await installReact();
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: { ...ejected(REACT), ...ejected("web-framework-angular-standalone") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stderr } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(flattenCliOutput(stderr)).toContain(
      "Warning: Skipped 1 skill(s) this catalog does not know: web-framework-angular-standalone",
    );
  });

  it("says it keeps an installed skill it names but this catalogue cannot place, and how to place it", async () => {
    const unplaceable = "web-framework-angular-standalone";
    await installReact();
    const installedConfig = await readTestTsConfig<ProjectConfig>(configPath());
    await writeTestTsConfig(projectDir, {
      ...installedConfig,
      skills: [
        ...installedConfig.skills,
        ...buildSkillConfigs([unplaceable], { scope: "project", origin: "eject" }),
      ],
    });
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: { ...ejected(REACT), ...ejected(unplaceable) },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(flattenCliOutput(stdout)).toContain(
      flattenCliOutput(
        [
          "Nothing is removed — this configuration only adds and re-tunes.",
          "Kept — named by this configuration, and this catalogue cannot place them:",
          `  skill ${unplaceable}`,
          "Run 'npx agents-inc update' to refresh this installation's marketplace, then apply the configuration again.",
          "Apply this configuration?",
        ].join("\n"),
      ),
    );
    expect(
      (await readTestTsConfig<ProjectConfig>(configPath())).skills.map((skill) => skill.id),
    ).toStrictEqual([REACT, unplaceable]);
  });

  it("says it keeps the global sub-agent this configuration leaves out, naming nothing else", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: [],
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      }),
    );
    await installReact();
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: { ...ejected(REACT), ...ejected(HONO) },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(flattenCliOutput(stdout)).toContain(
      flattenCliOutput(
        [
          "Nothing is removed — this configuration only adds and re-tunes.",
          "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
          "  sub-agent api-developer",
          "Change them with 'npx agents-inc edit' from your home directory.",
          "Apply this configuration?",
        ].join("\n"),
      ),
    );
  });

  it("warns of a skill folder here whose metadata describes no skill, as the load found it", async () => {
    await installReact();
    const strayDir = path.join(projectDir, CLAUDE_DIR, "skills", "stray-skill");
    await mkdir(strayDir, { recursive: true });
    await writeFile(path.join(strayDir, STANDARD_FILES.SKILL_MD), renderSkillMd("stray-skill"));
    await writeFile(
      path.join(strayDir, STANDARD_FILES.METADATA_YAML),
      renderUnparseableMetadataYaml(),
    );
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: { ...ejected(REACT), ...ejected(HONO) },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stderr, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(compactCliOutput(stderr)).toContain(
      compactCliOutput(
        `Warning: Skipping local skill 'stray-skill': metadata.yaml at ${path.join(strayDir, STANDARD_FILES.METADATA_YAML)} does not describe it`,
      ),
    );
  });

  // Root reads through the mode bits, so the refusal under test cannot happen there.
  it.skipIf(process.getuid?.() === 0)(
    "warns that it could not tell which skills were written here, and applies the rest",
    async () => {
      await installReact();
      const metadataPath = path.join(
        projectDir,
        CLAUDE_DIR,
        "skills",
        REACT,
        STANDARD_FILES.METADATA_YAML,
      );
      await chmod(metadataPath, 0o000);
      serve(
        "Next",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: { ...ejected(REACT), ...ejected(HONO) },
          agents: { "web-developer": { scope: "project" } },
        }),
      );
      try {
        const { stderr, error } = await answered(["edit", "--from", "Next"], KEY_Y);

        expect(error).toBeUndefined();
        expect(compactCliOutput(stderr)).toContain(
          compactCliOutput(
            `Warning: Could not tell which skills were written here: EACCES: permission denied, open '${metadataPath}'`,
          ),
        );
      } finally {
        await chmod(metadataPath, 0o644);
      }
    },
  );

  it("names a skill and a sub-agent moved to the global install, and moves the skill's copy", async () => {
    await installReact();
    serve(
      "Next",
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

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Changes:",
        `  ~ ${REACT} ([P] → [G])`,
        "  ~ web-developer ([P] → [G])",
        "",
        "1 agent rewritten, 0 unchanged",
        "",
        "✓ Done",
      ].join("\n"),
    );
    expect(
      await fileExists(path.join(fakeHome, CLAUDE_DIR, "skills", REACT, STANDARD_FILES.SKILL_MD)),
    ).toBe(true);
    expect(
      await fileExists(path.join(projectDir, CLAUDE_DIR, "skills", REACT, STANDARD_FILES.SKILL_MD)),
    ).toBe(false);
    expect(await fileExists(path.join(fakeHome, CLAUDE_DIR, "agents", "web-developer.md"))).toBe(
      true,
    );
    expect(await fileExists(path.join(projectDir, CLAUDE_DIR, "agents", "web-developer.md"))).toBe(
      false,
    );
  });

  it("gives a sub-agent moved into the project its own copy, and keeps the global one", async () => {
    serve(
      "Global",
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
    expect((await answered(["init", "--from", "Global"], KEY_Y)).error).toBeUndefined();
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: {
          [REACT]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { "web-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(["Changes:", "  + web-developer [P] (agent)", ""].join("\n"));
    expect(await fileExists(path.join(projectDir, CLAUDE_DIR, "agents", "web-developer.md"))).toBe(
      true,
    );
    expect(await fileExists(path.join(fakeHome, CLAUDE_DIR, "agents", "web-developer.md"))).toBe(
      true,
    );
  });

  it("names a skill added to the project over its global install as a project add, and leaves the global install as it was", async () => {
    serve(
      "Global",
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
    expect((await answered(["init", "--from", "Global"], KEY_Y)).error).toBeUndefined();
    const globalConfigPath = path.join(fakeHome, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);
    const globalConfigBefore = await readFile(globalConfigPath, "utf-8");
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: ejected(REACT, "api-developer"),
        agents: { "api-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Changes:",
        "  + api-developer (agent)",
        `  + ${REACT} [P]`,
        "",
        "1 agent rewritten, 0 unchanged",
      ].join("\n"),
    );
    expect(await readFile(globalConfigPath, "utf-8")).toBe(globalConfigBefore);
    expect(
      await fileExists(path.join(fakeHome, CLAUDE_DIR, "skills", REACT, STANDARD_FILES.SKILL_MD)),
    ).toBe(true);
    expect(
      await fileExists(path.join(projectDir, CLAUDE_DIR, "skills", REACT, STANDARD_FILES.SKILL_MD)),
    ).toBe(true);
    const projectConfig = await readTestTsConfig<ProjectConfig>(configPath());
    expect(projectConfig.skills.filter((skill) => skill.id === REACT)).toStrictEqual([
      ...buildSkillConfigs([REACT], { scope: "global", origin: "eject", excluded: true }),
      ...buildSkillConfigs([REACT], { scope: "project", origin: "eject" }),
    ]);
  });

  describe("a project copy added beside a global install", () => {
    const globalConfigPath = () =>
      path.join(fakeHome, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);
    const agentFile = (dir: string) => path.join(dir, CLAUDE_DIR, "agents", "web-developer.md");

    function reactForWebDeveloper(scope: "project" | "global") {
      return {
        [REACT]: buildSeedSkill({
          install: "eject",
          scope,
          assignments: { "web-developer": "lazy" },
        }),
      };
    }

    /** web-developer and React at the global install, from a project that has its own config. */
    async function installReactGlobally(): Promise<void> {
      serve(
        "Global",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: reactForWebDeveloper("global"),
          agents: { "web-developer": { scope: "global" } },
        }),
      );
      expect((await answered(["init", "--from", "Global"], KEY_Y)).error).toBeUndefined();
    }

    /** The global install made at home, then a project of api-developer's own beside it. */
    async function installReactAtHomeThenAProject(): Promise<void> {
      process.chdir(fakeHome);
      await installReactGlobally();
      process.chdir(projectDir);
      serve(
        "Project",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: ejected(HONO, "api-developer"),
          agents: { "api-developer": { scope: "project" } },
        }),
      );
      expect((await answered(["init", "--from", "Project"], KEY_Y)).error).toBeUndefined();
    }

    async function webDeveloperEntries(): Promise<ProjectConfig["agents"]> {
      const projectConfig = await readTestTsConfig<ProjectConfig>(configPath());
      return projectConfig.agents.filter((agent) => agent.name === "web-developer");
    }

    it("names a sub-agent whose project copy brings new skill rows once, as a project add", async () => {
      await installReactAtHomeThenAProject();
      const globalConfigBefore = await readFile(globalConfigPath(), "utf-8");
      serve(
        "Next",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: { ...ejected(HONO, "api-developer"), ...reactForWebDeveloper("project") },
          agents: { "api-developer": { scope: "project" }, "web-developer": { scope: "project" } },
        }),
      );

      const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        ["Changes:", `  + ${REACT} [P]`, "  + web-developer [P] (agent)", "", ""].join("\n"),
      );
      expect(await readFile(globalConfigPath(), "utf-8")).toBe(globalConfigBefore);
      expect(await fileExists(agentFile(projectDir))).toBe(true);
      expect(await fileExists(agentFile(fakeHome))).toBe(true);
      expect(await webDeveloperEntries()).toStrictEqual([
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ]);
    });

    it("names a sub-agent whose project copy is tuned apart from the global one once, as a project add", async () => {
      await installReactGlobally();
      serve(
        "Next",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: reactForWebDeveloper("global"),
          agents: { "web-developer": { scope: "project", model: "opus" } },
        }),
      );

      const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

      expect(error).toBeUndefined();
      expect(stdout).toContain(["Changes:", "  + web-developer [P] (agent)", "", ""].join("\n"));
      expect(await webDeveloperEntries()).toStrictEqual([
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ...buildAgentConfigs(["web-developer"], { scope: "project", model: "opus" }),
      ]);
    });

    it("names a carried skill whose project copy it wrote beside the global one once, as a project add", async () => {
      const carried = "external-web-testing-brainstorming";
      const carrying = (scope: "project" | "global", agent: "web-developer" | "api-developer") =>
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: {
            ...(scope === "project" && ejected(HONO, agent)),
            [carried]: buildSeedSkill({
              install: "eject",
              scope,
              assignments: { [agent]: "lazy" },
            }),
          },
          external: {
            [carried]: buildSeedExternalSkill({
              categoryId: "web-testing",
              files: { [STANDARD_FILES.SKILL_MD]: renderSkillMd(carried, "The carried version") },
            }),
          },
          agents: { [agent]: { scope } },
        });
      process.chdir(fakeHome);
      serve("Global", carrying("global", "web-developer"));
      expect((await answered(["init", "--from", "Global"], KEY_Y)).error).toBeUndefined();
      process.chdir(projectDir);
      serve(
        "Project",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: ejected(HONO, "api-developer"),
          agents: { "api-developer": { scope: "project" } },
        }),
      );
      expect((await answered(["init", "--from", "Project"], KEY_Y)).error).toBeUndefined();
      serve("Next", carrying("project", "api-developer"));

      const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        [
          "Changes:",
          "  + Brainstorming [P]",
          "  ~ api-developer (agent: skills reassigned)",
          "",
          "",
        ].join("\n"),
      );
      expect(
        await fileExists(
          path.join(projectDir, CLAUDE_DIR, "skills", carried, STANDARD_FILES.SKILL_MD),
        ),
      ).toBe(true);
      expect(
        await fileExists(
          path.join(fakeHome, CLAUDE_DIR, "skills", carried, STANDARD_FILES.SKILL_MD),
        ),
      ).toBe(true);
    });

    it("names a dropped project copy that was tuned apart from the global one once, as a project removal", async () => {
      await installReactGlobally();
      serve(
        "Tuned",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: reactForWebDeveloper("global"),
          agents: { "web-developer": { scope: "project", model: "opus" } },
        }),
      );
      expect((await answered(["edit", "--from", "Tuned"], KEY_Y)).error).toBeUndefined();
      serve(
        "Next",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: reactForWebDeveloper("global"),
          agents: { "web-developer": { scope: "global" } },
        }),
      );

      const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

      expect(error).toBeUndefined();
      expect(stdout).toContain(["Changes:", "  - web-developer [P] (agent)", "", ""].join("\n"));
      expect(await fileExists(agentFile(projectDir))).toBe(false);
      expect(await fileExists(agentFile(fakeHome))).toBe(true);
      expect(await webDeveloperEntries()).toStrictEqual(
        buildAgentConfigs(["web-developer"], { scope: "global" }),
      );
    });
  });

  it("names the global entries it keeps as installed, and the global sub-agent an arriving skill joins", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      }),
    );
    await installReact();
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: {
          ...ejected(REACT),
          [HONO]: buildSeedSkill({
            install: "plugin",
            scope: "global",
            assignments: { "api-developer": "lazy" },
          }),
          [VITEST]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { "api-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(flattenCliOutput(stdout)).toContain(
      flattenCliOutput(
        [
          "Into the global install:",
          "  Skills:",
          `    ${VITEST}`,
          "Nothing is removed — this configuration only adds and re-tunes.",
          "Added to sub-agents in the global install — each keeps everything it already has, since a project run only adds to the global install:",
          `  sub-agent api-developer: + ${VITEST}`,
          "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
          `  skill ${HONO}`,
          "Change them with 'npx agents-inc edit' from your home directory.",
          "Apply this configuration?",
        ].join("\n"),
      ),
    );
    expect(stdout).toContain(
      ["Changes:", `  + ${VITEST} [G]`, "  ~ api-developer [G] (agent: skills added)", ""].join(
        "\n",
      ),
    );
  });

  it("names a carried skill whose files it rewrote, when nothing else changed", async () => {
    const carried = "external-web-testing-brainstorming";
    const carrying = (content: string) =>
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: { ...ejected(REACT), ...ejected(carried) },
        external: {
          [carried]: buildSeedExternalSkill({
            categoryId: "web-testing",
            files: { [STANDARD_FILES.SKILL_MD]: renderSkillMd(carried, content) },
          }),
        },
        agents: { "web-developer": { scope: "project" } },
      });
    serve("Installed", carrying("The first version"));
    expect((await answered(["init", "--from", "Installed"], KEY_Y)).error).toBeUndefined();
    serve("Next", carrying("The second version"));

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        `Wrote 1 skill(s) this configuration carries: ${carried}`,
        "",
        "Changes:",
        "  ~ Brainstorming (skill: files rewritten)",
        "",
        "1 agent rewritten, 0 unchanged",
      ].join("\n"),
    );
    expect(stdout).not.toContain("No changes made.");
  });

  it("swaps one sub-agent for another, removing the one it dropped from disk", async () => {
    await installReact();
    serve(
      "Next",
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: ejected(REACT, "api-developer"),
        agents: { "api-developer": { scope: "project" } },
      }),
    );
    const agentsDir = path.join(projectDir, CLAUDE_DIR, "agents");

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      ["Applying this configuration will remove:", "", " Sub-agents:", "   web-developer", ""].join(
        "\n",
      ),
    );
    expect(stdout).toContain(
      ["Changes:", "  + api-developer (agent)", "  - web-developer (agent)", "", ""].join("\n"),
    );
    expect(await fileExists(path.join(agentsDir, "api-developer.md"))).toBe(true);
    expect(await fileExists(path.join(agentsDir, "web-developer.md"))).toBe(false);
  });

  // Root writes through the mode bits, so the failures under test cannot happen there.
  describe.skipIf(process.getuid?.() === 0)("a write the file system refuses", () => {
    it("names the agents it could not compile or remove, withholds the done line, and exits with failures", async () => {
      await installReact();
      const agentsDir = path.join(projectDir, CLAUDE_DIR, "agents");
      await chmod(agentsDir, 0o555);
      serve(
        "Next",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: ejected(REACT, "api-developer"),
          agents: {
            "web-developer": { scope: "project" },
            "api-developer": { scope: "project" },
          },
        }),
      );
      try {
        const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

        expect(stdout).toContain(
          [
            "0 agents rewritten, 0 unchanged (1 failed)",
            "",
            "Completed with 2 failure(s) — the changes above landed, these did not:",
            "  1 sub-agent(s) did not compile: api-developer",
            "    Run 'npx agents-inc compile' — the compiled agents on disk are stale until you do.",
            `  Could not remove agent file ${path.join(agentsDir, "web-developer.md")}: EACCES: permission denied, unlink '${path.join(agentsDir, "web-developer.md")}'`,
            "    Delete the file by hand — Claude Code loads a compiled sub-agent this project no longer configures.",
          ].join("\n"),
        );
        expect(stdout).not.toContain("✓ Done");
        expect(stdout).not.toContain("Claude Code runs a project sub-agent's completion gate");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
      } finally {
        await chmod(agentsDir, 0o755);
      }
    });

    it("warns why each sub-agent it could not compile failed", async () => {
      await installReact();
      const agentsDir = path.join(projectDir, CLAUDE_DIR, "agents");
      await chmod(agentsDir, 0o555);
      serve(
        "Next",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: ejected(REACT, "api-developer"),
          agents: {
            "web-developer": { scope: "project" },
            "api-developer": { scope: "project" },
          },
        }),
      );
      try {
        const { stderr } = await answered(["edit", "--from", "Next"], KEY_Y);

        expect(compactCliOutput(stderr)).toContain(
          compactCliOutput(
            `Warning: Failed to compile api-developer: EACCES: permission denied, open '${path.join(agentsDir, "api-developer.md")}'`,
          ),
        );
      } finally {
        await chmod(agentsDir, 0o755);
      }
    });

    it("refuses with the cause when the configuration cannot be written", async () => {
      await installReact();
      const config = configPath();
      serve(
        "Next",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: ejected(HONO),
          agents: { "web-developer": { scope: "project" } },
        }),
      );
      await chmod(config, 0o444);
      try {
        const { error } = await answered(["edit", "--from", "Next"], KEY_Y);

        expect(error?.message).toMatch(/^Could not update config: .*EACCES/);
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      } finally {
        await chmod(config, 0o644);
      }
    });
  });

  describe("at home, where the installation it edits is the global one", () => {
    const globalConfigPath = () =>
      path.join(fakeHome, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);

    function onWebDeveloper(skillIds: string[], scope: "project" | "global"): SeedPayload {
      return buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: Object.fromEntries(
          skillIds.map((id) => [
            id,
            buildSeedSkill({ install: "eject", scope, assignments: { "web-developer": "lazy" } }),
          ]),
        ),
        agents: { "web-developer": { scope } },
      });
    }

    beforeEach(async () => {
      process.chdir(fakeHome);
      serve("Global", onWebDeveloper([REACT], "global"));
      expect((await answered(["init", "--from", "Global"], KEY_Y)).error).toBeUndefined();
    });

    it("recompiles each registered project the global change reaches, and says so", async () => {
      const globalConfig = await readTestTsConfig<ProjectConfig>(globalConfigPath());
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "registered" }));
      await writeTestTsConfig(fakeHome, { ...globalConfig, projects: [projectDir] });
      serve("Next", onWebDeveloper([REACT, HONO], "global"));

      const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        [
          "1 agent rewritten, 0 unchanged",
          "Recompiled agents in 1 registered project, 0 unchanged",
          "",
          "✓ Done",
        ].join("\n"),
      );
    });

    // Root writes through the mode bits, so the refusal under test cannot happen there.
    it.skipIf(process.getuid?.() === 0)(
      "says the recompile failed and how to run it, when the agents folder refuses a stale agent's removal",
      async () => {
        const agentsDir = path.join(fakeHome, CLAUDE_DIR, "agents");
        const staleAgent = path.join(agentsDir, "web-developer.md");
        await chmod(agentsDir, 0o555);
        serve(
          "Next",
          buildSeedPayload({
            marketplace: dirs.sourceDir,
            skills: {
              [REACT]: buildSeedSkill({
                install: "eject",
                scope: "global",
                assignments: { "api-developer": "lazy" },
              }),
            },
            agents: { "api-developer": { scope: "global" } },
          }),
        );
        try {
          const { stdout, stderr, error } = await answered(["edit", "--from", "Next"], KEY_Y);

          expect(compactCliOutput(stderr)).toContain(
            compactCliOutput(
              `Warning: Agent recompilation failed: EACCES: permission denied, unlink '${staleAgent}'`,
            ),
          );
          expect(stdout).toContain(
            [
              "You can manually recompile with 'npx agents-inc compile'.",
              "",
              "Completed with 2 failure(s) — the changes above landed, these did not:",
              `  Agent recompilation failed: EACCES: permission denied, unlink '${staleAgent}'`,
              "    Run 'npx agents-inc compile' — the compiled agents on disk are stale until you do.",
            ].join("\n"),
          );
          expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
        } finally {
          await chmod(agentsDir, 0o755);
        }
      },
    );

    it("refuses a configuration that puts a skill and a sub-agent in a project, naming each, and writes nothing", async () => {
      const before = await readFile(globalConfigPath(), "utf-8");
      serve("Next", onWebDeveloper([REACT], "project"));

      const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

      expect(error?.message).toBe(
        [
          "This configuration cannot be installed here: the home directory is the global scope, and a global installation holds only global-scoped content — so these project-scoped entries have nowhere to be written:",
          `  skill ${REACT} (scope: project)`,
          "  sub-agent web-developer (scope: project)",
          "Run this from inside a project directory, or re-share it with each entry above at global scope.",
        ].join("\n"),
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toBe("Fetching configuration Next...\nLoading skills...\n");
      expect(await readFile(globalConfigPath(), "utf-8")).toBe(before);
    });
  });

  it("refuses an id the store does not hold, in the store's words", async () => {
    await installReact();

    const { error } = await runCliCommand(["edit", "--from", "NoSuchId"]);

    expect(error?.message).toBe("No configuration found for id 'NoSuchId'.");
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });

  it("refuses a directory with nothing installed, naming the install that would work", async () => {
    const { error } = await runCliCommand(["edit", "--from", "Next"]);

    expect(error?.message).toBe(
      "No installation found. Run 'npx agents-inc init --from Next' to install configuration 'Next' here.",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });
});

describe("what edit says without a terminal", () => {
  useMockWorker();
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-edit-says-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  async function installReact(): Promise<void> {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": { "web-framework": [{ id: "web-framework-react", preloaded: false }] },
        },
      }),
    );
  }

  it("refuses to apply a configuration nobody can confirm, naming both ways forward", async () => {
    await installReact();

    const { error } = await runCliCommand(["edit", "--from", "Next"]);

    expect(error?.message).toBe(
      [
        "Applying configuration 'Next' removes whatever it leaves out, so it has to be confirmed — and there is no terminal here to confirm it at.",
        "Run 'npx agents-inc edit --from Next' from a terminal, or 'npx agents-inc init --from Next' in a clean directory, which installs without removing anything.",
      ].join("\n"),
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });

  it("mints an id for this installation and names both ways to use it", async () => {
    await installReact();

    const { stdout, error } = await runCliCommand(["edit"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        "Opening 1 skill(s) across 1 sub-agent(s)...",
        `✓ Shared as ${STORED_ID}`,
        `  Install it:  npx agents-inc init --from ${STORED_ID}`,
        `  Open it:     https://agentsinc.sh/editor/?fromId=${STORED_ID}`,
        "",
      ].join("\n"),
    );
  });

  it("refuses to open the editor on a saved skill whose metadata describes no skill, naming the file", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        stack: {
          "web-developer": { "web-framework": [{ id: "web-framework-react", preloaded: false }] },
        },
      }),
    );
    const skillDir = path.join(projectDir, CLAUDE_DIR, "skills", "web-framework-react");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("web-framework-react"),
    );
    const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
    await writeFile(metadataPath, renderUnparseableMetadataYaml());

    const { stdout, error } = await runCliCommand(["edit"]);

    expect(stdout).toContain(`  web-framework-react — ${metadataPath}\n`);
    expect(error?.message).toContain(
      "The editor opens on what these files describe, so no link is made until each one describes its skill.",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });

  it("opens the id --ui --from names, and says how to apply it here instead", async () => {
    await installReact();

    const { stdout } = await runCliCommand(["edit", "--ui", "--from", "Abc123"]);

    expect(stdout).toBe(
      [
        "Open it at https://agentsinc.sh/editor/?fromId=Abc123",
        "To apply it here instead, run 'npx agents-inc edit --from Abc123'.",
        "",
      ].join("\n"),
    );
  });
});

/**
 * A skill written here, a kept skill whose rows the configuration's own skill displaces, and the
 * one-skill category that does it: the test marketplace's categories are each one-skill, and Vue
 * shares React's.
 */
describe("what edit --from says of a skill written here", () => {
  useMockWorker();
  const terminal = standAtTerminal();
  let projectDir: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  const VUE = testMarketplaceSkillId("web-framework-vue-composition-api");
  const BOTH_DEVELOPERS = {
    "web-developer": { scope: "project" },
    "api-developer": { scope: "project" },
  } as const;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-edit-from-written-here-test-"));
    dirs = await createTestSource({
      skills: inTestMarketplace([...DEFAULT_TEST_SKILLS, ...EXTRA_DOMAIN_TEST_SKILLS]),
    });
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

  function onBothDevelopers(skillId: string): SeedPayload {
    return buildSeedPayload({
      marketplace: dirs.sourceDir,
      skills: {
        [skillId]: buildSeedSkill({
          install: "eject",
          scope: "project",
          assignments: { "web-developer": "lazy", "api-developer": "lazy" },
        }),
      },
      agents: BOTH_DEVELOPERS,
    });
  }

  async function answered(argv: string[], key: string) {
    const run = runCliCommand(argv);
    await delay(PROMPT_READY_MS);
    terminal.input.push(key);
    return run;
  }

  it("keeps a skill written here, and names each row the configuration's own skill takes from it", async () => {
    configMockServer.use(storedConfigHandlerFor("Installed", onBothDevelopers(REACT)));
    expect((await answered(["init", "--from", "Installed"], KEY_Y)).error).toBeUndefined();
    // No `forkedFrom`: a hand-written folder, which no shared configuration ever carried.
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, "skills", REACT, STANDARD_FILES.METADATA_YAML),
      renderMetadataYaml({
        category: "web-framework",
        displayName: "React",
        slug: "react",
        contentHash: "authored1",
      }),
    );
    configMockServer.use(storedConfigHandlerFor("Next", onBothDevelopers(VUE)));

    const { stdout, error } = await answered(["edit", "--from", "Next"], KEY_Y);

    expect(error).toBeUndefined();
    expect(flattenCliOutput(stdout)).toContain(
      flattenCliOutput(
        [
          "Nothing is removed — this configuration only adds and re-tunes.",
          "Kept — written here rather than installed, so a shared configuration never carried them:",
          `  skill ${REACT}`,
          `${REACT}: kept, no longer assigned to api-developer's web-framework`,
          `${REACT}: kept, no longer assigned to web-developer's web-framework`,
          "Apply this configuration?",
        ].join("\n"),
      ),
    );
    expect(
      await fileExists(path.join(projectDir, CLAUDE_DIR, "skills", REACT, STANDARD_FILES.SKILL_MD)),
    ).toBe(true);
  });
});
