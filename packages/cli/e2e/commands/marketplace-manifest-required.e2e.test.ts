import path from "path";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { CLI } from "../fixtures/cli.js";
import { createDualScopeEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL, E2E_STACK_DISPLAY } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  startTarballSourceServer,
  type TarballSourceServer,
} from "../helpers/tarball-source-server.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  flattenCliOutput,
  loadConfigOrFail,
  readTreeSnapshot,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import type { ProjectHandle } from "../pages/wizard-result.js";
import {
  E2E_MARKETPLACE_NAME,
  EXIT_CODES,
  MARKETPLACE_MANIFEST_PATH,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { createMockMarketplace } from "../../src/cli/lib/__tests__/factories/plugin-factories.js";
import "../matchers/setup.js";

/**
 * A custom marketplace — any marketplace other than the default public catalogue — must carry a
 * valid `.claude-plugin/marketplace.json`, and every command that loads one without it refuses.
 * Owner ruling 2026-10-02 (CLI-902, journey 18): "Why not just make it a requirement?", and an
 * invalid manifest is refused too.
 *
 * What it replaced: a folder nobody had built installed in Local mode, `search` labelled its
 * skills `agents-inc`, `doctor` passed without mentioning the file, and only a Plugin install
 * failed — after Confirm. So the refusal is pinned where a user meets it:
 *
 * - `init --marketplace`, `search`, `edit` and `eject skills` refuse, write nothing, and name the
 *   two builds that write the file, in the order an author runs them;
 * - `doctor` reports the finding against the file itself and still finishes its report;
 * - `uninstall` removes the installation regardless, and `compile` and `list` keep working.
 *
 * "Not valid" is three states — absent, unparseable, and parsed but refused by the schema — and
 * the loader reaches them by three different routes, so each is driven through the binary rather
 * than one standing in for the others.
 *
 * Every refusal has its permitted twin in this file: the same marketplace carrying the manifest
 * its own builds wrote. A guard that had swallowed every custom marketplace leaves an all-refusal
 * file reading exactly like this one.
 *
 * `init` and `edit` are run without a terminal, as `init-edit-error-guards` runs them: the refusal
 * lands during the load, before the wizard mounts, which is the only reason a run without a PTY
 * can show it at all — and a build that mounts the wizard instead dies on Ink's raw-mode error,
 * which this file's assertions read as the missing refusal it is.
 */

/** A manifest that parses and that the schema refuses: a marketplace must list a plugin. */
const MANIFEST_LISTING_NO_PLUGIN = JSON.stringify({
  ...createMockMarketplace([]),
  name: E2E_MARKETPLACE_NAME,
});

/** A manifest that does not parse at all. */
const MANIFEST_UNPARSEABLE = "{ this is not json";

type ManifestDefect = "absent" | "unparseable" | "refused by the schema";

const MANIFEST_DEFECTS = [
  "absent",
  "unparseable",
  "refused by the schema",
] as const satisfies readonly ManifestDefect[];

function manifestPathIn(source: E2ESource): string {
  return path.join(source.sourceDir, MARKETPLACE_MANIFEST_PATH);
}

/** Leaves `source`'s manifest in the state `defect` names, and the rest of the tree as built. */
async function breakManifest(source: E2ESource, defect: ManifestDefect): Promise<void> {
  const manifestPath = manifestPathIn(source);
  if (defect === "absent") {
    await rm(manifestPath, { force: true });
    return;
  }
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    defect === "unparseable" ? MANIFEST_UNPARSEABLE : MANIFEST_LISTING_NO_PLUGIN,
  );
}

/**
 * The refusal as a user reads it: the command did not succeed, and it named the two builds that
 * write the file, `build plugins` first.
 */
function expectRefusalNamingTheBuilds(exitCode: number, combined: string): void {
  const output = flattenCliOutput(combined);
  expect(
    output,
    "a marketplace with no valid marketplace.json must be refused, naming the build that starts the fix",
  ).toContain(STEP_TEXT.MANIFEST_REFUSAL_FIRST_BUILD);
  expect(
    output.indexOf(STEP_TEXT.MANIFEST_REFUSAL_SECOND_BUILD),
    "the refusal must name `build marketplace` after `build plugins`, the order an author runs them",
  ).toBeGreaterThan(output.indexOf(STEP_TEXT.MANIFEST_REFUSAL_FIRST_BUILD));
  expect(exitCode, "a refused marketplace must not exit clean").not.toBe(EXIT_CODES.SUCCESS);
}

