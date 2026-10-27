import path from "path";
import { mkdir } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { fileExists } from "../test-fs-utils";
import { buildProjectConfig } from "../factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import {
  cleanupTestSource,
  createTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";

/**
 * CLI-931, owner 2026-10-24 (replacing 2026-10-23's "disregard old .claude-src folders"): the oclif
 * `init` hook runs before every command, and prints one line per root holding an old `.claude-src/`,
 * HOME's first, saying it is ignored and naming the folder agents-inc reads there, with or without an
 * installation beside it. Nothing else the run prints changes. Each spec runs the command without the
 * folder first and holds the run with it to that one; the line is asserted last.
 *
 * CLI-965, the same ruling ("name where it reads"): in a root holding a Codex installation, agents-inc
 * reads `.agents-inc/codex/`, so that root's line names it. Each Codex row's root holds a Codex
 * installation and nothing else.
 *
 * CLI-967, the same ruling: on the `init --from --provider codex` run that creates a Codex
 * installation in roots holding none, agents-inc reads `.agents-inc/codex/` in each, so each line
 * names it on that run, not only on the next.
 *
 * CLI-977, owner 2026-10-24 ("Follow the project's tool"): on a run naming no provider, HOME's line
 * names the folder in HOME for the project's tool, the one this run reads there, even where HOME
 * holds the other tool's installation or both. A run naming a provider names that provider's folder
 * in both lines, whatever the project's tool.
 *
 * CLI-971, owner 2026-10-24 ("Never count it, and say so"): a project config declaring no skill and
 * no sub-agent is not the project's installation. On a run naming no provider, a project holding
 * nothing else is read as one holding none, so HOME's line names HOME's own folder and the
 * project's names the folder that config sits in; a project holding another provider's installation
 * beside it is read as that installation alone, so both lines name that installation's folder.
 *
 * Where the run stands is pinned as it behaves today: a project under HOME is named by its absolute
 * path, and a run from a folder inside a project checks that folder and HOME, not the project above.
 */

/** Literals, as an older release and the product write them: read off the product, they would move with it. */
const OLD_SOURCE_FOLDER = ".claude-src";
const CLAUDE_FOLDER = ".agents-inc/claude";
const CODEX_FOLDER = ".agents-inc/codex";

/** How the line names the home directory; a project is named by its absolute path. */
const HOME_SHORTHAND = "~";

const SEED_ID = "OldFolderCodex";

/** One root's line, written out whole; `e2e/pages/constants.ts` mirrors it as `oldSourceFolderIgnored`. */
function ignoredLine(root: string, readFrom: typeof CLAUDE_FOLDER | typeof CODEX_FOLDER): string {
  return `${root}/.claude-src/ is ignored; agents-inc reads ${root}/${readFrom}/. Delete the old folder once you have kept anything you need from it.\n`;
}

async function installIn(
  roots: readonly string[],
  folder: typeof CLAUDE_FOLDER | typeof CODEX_FOLDER,
): Promise<void> {
  await Promise.all(
    roots.map((root) =>
      writeTestTsConfig(root, buildProjectConfig({ name: "installation" }), folder),
    ),
  );
}

async function oldFolderIn(roots: readonly string[]): Promise<void> {
  await Promise.all(roots.map((root) => mkdir(path.join(root, OLD_SOURCE_FOLDER))));
}

