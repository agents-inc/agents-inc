import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { matrixSchema } from "@workspace/matrix/matrix-schema";
import { CLI } from "../fixtures/cli.js";
import {
  cleanupTempDir,
  createTempDir,
  directoryExists,
  fileExists,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readMarketplaceJson,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  DIRS,
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  FILES,
  SOURCE_PATHS,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";

/**
 * The arc `new marketplace` exists to open: a directory that did not exist becomes
 * one `doctor` accepts, `build plugins` compiles, `build marketplace` publishes,
 * and `init --marketplace` installs from.
 *
 * The round trip is the point. A scaffold asserted file-by-file passes while
 * producing a marketplace no command downstream will read — the command deleted in
 * `95738763` had specs that checked `config/stacks.ts` existed and never that
 * anything could load it.
 */

/**
 * The name every marketplace scaffolded here publishes under.
 *
 * Carries {@link E2E_MARKETPLACE_PREFIX} so `e2e/global-setup.ts`'s registration
 * sweep still matches it, for the same reason the fixture marketplace does.
 */
const MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}scaffold`;

/**
 * The one skill a scaffold ships, in its marketplace's own namespace.
 *
 * Composed rather than written out: the prefix and the marketplace name are one
 * string, and an id spelled whole would agree with a scaffold that had stopped
 * namespacing.
 */
const EXAMPLE_SKILL_ID = `${MARKETPLACE_NAME}-example-skill`;

/** The one stack a scaffold ships, composed for the same reason the skill id is. */
const SCAFFOLDED_STACK_ID = `${MARKETPLACE_NAME}-starter`;

/**
 * The one category a scaffold declares, and the only one its skill is in.
 *
 * Spelled rather than composed: it carries the domain a scaffold picks and not
 * the marketplace's name, so building it from {@link MARKETPLACE_NAME} would be
 * a different string that happened to be right about nothing.
 */
const SCAFFOLDED_CATEGORY_ID = "web-example";

/**
 * The three names `build marketplace` refuses. Spelled out rather than imported:
 * the rule is these strings, and a test reading the product's own list would agree
 * with any list it grew.
 */
const RESERVED_MARKETPLACE_NAMES = ["agents-inc", "external", "local"] as const;

/** Every file `docs/guides/creating-a-marketplace.md` promises a marketplace holds. */
const PROMISED_FILES = [
  FILES.PACKAGE_JSON,
  SOURCE_PATHS.SKILL_CATEGORIES,
  SOURCE_PATHS.SKILL_RULES,
  SOURCE_PATHS.STACKS_FILE,
  path.join(SOURCE_PATHS.SKILLS_DIR, EXAMPLE_SKILL_ID, FILES.SKILL_MD),
  path.join(SOURCE_PATHS.SKILLS_DIR, EXAMPLE_SKILL_ID, FILES.METADATA_YAML),
] as const;

/** The three config files whose loader unwraps a default export and nothing else. */
const CONFIG_FILES = [
  SOURCE_PATHS.SKILL_CATEGORIES,
  SOURCE_PATHS.SKILL_RULES,
  SOURCE_PATHS.STACKS_FILE,
] as const;

describe("new marketplace — refusals", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("refuses a name that is not kebab-case, and writes nothing", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["new", "marketplace", "NotKebab"], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("kebab-case");
    expect(await listFiles(tempDir), "a refused scaffold must write nothing").toStrictEqual([]);
  });

  it.each(RESERVED_MARKETPLACE_NAMES)(
    "refuses the reserved name '%s', saying why, and writes nothing",
    async (reservedName) => {
      tempDir = await createTempDir();

      const { exitCode, output } = await CLI.run(["new", "marketplace", reservedName], {
        dir: tempDir,
      });

      expect(exitCode, output).toBe(EXIT_CODES.ERROR);
      expect(output).toContain("reserved");
      expect(
        await listFiles(tempDir),
        "a name that could never be published must leave no directory behind",
      ).toStrictEqual([]);
    },
  );

  it("refuses a target that already holds something, leaving it exactly as it was", async () => {
    tempDir = await createTempDir();
    const occupied = path.join(tempDir, MARKETPLACE_NAME);
    const occupantPackageJson = `{ "name": "${MARKETPLACE_NAME}", "version": "9.9.9" }\n`;
    await mkdir(occupied, { recursive: true });
    await writeFile(path.join(occupied, FILES.PACKAGE_JSON), occupantPackageJson);

    const { exitCode, output } = await CLI.run(["new", "marketplace", MARKETPLACE_NAME], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.ERROR);
    expect(output, "the refusal must name the directory it is about").toContain(occupied);
    expect(
      await listFiles(occupied),
      "what the directory already held is the reason for the refusal, so it stays",
    ).toStrictEqual([FILES.PACKAGE_JSON]);
    expect(
      await readTestFile(path.join(occupied, FILES.PACKAGE_JSON)),
      "a refused scaffold must not have overwritten the author's own file",
    ).toBe(occupantPackageJson);
  });

  it("scaffolds into a directory that exists and is empty", async () => {
    tempDir = await createTempDir();
    await mkdir(path.join(tempDir, MARKETPLACE_NAME), { recursive: true });

    const { exitCode, output } = await CLI.run(["new", "marketplace", MARKETPLACE_NAME], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(await fileExists(path.join(tempDir, MARKETPLACE_NAME, FILES.PACKAGE_JSON))).toBe(true);
  });
});

describe("new marketplace — what it writes", () => {
  let tempDir: string;
  let marketplaceDir: string;

  beforeAll(async () => {
    tempDir = await createTempDir();
    marketplaceDir = path.join(tempDir, MARKETPLACE_NAME);
    const scaffold = await CLI.run(["new", "marketplace", MARKETPLACE_NAME], { dir: tempDir });
    expect(scaffold.exitCode, scaffold.output).toBe(EXIT_CODES.SUCCESS);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it.each(PROMISED_FILES)("writes %s", async (relPath) => {
    expect(await fileExists(path.join(marketplaceDir, relPath))).toBe(true);
  });

  it("names the marketplace in package.json, with the fields the build reads", async () => {
    const pkg: unknown = JSON.parse(
      await readTestFile(path.join(marketplaceDir, FILES.PACKAGE_JSON)),
    );

    expect(pkg).toMatchObject({
      name: MARKETPLACE_NAME,
      version: expect.any(String),
      description: expect.any(String),
    });
  });

  it("ships one skill, whose directory carries the marketplace's namespace", async () => {
    expect(await listFiles(path.join(marketplaceDir, SOURCE_PATHS.SKILLS_DIR))).toStrictEqual([
      EXAMPLE_SKILL_ID,
    ]);
  });

  it("declares that same namespaced id in the skill's own frontmatter", async () => {
    const skillMd = await readTestFile(
      path.join(marketplaceDir, SOURCE_PATHS.SKILLS_DIR, EXAMPLE_SKILL_ID, FILES.SKILL_MD),
    );

    expect(skillMd).toContain(`name: ${EXAMPLE_SKILL_ID}`);
  });

  it("writes a rules file carrying a version and no relationships", async () => {
    const rules = await readTestFile(path.join(marketplaceDir, SOURCE_PATHS.SKILL_RULES));

    expect(rules).toContain("1.0.0");
    expect(
      rules,
      "a marketplace cannot name its own skills in a rule yet, so the emitted data declares no relationships key at all",
    ).not.toContain('"relationships"');
  });

  it.each(CONFIG_FILES)("writes %s as a default export", async (relPath) => {
    expect(
      await readTestFile(path.join(marketplaceDir, relPath)),
      "a named export loads as no config at all",
    ).toContain("export default");
  });

  it("does not leave the marketplace looking like an installation", async () => {
    expect(
      await directoryExists(path.join(marketplaceDir, DIRS.CLAUDE_SRC)),
      "a marketplace is a repository of skills, not a project with skills installed in it",
    ).toBe(false);
  });
});

describe("new marketplace — round trip through the commands downstream", () => {
  let tempDir: string;
  let projectTempDir: string;
  let marketplaceDir: string;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    tempDir = await createTempDir();
    marketplaceDir = path.join(tempDir, MARKETPLACE_NAME);
    const scaffold = await CLI.run(["new", "marketplace", MARKETPLACE_NAME], { dir: tempDir });
    expect(scaffold.exitCode, scaffold.output).toBe(EXIT_CODES.SUCCESS);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (projectTempDir) await cleanupTempDir(projectTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "passes doctor, builds a plugin per skill, and publishes every one of them",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const doctor = await CLI.run(["doctor"], { dir: marketplaceDir });
      expect(
        doctor.exitCode,
        `doctor must accept a directory this CLI just scaffolded:\n${doctor.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      expect(doctor.stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(
        doctor.stdout,
        "a freshly scaffolded marketplace has no installation to be operational about",
      ).toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);

      const buildPlugins = await CLI.run(["build", "plugins"], { dir: marketplaceDir });
      expect(buildPlugins.exitCode, buildPlugins.output).toBe(EXIT_CODES.SUCCESS);
      expect(await listFiles(path.join(marketplaceDir, SOURCE_PATHS.PLUGINS_DIST))).toStrictEqual([
        EXAMPLE_SKILL_ID,
      ]);

      const buildMarketplace = await CLI.run(["build", "marketplace"], { dir: marketplaceDir });
      expect(
        buildMarketplace.exitCode,
        `the namespace guard must not refuse ids this CLI itself wrote:\n${buildMarketplace.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      const marketplace = await readMarketplaceJson(
        path.join(marketplaceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, FILES.MARKETPLACE_JSON),
      );
      expect(marketplace.name).toBe(MARKETPLACE_NAME);
      expect(marketplace.plugins.map((plugin) => plugin.name)).toStrictEqual([EXAMPLE_SKILL_ID]);
      expect(
        marketplace.owner.name,
        "an empty owner name fails the schema the CLI reads a marketplace.json back with, so the published marketplace would load as none at all",
      ).not.toBe("");

      // The other end of the arc: building must not have left the repository in a
      // state its own author's check rejects.
      const afterBuild = await CLI.run(["doctor"], { dir: marketplaceDir });
      expect(
        afterBuild.exitCode,
        `doctor must still pass over a marketplace that has been built:\n${afterBuild.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
    },
  );

  it("emits a catalog the editor's own contract accepts, carrying only what this marketplace ships", async () => {
    const catalogPath = path.join(
      marketplaceDir,
      SOURCE_PATHS.PLUGIN_MANIFEST_DIR,
      FILES.CATALOG_JSON,
    );

    const parsed = matrixSchema.safeParse(JSON.parse(await readTestFile(catalogPath)));
    expect(
      parsed.error?.issues ?? [],
      "the editor fetches this file and safeParses it with no transform in between",
    ).toStrictEqual([]);

    expect(Object.keys(parsed.data?.skills ?? {})).toStrictEqual([EXAMPLE_SKILL_ID]);
    expect(
      parsed.data?.suggestedStacks.map((stack) => stack.id),
      "a marketplace's stacks are the ones its own config/stacks.ts declares",
    ).toStrictEqual([SCAFFOLDED_STACK_ID]);
    expect(
      Object.keys(parsed.data?.categories ?? {}),
      "a consumer reading this file must not be offered categories the marketplace ships nothing in",
    ).toStrictEqual([SCAFFOLDED_CATEGORY_ID]);
  });

  it(
    "installs into a project, which records the marketplace and holds its skill",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      projectTempDir = await createTempDir();
      wizard = await InitWizard.launchInProject({
        source: { sourceDir: marketplaceDir, tempDir },
        projectDir: projectTempDir,
      });
      const globalHome = wizard.globalHome;

      // Not `completeWithLocalSources`: that helper waits on "Framework" and steps
      // through three domains, both properties of the fixture marketplace's own
      // categories. A scaffolded marketplace declares one category of its own, so
      // the walk here waits on the build step's own footer and advances until the
      // Sources step announces itself.
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.advanceTo(STEP_TEXT.BUILD_FOOTER);
      const sources = await build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();

      expect(
        await result.exitCode,
        `init from a scaffolded marketplace failed:\n${result.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      expect(result.rawOutput).toContain(STEP_TEXT.INIT_SUCCESS);

      expect(
        (await loadConfigOrFail(globalHome)).marketplace,
        "the install must record the marketplace it read",
      ).toBe(marketplaceDir);
      expect(
        await listFiles(skillsPath(globalHome)),
        "the scaffolded skill must reach disk under the id its marketplace publishes",
      ).toStrictEqual([EXAMPLE_SKILL_ID]);
      expect(Object.keys(await readCompiledAgents(globalHome)).length).toBeGreaterThan(0);

      await result.destroy();
    },
  );
});