describe("init --marketplace over a marketplace with no valid marketplace.json", () => {
  let tempDir: string | undefined;
  let source: E2ESource | undefined;
  let wizard: InitWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (source) await cleanupTempDir(source.tempDir);
    source = undefined;
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "refuses a folder nobody has built, before the wizard, writing nothing",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      source = await createE2ESource({ unbuilt: true });
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, combined } = await runCLI(
        ["init", "--marketplace", source.sourceDir],
        projectDir,
        { env: { HOME: tempDir } },
      );

      expectRefusalNamingTheBuilds(exitCode, combined);
      expect(
        await readTreeSnapshot(projectDir),
        "a refused marketplace must leave the project exactly as it found it",
      ).toStrictEqual({});
    },
  );

  it.each(MANIFEST_DEFECTS)(
    "refuses a built marketplace whose manifest is %s, writing nothing",
    { timeout: TIMEOUTS.INSTALL },
    async (defect) => {
      source = await createE2ESource();
      await breakManifest(source, defect);
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, combined } = await runCLI(
        ["init", "--marketplace", source.sourceDir],
        projectDir,
        { env: { HOME: tempDir } },
      );

      expectRefusalNamingTheBuilds(exitCode, combined);
      expect(
        await readTreeSnapshot(projectDir),
        "a refused marketplace must leave the project exactly as it found it",
      ).toStrictEqual({});
    },
  );

  it(
    "opens the wizard on the same marketplace once it carries the manifest its builds wrote",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      source = await createE2ESource();

      // `launch` returns once the stack step is ready, which a refused marketplace never paints.
      wizard = await InitWizard.launch({ source });

      expect(
        wizard.stack.getScreen(),
        "a built marketplace reaches the stack step, offering the stack it ships",
      ).toContain(E2E_STACK_DISPLAY);
    },
  );
});

describe("an installation whose marketplace has no valid marketplace.json", () => {
  let source: E2ESource;
  let wizard: InitWizard;
  let project: ProjectHandle;
  let builtManifest: string;

  /** The installation's two roots, which a refused command must leave as it found them. */
  async function installationSnapshot(): Promise<unknown> {
    return {
      project: await readTreeSnapshot(project.dir),
      global: project.globalHome === undefined ? {} : await readTreeSnapshot(project.globalHome),
    };
  }

  /** Runs `args` over the installation and holds it to the refusal and to having written nothing. */
  async function expectRefusedWritingNothing(args: string[]): Promise<void> {
    const before = await installationSnapshot();

    const { exitCode, output } = await CLI.run(args, project);

    expectRefusalNamingTheBuilds(exitCode, output);
    expect(
      await installationSnapshot(),
      `'${args.join(" ")}' was refused, so it must leave the installation exactly as it found it`,
    ).toStrictEqual(before);
  }

  beforeAll(async () => {
    source = await createE2ESource();
    builtManifest = await readFile(manifestPathIn(source), "utf-8");

    // Installed the way a user installs, from the marketplace while it is still valid — Local
    // rows, so no Claude CLI is involved — and broken afterwards: the state a folder installed
    // from before the rule, or one whose manifest was since removed, leaves behind.
    wizard = await InitWizard.launchInProject({ source });
    const result = await completeWithLocalSources(wizard);
    expect(await result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
    project = result.project;
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await wizard.destroy();
    await cleanupTempDir(source.tempDir);
  });

  describe("while the marketplace carries the manifest its builds wrote", () => {
    it("answers search out of it", async () => {
      const { exitCode, output } = await CLI.run(["search", E2E_SKILL.vitest.slug], project);

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output, "a valid marketplace's skills must be found").toContain(E2E_SKILL.vitest.id);
      expect(output).not.toContain(STEP_TEXT.MANIFEST_REFUSAL_FIRST_BUILD);
    });
  });

  describe.each(MANIFEST_DEFECTS)("once its manifest is %s", (defect) => {
    beforeAll(async () => {
      await breakManifest(source, defect);
    });

    afterAll(async () => {
      await writeFile(manifestPathIn(source), builtManifest);
    });

    it("is refused by search, writing nothing", async () => {
      await expectRefusedWritingNothing(["search", E2E_SKILL.vitest.slug]);
    });

    it("is refused by edit before the wizard, writing nothing", async () => {
      await expectRefusedWritingNothing(["edit"]);
    });

    it("is refused by eject skills, writing nothing", async () => {
      await expectRefusedWritingNothing(["eject", "skills"]);
    });

    it("is reported by doctor against the manifest, which still finishes its report", async () => {
      const { exitCode, output } = await CLI.run(["doctor"], project);

      const flat = flattenCliOutput(output);
      expect(
        flat,
        "doctor must file the finding against the manifest, as an error over an installation",
      ).toContain(`[ERROR] ${MARKETPLACE_MANIFEST_PATH}`);
      expect(flat, "doctor must name the build that writes the file").toContain(
        STEP_TEXT.MANIFEST_REFUSAL_FIRST_BUILD,
      );
      expect(flat, "doctor must finish its report rather than abort on the finding").toContain(
        STEP_TEXT.DOCTOR_SUMMARY,
      );
      expect(exitCode, "doctor must not exit clean over a marketplace nothing can load").not.toBe(
        EXIT_CODES.SUCCESS,
      );
    });
  });

  // The rule as the owner chose it keeps these two working: `compile` already carries on with the
  // catalogue it has when the marketplace will not load, and `list` reads the installation alone.
  describe("still recompiled and listed, once its manifest is absent", () => {
    beforeAll(async () => {
      await breakManifest(source, "absent");
    });

    afterAll(async () => {
      await writeFile(manifestPathIn(source), builtManifest);
    });

    it("still recompiles the installation with compile", async () => {
      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.COMPILE_COMPLETE);
    });

    it("still lists the installation with list", async () => {
      const { exitCode, output } = await CLI.run(["list"], project);

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output, "list reads the installation, not the marketplace").not.toContain(
        STEP_TEXT.MANIFEST_REFUSAL_FIRST_BUILD,
      );
    });
  });
});

