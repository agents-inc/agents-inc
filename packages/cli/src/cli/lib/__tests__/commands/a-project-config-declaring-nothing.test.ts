import path from "path";
import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";

import { runCliCommand } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { useClaudeStub } from "../helpers/claude-stub.js";
import { compactCliOutput } from "../helpers/flatten-cli-output.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { readInstallTree } from "../helpers/golden-tree.js";
import { directoryExists, fileExists } from "../test-fs-utils.js";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { sa } from "../factories/skill-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import {
  cleanupTestSource,
  createTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { renderAgentMd } from "../content-generators.js";
import { stampProvenanceMarker } from "../../agents/agent-provenance.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../../consts";
import type { ProjectConfig } from "../../../types";

/**
 * Owner 2026-10-24 ("Never count it, and say so"): a project folder whose `config.ts` declares no
 * skill and no sub-agent is treated exactly like a project with no config at all. A command run
 * there works on the global installation, or, where HOME holds both providers' installations,
 * refuses naming both; and it first prints one line saying so. The leftover config is the user's:
 * no command removes it.
 *
 * Each spec runs the command from the project with no config first, then writes a config that
 * declares nothing and runs it again: the second run prints what the first printed, after the line.
 * A warm-up run comes first, so a command that writes leaves the same state for both runs to see.
 * The line is pinned on stderr, where the old-`.claude-src/` line sits, so piped output is unchanged.
 *
 * Owner 2026-10-26 ("A line worded for each"): that line is not true of every command, so
 * `uninstall`, `eject`, `init` and `search`, and a run where HOME holds no installation it could
 * work on, each print a line of their own in its place, true for that command; `uninstall`'s says
 * there is nothing to remove, so it is printed only where the run finds nothing. Owner, the same
 * day ("Keep removing it"): an `uninstall` run at HOME still removes HOME's config however empty,
 * since there it is the global installation.
 */

/** Rendered text, word for word as the owner chose it, so a literal. */
const SAYS_SO =
  "This project's config declares nothing, so this works on your global installation.\n";

/** Where HOME holds no installation the run could work on. */
const SAYS_THERE_IS_NO_GLOBAL =
  "This project's config declares nothing, and there is no global installation for this to work on.\n";

/** The owner's own example for `uninstall`. */
const UNINSTALL_SAYS =
  "This project's config declares nothing, so there is nothing to uninstall in this project.\n";

const EJECT_SAYS =
  "This project's config declares nothing; eject works on this project, not on a global installation.\n";

const INIT_SAYS =
  "This project's config declares nothing, so init treats this project as holding no installation.\n";

const SEARCH_SAYS =
  "This project's config declares nothing; search reads the marketplace it names, else the global installation's, else the default one.\n";

/** Every one of the lines opens so, which no other stderr line does. */
const ANY_OF_THE_LINES = "This project's config declares nothing";

/** Literals: a test reading the folders off the product would move with them. */
const CLAUDE_FOLDER = ".agents-inc/claude";
const CODEX_FOLDER = ".agents-inc/codex";
const CLAUDE_SKILLS = ".claude/skills";
const CLAUDE_AGENTS = ".claude/agents";

/** The skills the fixture marketplace publishes, as the folders an eject leaves. */
const MARKETPLACE_SKILL_IDS = inTestMarketplace(DEFAULT_TEST_SKILLS)
  .map((skill) => skill.id)
  .sort();

/** HOME's link to the shared marketplace checkout, which no run writes through. */
const NOT_HOMES_OWN = { skip: [".cache"] };

/** A global installation with a sub-agent and no skill: compile writes it, list and doctor read it. */
const WITH_A_SUB_AGENT = buildProjectConfig({
  name: "global-installation",
  skills: [],
  agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
});

/** An ejected skill, which update names as left alone, so its run says something of HOME's. */
const WITH_AN_EJECTED_SKILL = buildProjectConfig({
  name: "global-installation",
  skills: [buildSkillConfig("web-framework-react", { scope: "global" })],
  agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
});

/** A public-catalogue plugin skill, which share and edit carry rather than refuse. */
const WITH_A_PLUGIN_SKILL = buildProjectConfig({
  name: "global-installation",
  skills: [
    buildSkillConfig("web-framework-react", {
      scope: "global",
      origin: DEFAULT_PUBLIC_SOURCE_NAME,
    }),
  ],
  agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
  stack: { "web-developer": { "web-framework": [sa("web-framework-react")] } },
});