describe("an old .claude-src folder", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-old-source-folder-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  it.each([
    {
      holder: "the project",
      roots: () => [projectDir],
      lines: () => [ignoredLine(projectDir, CLAUDE_FOLDER)],
    },
    {
      holder: "the home directory",
      roots: () => [fakeHome],
      lines: () => [ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER)],
    },
    {
      holder: "the project and the home directory",
      roots: () => [projectDir, fakeHome],
      lines: () => [
        ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER),
        ignoredLine(projectDir, CLAUDE_FOLDER),
      ],
    },
  ])(
    "in $holder is named as ignored ahead of a named command, which prints what it prints without one",
    async ({ roots, lines }) => {
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "installation" }));
      const without = await runCliCommand(["list"]);
      await oldFolderIn(roots());

      const withOld = await runCliCommand(["list"]);

      expect(without.error).toBeUndefined();
      expect(without.stdout, "list printed the installation it found").not.toBe("");
      expect(without.stderr, "a run with no old folder names none").not.toContain(
        OLD_SOURCE_FOLDER,
      );
      expect(withOld.error).toBeUndefined();
      expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
      expect(
        withOld.stderr,
        "stderr opens with one line per root holding the old folder, HOME's first, then is what it is without it",
      ).toBe([...lines(), without.stderr].join(""));
    },
  );

  it("is named, and not read, where it is all there is: a run naming no command shows the root help", async () => {
    const without = await runCliCommand([]);
    await oldFolderIn([projectDir, fakeHome]);

    const withOld = await runCliCommand([]);

    expect(without.stdout).toContain("USAGE\n  $ agents-inc [COMMAND]");
    expect(without.stderr, "a run with no old folder names none").not.toContain(OLD_SOURCE_FOLDER);
    expect(withOld.error).toBeUndefined();
    expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
    expect(
      withOld.stderr,
      "stderr opens with HOME's line and then the project's, then is what it is without it",
    ).toBe(
      [
        ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER),
        ignoredLine(projectDir, CLAUDE_FOLDER),
        without.stderr,
      ].join(""),
    );
  });

  it("in the home directory is named once, as the home directory's, on a run from there", async () => {
    process.chdir(fakeHome);
    const without = await runCliCommand(["list"]);
    await oldFolderIn([fakeHome]);

    const withOld = await runCliCommand(["list"]);

    expect(without.error).toBeUndefined();
    expect(without.stdout, "list reported what it found from the home directory").not.toBe("");
    expect(without.stderr, "a run with no old folder names none").not.toContain(OLD_SOURCE_FOLDER);
    expect(withOld.error).toBeUndefined();
    expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
    expect(
      withOld.stderr,
      "the home directory is the run's root as well, and holds one folder, so it gets one line",
    ).toBe([ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER), without.stderr].join(""));
  });

  describe("beside a Codex installation", () => {
    it.each([
      {
        holder: "the project",
        roots: () => [projectDir],
        lines: () => [ignoredLine(projectDir, CODEX_FOLDER)],
      },
      {
        holder: "the home directory",
        roots: () => [fakeHome],
        lines: () => [ignoredLine(HOME_SHORTHAND, CODEX_FOLDER)],
      },
      {
        holder: "the project and the home directory",
        roots: () => [projectDir, fakeHome],
        lines: () => [
          ignoredLine(HOME_SHORTHAND, CODEX_FOLDER),
          ignoredLine(projectDir, CODEX_FOLDER),
        ],
      },
    ])(
      "in $holder names the Codex folder agents-inc reads there, and the run prints what it prints without one",
      async ({ roots, lines }) => {
        await installIn(roots(), CODEX_FOLDER);
        const without = await runCliCommand(["list"]);
        await oldFolderIn(roots());

        const withOld = await runCliCommand(["list"]);

        expect(without.error).toBeUndefined();
        expect(without.stdout, "list read a Codex installation").toContain(
          `${CODEX_FOLDER}/config.ts`,
        );
        expect(without.stdout, "list read no Claude installation").not.toContain(CLAUDE_FOLDER);
        expect(without.stderr, "a run with no old folder names none").not.toContain(
          OLD_SOURCE_FOLDER,
        );
        expect(withOld.error).toBeUndefined();
        expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
        expect(
          withOld.stderr,
          "stderr opens with one line per root holding the old folder, HOME's first, each naming the Codex folder agents-inc reads in that root",
        ).toBe([...lines(), without.stderr].join(""));
      },
    );
  });

  describe("where the home directory and the project are on different tools", () => {
    it.each([
      {
        tool: "Codex",
        homeHolds: "both installations",
        home: [CLAUDE_FOLDER, CODEX_FOLDER],
        project: CODEX_FOLDER,
      },
      {
        tool: "Codex",
        homeHolds: "a Claude installation alone",
        home: [CLAUDE_FOLDER],
        project: CODEX_FOLDER,
      },
      {
        tool: "Claude",
        homeHolds: "a Codex installation alone",
        home: [CODEX_FOLDER],
        project: CLAUDE_FOLDER,
      },
      {
        tool: "Claude",
        homeHolds: "both installations",
        home: [CLAUDE_FOLDER, CODEX_FOLDER],
        project: CLAUDE_FOLDER,
      },
    ] as const)(
      "in a $tool project under a home directory holding $homeHolds, both lines name the folder for the project's tool, HOME's first, and the run prints what it prints without one",
      async ({ home, project }) => {
        await installIn([projectDir], project);
        for (const folder of home) await installIn([fakeHome], folder);
        const without = await runCliCommand(["list"]);
        await oldFolderIn([projectDir, fakeHome]);

        const withOld = await runCliCommand(["list"]);

        expect(without.error).toBeUndefined();
        expect(without.stdout, "list read the project's own installation").toContain(
          path.join(projectDir, project, "config.ts"),
        );
        expect(without.stderr, "a run with no old folder names none").not.toContain(
          OLD_SOURCE_FOLDER,
        );
        expect(withOld.error).toBeUndefined();
        expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
        expect(
          withOld.stderr,
          "HOME's line names HOME's folder for the project's tool, whatever HOME holds, and the project's names its own",
        ).toBe(
          [
            ignoredLine(HOME_SHORTHAND, project),
            ignoredLine(projectDir, project),
            without.stderr,
          ].join(""),
        );
      },
    );

    it("in a Codex project under a home directory holding both installations, both lines name the folder for the provider a run names instead", async () => {
      await installIn([projectDir], CODEX_FOLDER);
      await installIn([fakeHome], CLAUDE_FOLDER);
      await installIn([fakeHome], CODEX_FOLDER);
      const without = await runCliCommand(["list", "--provider", "claude"]);
      await oldFolderIn([projectDir, fakeHome]);

      const withOld = await runCliCommand(["list", "--provider", "claude"]);

      expect(without.error).toBeUndefined();
      expect(without.stdout, "list read HOME's Claude installation").toContain(
        path.join(fakeHome, CLAUDE_FOLDER, "config.ts"),
      );
      expect(without.stderr, "a run with no old folder names none").not.toContain(
        OLD_SOURCE_FOLDER,
      );
      expect(withOld.error).toBeUndefined();
      expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
      expect(
        withOld.stderr,
        "a run naming a provider reads that provider's folder in every root, whatever the project's tool",
      ).toBe(
        [
          ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER),
          ignoredLine(projectDir, CLAUDE_FOLDER),
          without.stderr,
        ].join(""),
      );
    });
  });

  describe("where the project's config declares nothing", () => {
    async function declaringNothingIn(folder: typeof CLAUDE_FOLDER | typeof CODEX_FOLDER) {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "declares-nothing", skills: [], agents: [] }),
        folder,
      );
    }

    it.each([
      {
        homeHolds: "a Claude installation alone",
        home: [CLAUDE_FOLDER],
        project: CODEX_FOLDER,
        homeReads: CLAUDE_FOLDER,
      },
      {
        homeHolds: "a Codex installation alone",
        home: [CODEX_FOLDER],
        project: CLAUDE_FOLDER,
        homeReads: CODEX_FOLDER,
      },
      {
        homeHolds: "both installations",
        home: [CLAUDE_FOLDER, CODEX_FOLDER],
        project: CODEX_FOLDER,
        homeReads: CLAUDE_FOLDER,
      },
    ] as const)(
      "on the other tool from a home directory holding $homeHolds, HOME's line names the folder of the installation the run reads there",
      async ({ home, project, homeReads }) => {
        await declaringNothingIn(project);
        for (const folder of home) await installIn([fakeHome], folder);
        const without = await runCliCommand(["list"]);
        await oldFolderIn([projectDir, fakeHome]);

        const withOld = await runCliCommand(["list"]);

        expect(without.error).toBeUndefined();
        expect(without.stdout, "list read HOME's installation").toContain(
          path.join(fakeHome, homeReads, "config.ts"),
        );
        expect(without.stderr, "a run with no old folder names none").not.toContain(
          OLD_SOURCE_FOLDER,
        );
        expect(withOld.error).toBeUndefined();
        expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
        expect(
          withOld.stderr,
          "HOME's line names HOME's own folder, as for a project holding no installation, and the project's names the folder its config is in",
        ).toBe(
          [
            ignoredLine(HOME_SHORTHAND, homeReads),
            ignoredLine(projectDir, project),
            without.stderr,
          ].join(""),
        );
      },
    );

    it("on Codex, under a home directory holding nothing, HOME's line names the Claude folder, as for a project holding no installation", async () => {
      await declaringNothingIn(CODEX_FOLDER);
      const without = await runCliCommand(["list"]);
      await oldFolderIn([projectDir, fakeHome]);

      const withOld = await runCliCommand(["list"]);

      expect(without.stderr, "a run with no old folder names none").not.toContain(
        OLD_SOURCE_FOLDER,
      );
      expect(withOld.error?.message).toBe(without.error?.message);
      expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
      expect(
        withOld.stderr,
        "HOME's line names the folder of HOME's own tool, and the project's names the folder its config is in",
      ).toBe(
        [
          ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER),
          ignoredLine(projectDir, CODEX_FOLDER),
          without.stderr,
        ].join(""),
      );
    });

    it("beside the project's own Codex installation, under a home directory holding both, both lines name the Codex folder, as for the Codex project alone", async () => {
      await installIn([projectDir], CODEX_FOLDER);
      await declaringNothingIn(CLAUDE_FOLDER);
      await installIn([fakeHome], CLAUDE_FOLDER);
      await installIn([fakeHome], CODEX_FOLDER);
      const without = await runCliCommand(["list"]);
      await oldFolderIn([projectDir, fakeHome]);

      const withOld = await runCliCommand(["list"]);

      expect(without.error).toBeUndefined();
      expect(without.stderr, "a run with no old folder names none").not.toContain(
        OLD_SOURCE_FOLDER,
      );
      expect(withOld.error).toBeUndefined();
      expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
      expect(
        withOld.stderr,
        "the config declaring nothing is not the project's installation, so both lines name the folder of the Codex one the run reads",
      ).toBe(
        [
          ignoredLine(HOME_SHORTHAND, CODEX_FOLDER),
          ignoredLine(projectDir, CODEX_FOLDER),
          without.stderr,
        ].join(""),
      );
    });
  });

  describe("where the run stands", () => {
    it("in a project inside the home directory is named by the project's absolute path, and HOME as ~", async () => {
      const projectInsideHome = path.join(fakeHome, "dev", "project");
      await mkdir(projectInsideHome, { recursive: true });
      process.chdir(projectInsideHome);
      await installIn([projectInsideHome, fakeHome], CLAUDE_FOLDER);
      const without = await runCliCommand(["list"]);
      await oldFolderIn([projectInsideHome, fakeHome]);

      const withOld = await runCliCommand(["list"]);

      expect(without.error).toBeUndefined();
      expect(without.stdout, "list read the project's own installation").toContain(
        path.join(projectInsideHome, CLAUDE_FOLDER, "config.ts"),
      );
      expect(without.stderr, "a run with no old folder names none").not.toContain(
        OLD_SOURCE_FOLDER,
      );
      expect(withOld.error).toBeUndefined();
      expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
      expect(
        withOld.stderr,
        "HOME is written ~, and a project inside it by its absolute path rather than from ~",
      ).toBe(
        [
          ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER),
          ignoredLine(projectInsideHome, CLAUDE_FOLDER),
          without.stderr,
        ].join(""),
      );
    });

    it("in a project is not named on a run from a folder inside it, whose roots are that folder and HOME", async () => {
      const folderInsideTheProject = path.join(projectDir, "src");
      await mkdir(folderInsideTheProject);
      process.chdir(folderInsideTheProject);
      await installIn([projectDir, fakeHome], CLAUDE_FOLDER);
      const without = await runCliCommand(["list"]);
      await oldFolderIn([projectDir, fakeHome]);

      const withOld = await runCliCommand(["list"]);

      expect(without.error).toBeUndefined();
      expect(without.stdout, "list printed the installation it found").not.toBe("");
      expect(without.stderr, "a run with no old folder names none").not.toContain(
        OLD_SOURCE_FOLDER,
      );
      expect(withOld.error).toBeUndefined();
      expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
      expect(
        withOld.stderr,
        "a run from a folder inside the project checks that folder and HOME, not the project above it, so HOME's line is the only one",
      ).toBe([ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER), without.stderr].join(""));
    });
  });

  /** The run without the old folder is the same command in roots of its own, since it installs. */
  describe("on the init --from run that names the provider it installs", () => {
    // Ahead of the worker's listen, so yoga's wasm is loaded before it can intercept that fetch and
    // print to the stderr this row pins, which a retry would otherwise absorb. The finding:
    // 2026-10-22-a-command-spec-asserting-stderr-exactly-fails-its-first-attempt-when-it-is-the-first-ink-render-in-its-worker
    beforeAll(async () => {
      await import("ink");
    });
    useMockWorker();
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
                scope: "global",
                assignments: { "web-developer": "lazy" },
              }),
              [testMarketplaceSkillId("api-framework-hono")]: buildSeedSkill({
                install: "eject",
                scope: "project",
                assignments: { "api-developer": "lazy" },
              }),
            },
            agents: { "web-developer": { scope: "global" }, "api-developer": { scope: "project" } },
          }),
        ),
      );
    });

    afterEach(async () => {
      await cleanupTestSource(dirs);
    });

    function initFromOnCodex() {
      return runCliCommand([
        "init",
        "--from",
        SEED_ID,
        "--marketplace",
        dirs.sourceDir,
        "--provider",
        "codex",
      ]);
    }

    it("names in each root the Codex folder the run creates there, HOME's line first, and the run prints what it prints without one", async () => {
      const twin = await setupIsolatedHome("cc-old-source-folder-twin-");
      const without = await initFromOnCodex();
      await twin.cleanup();
      await oldFolderIn([projectDir, fakeHome]);

      const withOld = await initFromOnCodex();

      expect(without.error).toBeUndefined();
      expect(without.stderr, "a run with no old folder names none").not.toContain(
        OLD_SOURCE_FOLDER,
      );
      expect(withOld.error).toBeUndefined();
      expect(
        await fileExists(path.join(fakeHome, CODEX_FOLDER, "config.ts")),
        "subject guard: the run installed HOME on the Codex folder",
      ).toBe(true);
      expect(
        await fileExists(path.join(projectDir, CODEX_FOLDER, "config.ts")),
        "subject guard: the run installed the project on the Codex folder",
      ).toBe(true);
      expect(
        await fileExists(path.join(fakeHome, CLAUDE_FOLDER, "config.ts")),
        "HOME holds no Claude installation",
      ).toBe(false);
      expect(
        await fileExists(path.join(projectDir, CLAUDE_FOLDER, "config.ts")),
        "the project holds no Claude installation",
      ).toBe(false);
      expect(
        withOld.stderr,
        "stderr opens with one line per root, HOME's first, each naming the Codex folder the run installs into there, then is what it is without the old folder",
      ).toBe(
        [
          ignoredLine(HOME_SHORTHAND, CODEX_FOLDER),
          ignoredLine(projectDir, CODEX_FOLDER),
          without.stderr,
        ].join(""),
      );
    });
  });
});