describe("uninstall over an installation whose marketplace has no marketplace.json", () => {
  let source: E2ESource;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await env?.destroy();
    await cleanupTempDir(source.tempDir);
  });

  // A global installation with a project registered under it, because that is the one shape in
  // which `uninstall` loads the marketplace at all: it rebuilds each registered project's view of
  // the global entries it is removing. With nothing registered it never reads the marketplace,
  // and this leg would hold for a reason that has nothing to do with the manifest.
  //
  // So the registered project is held to the same prune it gets from a marketplace that still
  // carries its manifest (`uninstall-global-propagation`): every inlined global row gone, and
  // every row the project owns kept. A HOME-only assertion stayed green while the prune was
  // skipped with a warning, leaving the project naming a sub-agent and skills that were deleted.
  it(
    "removes a global installation regardless, and still prunes the project registered under it",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(source);
      const projectBefore = await loadConfigOrFail(env.projectDir);
      const projectOwnSkills = projectBefore.skills.filter((skill) => skill.scope === "project");
      const projectOwnAgents = projectBefore.agents.filter((agent) => agent.scope === "project");
      expect(
        projectBefore.skills.filter((skill) => skill.scope === "global"),
        "the registered project must carry inlined global rows, or there is no prune to observe",
      ).not.toStrictEqual([]);
      await breakManifest(source, "absent");

      const { exitCode, output } = await CLI.run(["uninstall", "--yes"], { dir: env.fakeHome });

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      await expectCleanUninstall(env.fakeHome, { removeConfig: true });

      expect(
        output,
        "the registered project must still be updated when the marketplace has no manifest",
      ).toContain(STEP_TEXT.UNINSTALL_PROJECTS_UPDATED_ONE);
      const projectAfter = await loadConfigOrFail(env.projectDir);
      expect(
        projectAfter.skills,
        "the prune must drop every inlined global skill row and keep the project's own",
      ).toStrictEqual(projectOwnSkills);
      expect(
        projectAfter.agents,
        "the prune must drop every inlined global sub-agent row and keep the project's own",
      ).toStrictEqual(projectOwnAgents);
    },
  );
});

describe("a remote marketplace served with no marketplace.json", () => {
  let unbuilt: E2ESource;
  let built: E2ESource;
  let server: TarballSourceServer;
  let tempDir: string;
  let project: ProjectHandle;

  beforeAll(async () => {
    unbuilt = await createE2ESource({ unbuilt: true });
    built = await createE2ESource();
    server = await startTarballSourceServer(unbuilt.sourceDir);
    tempDir = await createTempDir();
    // A HOME of its own: a remote marketplace is fetched into the HOME's cache, which is the
    // fetcher's business rather than the installation's, so the project is the tree held still.
    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });
    project = { dir: path.join(tempDir, "project"), globalHome: home };
    // `search` takes no marketplace flag, so the installation names the server, as `init` would.
    await writeProjectConfig(project.dir, {
      name: "remote-manifest-fixture",
      marketplace: server.url,
    });
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await server.close();
    await cleanupTempDir(unbuilt.tempDir);
    await cleanupTempDir(built.tempDir);
    await cleanupTempDir(tempDir);
  });

  it("is refused by search", async () => {
    const before = await readTreeSnapshot(project.dir);

    const { exitCode, output } = await CLI.run(["search", E2E_SKILL.vitest.slug], project);

    expectRefusalNamingTheBuilds(exitCode, output);
    expect(
      await readTreeSnapshot(project.dir),
      "a refused marketplace must leave the project exactly as it found it",
    ).toStrictEqual(before);
  });

  it("is answered out of by search once the server publishes the built marketplace", async () => {
    await server.publish(built.sourceDir);

    const { exitCode, output } = await CLI.run(["search", E2E_SKILL.vitest.slug], project);

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output, "a valid marketplace's skills must be found").toContain(E2E_SKILL.vitest.id);
  });
});