const DECLARES_NOTHING = buildProjectConfig({ name: "project", skills: [], agents: [] });

const SEED_ID = "Seed1";

/** The clause of doctor's Config Valid row that says which installation it checked. */
const CHECKS_THE_GLOBAL =
  "using the global installation's (~/.agents-inc/claude/config.ts), which is valid";

/** The clause of the same row that says the project holds no config.ts, true only with none. */
const SAYS_THE_PROJECT_HOLDS_NONE = "This project: no config.ts, ";

type Run = Awaited<ReturnType<typeof runCliCommand>>;

describe("a project whose config declares nothing", () => {
  useMockWorker();
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-declares-nothing-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  async function installAtHome(config: ProjectConfig, folder = CLAUDE_FOLDER): Promise<void> {
    await writeTestTsConfig(fakeHome, config, folder);
  }

  async function declaresNothing(folder = CLAUDE_FOLDER): Promise<string> {
    return writeTestTsConfig(projectDir, DECLARES_NOTHING, folder);
  }

  /**
   * The command from the project with no config (after a warm-up), then with one declaring nothing;
   * the second run leaves HOME as the first did, and the project as it found it.
   */
  async function withoutThenDeclaringNothing(
    argv: readonly string[],
    folder = CLAUDE_FOLDER,
  ): Promise<{ without: Run; declaringNothing: Run }> {
    await runCliCommand([...argv]);
    const without = await runCliCommand([...argv]);
    const homeAfterWithout = await readInstallTree(fakeHome, NOT_HOMES_OWN);
    await declaresNothing(folder);
    const projectBefore = await readInstallTree(projectDir);

    const declaringNothing = await runCliCommand([...argv]);

    expect(
      await readInstallTree(fakeHome, NOT_HOMES_OWN),
      "HOME is left as the run from a project with no config leaves it",
    ).toStrictEqual(homeAfterWithout);
    expect(
      await readInstallTree(projectDir),
      "the config that declares nothing is the user's, and the run leaves the project as it was",
    ).toStrictEqual(projectBefore);
    return { without, declaringNothing };
  }

  function expectTheSameRunAfterTheLine(
    without: Run,
    declaringNothing: Run,
    line: string = SAYS_SO,
  ): void {
    expect(without.stderr, "a project with no config is told nothing about one").not.toContain(
      ANY_OF_THE_LINES,
    );
    expect(
      [declaringNothing.error?.message, declaringNothing.error?.oclif?.exit],
      "it ends as the run from a project with no config ends",
    ).toStrictEqual([without.error?.message, without.error?.oclif?.exit]);
    expect(declaringNothing.stdout, "stdout is what it is with no config").toBe(without.stdout);
    expect(
      declaringNothing.stderr,
      "stderr opens with the one line saying so, then is what it is with no config",
    ).toBe(`${line}${without.stderr}`);
  }

  describe("under a HOME holding one installation", () => {
    it.each([
      { argv: ["list"], home: WITH_A_SUB_AGENT },
      { argv: ["compile"], home: WITH_A_SUB_AGENT },
      { argv: ["update"], home: WITH_AN_EJECTED_SKILL },
      { argv: ["share"], home: WITH_A_PLUGIN_SKILL },
      { argv: ["edit"], home: WITH_A_PLUGIN_SKILL },
    ])(
      "$argv works on the global installation, as from a project with no config, after one line saying so",
      async ({ argv, home }) => {
        await installAtHome(home);

        const { without, declaringNothing } = await withoutThenDeclaringNothing(argv);

        expectTheSameRunAfterTheLine(without, declaringNothing);
      },
    );

    it("uninstall removes nothing, in the project or at HOME, as from a project with no config, after its own line saying there is nothing to uninstall here", async () => {
      await installAtHome(WITH_A_SUB_AGENT);
      const without = await runCliCommand(["uninstall", "--yes"]);
      const configPath = await declaresNothing();
      const projectBefore = await readInstallTree(projectDir);
      const homeBefore = await readInstallTree(fakeHome, NOT_HOMES_OWN);

      const declaringNothing = await runCliCommand(["uninstall", "--yes"]);

      expect(
        without.stdout,
        "subject guard: with no config there is nothing to uninstall",
      ).toContain("not installed in this project");
      expect(
        await readInstallTree(fakeHome, NOT_HOMES_OWN),
        "the global installation is left as it was",
      ).toStrictEqual(homeBefore);
      expectTheSameRunAfterTheLine(without, declaringNothing, UNINSTALL_SAYS);
      expect(
        await readInstallTree(projectDir),
        `the config that declares nothing is the user's, and stays at ${configPath}`,
      ).toStrictEqual(projectBefore);
    });

    it("eject writes into this project, keeping its config as it is and HOME as it was, after its own line", async () => {
      await installAtHome(WITH_A_SUB_AGENT);
      const configPath = await declaresNothing();
      const configBefore = await readFile(configPath, "utf-8");
      const homeBefore = await readInstallTree(fakeHome, NOT_HOMES_OWN);

      const { stdout, stderr, error } = await runCliCommand(["eject", "agent-partials"]);

      expect(error).toBeUndefined();
      expect(stdout, "the partials land in this project").toContain(
        `✓ Agent partials ejected to ${path.join(projectDir, CLAUDE_FOLDER, "agents")}\n`,
      );
      expect(stderr, "stderr is the one line saying what eject works on").toBe(EJECT_SAYS);
      expect(
        await readFile(configPath, "utf-8"),
        "the config that declares nothing is the user's",
      ).toBe(configBefore);
      expect(
        await readInstallTree(fakeHome, NOT_HOMES_OWN),
        "the global installation is left as it was",
      ).toStrictEqual(homeBefore);
    });

    /** The control beside the one above: the line is about a config, so no config, no line. */
    it("eject from a project with no config is told nothing about one", async () => {
      await installAtHome(WITH_A_SUB_AGENT);

      const { stdout, stderr, error } = await runCliCommand(["eject", "agent-partials"]);

      expect(error).toBeUndefined();
      expect(stdout, "subject guard: eject wrote this project its config").toContain(
        `✓ Created ${CLAUDE_FOLDER}/config.ts\n`,
      );
      expect(stderr).not.toContain(ANY_OF_THE_LINES);
    });

    it("init shows what it shows from a project with no config, after its own line", async () => {
      await installAtHome(WITH_A_SUB_AGENT);

      const { without, declaringNothing } = await withoutThenDeclaringNothing(["init"]);

      expectTheSameRunAfterTheLine(without, declaringNothing, INIT_SAYS);
    });

    it("search, where neither config names a marketplace, reads the default one as from a project with no config, after its own line", async () => {
      await installAtHome(WITH_A_SUB_AGENT);

      const { without, declaringNothing } = await withoutThenDeclaringNothing(["search", "react"]);

      expect(without.stdout, "subject guard: search found what it searched for").toContain(
        'matching "react"\n',
      );
      expectTheSameRunAfterTheLine(without, declaringNothing, SEARCH_SAYS);
    });

    /** The permitted case beside the one above, so a guard that left every project config shows. */
    it("uninstall removes a project config that declares a sub-agent, leaving HOME as it was", async () => {
      await installAtHome(WITH_A_SUB_AGENT);
      const configPath = await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"]),
        }),
        CLAUDE_FOLDER,
      );
      const homeBefore = await readInstallTree(fakeHome, NOT_HOMES_OWN);

      const { error } = await runCliCommand(["uninstall", "--yes"]);

      expect(error).toBeUndefined();
      expect(
        await fileExists(configPath),
        "a config declaring a sub-agent is an installation",
      ).toBe(false);
      expect(
        await readInstallTree(fakeHome, NOT_HOMES_OWN),
        "the global installation is left as it was",
      ).toStrictEqual(homeBefore);
    });

    it("doctor checks the global installation, as from a project with no config, after one line saying so", async () => {
      await installAtHome(WITH_A_SUB_AGENT);

      const { without, declaringNothing } = await withoutThenDeclaringNothing(["doctor"]);

      expect(
        without.stdout,
        "subject guard: with no config, doctor checks the global installation",
      ).toContain(CHECKS_THE_GLOBAL);
      expect(
        [declaringNothing.error?.message, declaringNothing.error?.oclif?.exit],
        "it ends as the run from a project with no config ends",
      ).toStrictEqual([without.error?.message, without.error?.oclif?.exit]);
      expect(declaringNothing.stdout, "the installation checked is the global one").toContain(
        CHECKS_THE_GLOBAL,
      );
      expect(
        declaringNothing.stderr,
        "stderr opens with the one line saying so, then is what it is with no config",
      ).toBe(`${SAYS_SO}${without.stderr}`);
    });

    it("doctor does not say the project holds no config.ts beside the one it holds", async () => {
      await installAtHome(WITH_A_SUB_AGENT);

      const { without, declaringNothing } = await withoutThenDeclaringNothing(["doctor"]);

      expect(
        without.stdout,
        "subject guard: with no config, doctor says the project holds none",
      ).toContain(SAYS_THE_PROJECT_HOLDS_NONE);
      expect(
        declaringNothing.stdout,
        "the project holds a config.ts, one that declares nothing",
      ).not.toContain(SAYS_THE_PROJECT_HOLDS_NONE);
    });

    /** HOME's installation is Claude's, so a Codex leftover must not steer which one is read. */
    it.each([
      { argv: ["update"], home: WITH_AN_EJECTED_SKILL },
      { argv: ["share"], home: WITH_A_PLUGIN_SKILL },
      { argv: ["edit"], home: WITH_A_PLUGIN_SKILL },
      { argv: ["list"], home: WITH_A_SUB_AGENT },
      { argv: ["compile"], home: WITH_A_SUB_AGENT },
    ])(
      "$argv works on the global Claude installation where the config declaring nothing is a Codex one, as from a project with no config, after one line saying so",
      async ({ argv, home }) => {
        await installAtHome(home);

        const { without, declaringNothing } = await withoutThenDeclaringNothing(argv, CODEX_FOLDER);

        expectTheSameRunAfterTheLine(without, declaringNothing);
      },
    );

    it.each([CLAUDE_FOLDER, CODEX_FOLDER])(
      "doctor's Config Valid row names the project's %s/config.ts as declaring nothing, beside the global config it checks",
      async (folder) => {
        await installAtHome(WITH_A_SUB_AGENT);

        const { declaringNothing } = await withoutThenDeclaringNothing(["doctor"], folder);

        expect(declaringNothing.stdout).toContain(
          `    Config Valid            ✓  This project: ${folder}/config.ts declares nothing, ${CHECKS_THE_GLOBAL}\n`,
        );
      },
    );

    it("a project holding an installation of its own is acted on as before, with no line", async () => {
      await installAtHome(WITH_A_SUB_AGENT);
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "project-installation" }));

      const { stdout, stderr, error } = await runCliCommand(["list"]);

      expect(error).toBeUndefined();
      expect(stdout, "list read the project's own installation").toContain(
        path.join(projectDir, CLAUDE_FOLDER, "config.ts"),
      );
      expect(stderr, "a project holding an installation is told nothing").not.toContain(SAYS_SO);
    });
  });

  describe("under a HOME holding no installation the run could work on", () => {
    it.each([["list"], ["compile"], ["share"], ["update"], ["edit"]])(
      "%s ends as from a project with no config, after one line saying there is no global installation for it",
      async (...argv) => {
        const { without, declaringNothing } = await withoutThenDeclaringNothing(argv);

        expectTheSameRunAfterTheLine(without, declaringNothing, SAYS_THERE_IS_NO_GLOBAL);
      },
    );

    it("doctor checks the project's config, after one line saying there is no global installation for it", async () => {
      const { without, declaringNothing } = await withoutThenDeclaringNothing(["doctor"]);

      expect(
        declaringNothing.stdout,
        "subject guard: doctor read the project's config that declares nothing",
      ).toContain("This project: .agents-inc/claude/config.ts is valid but declares no skills");
      expect(without.stderr, "a project with no config is told nothing about one").not.toContain(
        ANY_OF_THE_LINES,
      );
      expect(
        declaringNothing.stderr,
        "stderr opens with the one line saying so, then is what it is with no config",
      ).toBe(`${SAYS_THERE_IS_NO_GLOBAL}${without.stderr}`);
    });

    it.each([
      { argv: ["uninstall", "--yes"], line: UNINSTALL_SAYS },
      { argv: ["init"], line: INIT_SAYS },
      { argv: ["search", "react"], line: SEARCH_SAYS },
    ])(
      "$argv ends as from a project with no config, after its own line",
      async ({ argv, line }) => {
        const { without, declaringNothing } = await withoutThenDeclaringNothing(argv);

        expectTheSameRunAfterTheLine(without, declaringNothing, line);
      },
    );

    it("eject writes into this project, keeping its config as it is, after its own line", async () => {
      const configPath = await declaresNothing();
      const configBefore = await readFile(configPath, "utf-8");

      const { stdout, stderr, error } = await runCliCommand(["eject", "agent-partials"]);

      expect(error).toBeUndefined();
      expect(stdout, "the partials land in this project").toContain(
        `✓ Agent partials ejected to ${path.join(projectDir, CLAUDE_FOLDER, "agents")}\n`,
      );
      expect(stderr, "stderr is the one line saying what eject works on").toBe(EJECT_SAYS);
      expect(
        await readFile(configPath, "utf-8"),
        "the config that declares nothing is the user's",
      ).toBe(configBefore);
    });

    /** HOME's one installation is Claude's, so a run naming Codex has none to work on. */
    it("list naming a provider HOME holds no installation of ends as from a project with no config, after one line saying there is no global installation for it", async () => {
      await installAtHome(WITH_A_SUB_AGENT);

      const { without, declaringNothing } = await withoutThenDeclaringNothing([
        "list",
        "--provider",
        "codex",
      ]);

      expectTheSameRunAfterTheLine(without, declaringNothing, SAYS_THERE_IS_NO_GLOBAL);
    });
  });

  /** `eject` run at HOME leaves HOME so. */
  describe("under a HOME holding only a config that declares nothing", () => {
    beforeEach(async () => {
      await installAtHome(buildProjectConfig({ name: "placeholder", skills: [], agents: [] }));
    });

    it.each([["list"], ["compile"], ["share"], ["update"], ["edit"]])(
      "%s ends as from a project with no config, after one line saying there is no global installation for it",
      async (...argv) => {
        const { without, declaringNothing } = await withoutThenDeclaringNothing(argv);

        expectTheSameRunAfterTheLine(without, declaringNothing, SAYS_THERE_IS_NO_GLOBAL);
      },
    );

    it("doctor checks the project's config, after one line saying there is no global installation for it", async () => {
      const { without, declaringNothing } = await withoutThenDeclaringNothing(["doctor"]);

      expect(
        declaringNothing.stdout,
        "subject guard: doctor read the project's config that declares nothing",
      ).toContain("This project: .agents-inc/claude/config.ts is valid but declares no skills");
      expect(without.stderr, "a project with no config is told nothing about one").not.toContain(
        ANY_OF_THE_LINES,
      );
      expect(
        declaringNothing.stderr,
        "stderr opens with the one line saying so, then is what it is with no config",
      ).toBe(`${SAYS_THERE_IS_NO_GLOBAL}${without.stderr}`);
    });
  });

  describe("under a HOME holding a Claude and a Codex installation", () => {
    beforeEach(async () => {
      await installAtHome(WITH_A_SUB_AGENT, CLAUDE_FOLDER);
      await installAtHome(WITH_A_SUB_AGENT, CODEX_FOLDER);
    });

    it.each([["update"], ["share"], ["compile"], ["edit"], ["list"]])(
      "%s refuses or names both, as from a project with no config, after one line saying so",
      async (...argv) => {
        const { without, declaringNothing } = await withoutThenDeclaringNothing(argv);

        expect(
          `${without.error?.message ?? ""}${without.stdout}`,
          "subject guard: with no config, the run names HOME's two installations",
        ).toContain(`${fakeHome} holds 2 installations — claude and codex`);
        expectTheSameRunAfterTheLine(without, declaringNothing);
      },
    );

    it("doctor reports both as a finding and checks each, as from a project with no config, after one line saying so", async () => {
      const finding = compactCliOutput(
        [
          "    Installations           ✓  2 installations here, each checked below",
          `                               - ${fakeHome} holds 2 installations — claude and codex — so every command that acts on one cannot tell which one you mean. Name it with --provider <claude|codex>. Nothing has been changed.`,
          "",
          "  The claude installation",
        ].join("\n"),
      );

      const { without, declaringNothing } = await withoutThenDeclaringNothing(["doctor"]);

      expect(
        compactCliOutput(without.stdout),
        "subject guard: with no config, doctor names both",
      ).toContain(finding);
      expect(
        compactCliOutput(declaringNothing.stdout),
        "the finding names HOME's two installations",
      ).toContain(finding);
      expect(declaringNothing.stdout, "and each is checked").toContain(
        "\n  The codex installation\n",
      );
      expect(
        declaringNothing.stderr,
        "stderr opens with the one line saying so, then is what it is with no config",
      ).toBe(`${SAYS_SO}${without.stderr}`);
    });

    it.each([
      ["eject", "skills"],
      ["uninstall", "--yes"],
    ])(
      "%s refuses naming both, as from a project with no config, and changes nothing",
      async (...argv) => {
        const without = await runCliCommand(argv);
        await declaresNothing();
        const projectBefore = await readInstallTree(projectDir);
        const homeBefore = await readInstallTree(fakeHome, NOT_HOMES_OWN);

        const declaringNothing = await runCliCommand(argv);

        expect(without.error?.message, "subject guard: with no config, it refuses").toContain(
          `${fakeHome} holds 2 installations — claude and codex`,
        );
        expect(
          await readInstallTree(fakeHome, NOT_HOMES_OWN),
          "both global installations are left as they were",
        ).toStrictEqual(homeBefore);
        expect(
          [declaringNothing.error?.message, declaringNothing.error?.oclif?.exit],
          "it refuses as the run from a project with no config refuses",
        ).toStrictEqual([without.error?.message, without.error?.oclif?.exit]);
        expect(declaringNothing.stdout).toBe(without.stdout);
        expect(
          await readInstallTree(projectDir),
          "the project, and its config that declares nothing, are left as they were",
        ).toStrictEqual(projectBefore);
      },
    );
  });

  /** `eject` leaves a project so: copies stamped as this CLI's, beside a config declaring nothing. */
  describe("holding what this CLI copied or compiled into it", () => {
    let dirs: TestDirs;

    beforeEach(async () => {
      dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    });

    afterEach(async () => {
      await cleanupTestSource(dirs);
    });

    it("uninstall removes the skill copies eject made, keeping the config, and does not say there is nothing to uninstall", async () => {
      const configPath = await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ ...DECLARES_NOTHING, marketplace: dirs.sourceDir }),
        CLAUDE_FOLDER,
      );
      const skillsDir = path.join(projectDir, CLAUDE_SKILLS);
      await runCliCommand(["eject", "skills"]);
      expect(
        [...(await readdir(skillsDir))].sort(),
        "subject guard: eject copied the marketplace's skills into this project",
      ).toStrictEqual(MARKETPLACE_SKILL_IDS);
      const configBefore = await readFile(configPath, "utf-8");

      const { stderr, error } = await runCliCommand(["uninstall", "--yes"]);

      expect(error).toBeUndefined();
      expect(await directoryExists(skillsDir), "every copy eject made is removed").toBe(false);
      expect(
        await readFile(configPath, "utf-8"),
        "the config that declares nothing is the user's",
      ).toBe(configBefore);
      expect(stderr, "the run removed copies, so no line says it had nothing to").not.toContain(
        UNINSTALL_SAYS,
      );
    });

    it("uninstall removes a sub-agent file carrying this CLI's marker, keeping the config, and does not say there is nothing to uninstall", async () => {
      const configPath = await declaresNothing();
      const agentPath = path.join(projectDir, CLAUDE_AGENTS, "web-developer.md");
      await mkdir(path.dirname(agentPath), { recursive: true });
      await writeFile(agentPath, stampProvenanceMarker(renderAgentMd("web-developer")));
      const configBefore = await readFile(configPath, "utf-8");

      const { stderr, error } = await runCliCommand(["uninstall", "--yes"]);

      expect(error).toBeUndefined();
      expect(await fileExists(agentPath), "the file this CLI compiled is removed").toBe(false);
      expect(
        await readFile(configPath, "utf-8"),
        "the config that declares nothing is the user's",
      ).toBe(configBefore);
      expect(stderr, "the run removed a file, so no line says it had nothing to").not.toContain(
        UNINSTALL_SAYS,
      );
    });
  });

  describe("init --from", () => {
    useClaudeStub();
    let dirs: TestDirs;

    beforeEach(async () => {
      dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      configMockServer.use(
        storedConfigHandlerFor(
          SEED_ID,
          buildSeedPayload({
            skills: {
              [testMarketplaceSkillId("web-framework-react")]: buildSeedSkill({
                install: "eject",
                scope: "project",
                assignments: { "web-developer": "lazy" },
              }),
            },
            agents: { "web-developer": { scope: "project" } },
          }),
        ),
      );
      await installAtHome(WITH_A_SUB_AGENT);
    });

    afterEach(async () => {
      await cleanupTestSource(dirs);
    });

    function initFrom(): Promise<Run> {
      return runCliCommand(["init", "--from", SEED_ID, "--marketplace", dirs.sourceDir]);
    }

    it("installs into this project, adding to its config, after its own line", async () => {
      const configPath = await declaresNothing();

      const { stdout, stderr, error } = await initFrom();

      expect(error).toBeUndefined();
      expect(stdout, "the install added to the project's own config").toContain(
        `Merged with existing config at ${configPath}\n`,
      );
      expect(stderr, "stderr is the one line saying how init treats this project").toBe(INIT_SAYS);
    });

    /** The control beside the one above: the line is about a config, so no config, no line. */
    it("from a project with no config is told nothing about one", async () => {
      const { stderr, error } = await initFrom();

      expect(error).toBeUndefined();
      expect(stderr).not.toContain(ANY_OF_THE_LINES);
    });
  });

  /**
   * The permitted twin of the spec below: at HOME the config is the global installation however
   * empty, so an uninstall run there removes it, as the owner kept, and says no line of a project's.
   */
  it("uninstall run at HOME removes HOME's config that declares nothing, with no line", async () => {
    const configPath = await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({ name: "placeholder", skills: [], agents: [] }),
    );
    process.chdir(fakeHome);

    const { stderr, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(await fileExists(configPath), "HOME's config, however empty, is removed").toBe(false);
    expect(stderr).not.toContain(ANY_OF_THE_LINES);
  });

  it("uninstall leaves a global config that declares nothing too, a placeholder, where it is", async () => {
    await installAtHome(buildProjectConfig({ name: "placeholder", skills: [], agents: [] }));
    const without = await runCliCommand(["uninstall", "--yes"]);
    await declaresNothing();
    const projectBefore = await readInstallTree(projectDir);
    const homeBefore = await readInstallTree(fakeHome, NOT_HOMES_OWN);

    const declaringNothing = await runCliCommand(["uninstall", "--yes"]);

    expect(
      await readInstallTree(fakeHome, NOT_HOMES_OWN),
      "the placeholder at HOME is left as it was",
    ).toStrictEqual(homeBefore);
    expect(declaringNothing.stdout, "it says what it says with no config").toBe(without.stdout);
    expect(
      await readInstallTree(projectDir),
      "the project's config that declares nothing is left as it was",
    ).toStrictEqual(projectBefore);
  });

  it("beside a Codex installation in the same project, list reads that installation, as with the Claude config gone", async () => {
    await installAtHome(WITH_A_SUB_AGENT, CLAUDE_FOLDER);
    await installAtHome(WITH_A_SUB_AGENT, CODEX_FOLDER);
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: "codex-project" }),
      CODEX_FOLDER,
    );
    const claudeConfig = await declaresNothing(CLAUDE_FOLDER);
    const declaringNothing = await runCliCommand(["list"]);
    await rm(path.dirname(claudeConfig), { recursive: true });

    const without = await runCliCommand(["list"]);

    expect(without.stdout, "subject guard: list reads the project's Codex installation").toContain(
      path.join(projectDir, CODEX_FOLDER, "config.ts"),
    );
    expect(
      [declaringNothing.error?.message, declaringNothing.error?.oclif?.exit],
      "it ends as the run without the Claude config ends",
    ).toStrictEqual([without.error?.message, without.error?.oclif?.exit]);
    expect(
      declaringNothing.stdout,
      "the config that declares nothing does not stand in for the project's Codex installation",
    ).toBe(without.stdout);
  });
});
