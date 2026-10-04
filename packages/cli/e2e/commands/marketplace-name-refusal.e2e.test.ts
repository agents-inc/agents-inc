import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  injectMarketplaceIntoConfig,
  readTestFile,
  readTreeSnapshot,
  runCLI,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import {
  E2E_MARKETPLACE_NAME,
  EXIT_CODES,
  FILES,
  SOURCE_PATHS,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * The name a `marketplace.json` publishes under is the namespace Claude Code registers
 * every plugin in, and the CLI piggybacks on what Claude Code accepts (owner ruling
 * 2026-08-20). `marketplaceSchema` has held the name to kebab-case since; what this file
 * pins is that the refusal REACHES the person running the command, on the two surfaces
 * that resolve a marketplace without reading a full installation.
 *
 * The discriminating assertion is `doctor`'s own row rather than the warning: a warning
 * about the manifest was printed all along, directly above `Marketplaces ✓ 1 marketplace
 * validated`, and the tick beside it was the defect.
 *
 * Every leg has its accepted-name twin in this same file. A guard scoped to the name and
 * one that has swallowed every manifest leave an all-refusal file reading identically, and
 * the second marketplace here differs from the first in exactly this one field.
 *
 * The second block is a name of the right SHAPE that is reserved: `eject`, the `origin` a
 * config records for a skill copied into an installation rather than installed as a plugin.
 * Every skill such a marketplace installed was recorded as an ejected copy, so a configuration
 * asking for a plugin got `Install mode: Eject (local copy)`, a copy on disk and exit 0, with
 * nothing said about the swap. It is refused on load in the reserved-name words
 * `build marketplace` refuses to publish it with.
 */

/** A name Claude Code registers no plugin under, and the same name written the way it does. */
const NAME_REFUSED = "Acme_Skills";
const NAME_ACCEPTED = "acme-skills";

/** The word the refusal has to reach for, since the rule — not the regex — is the fix. */
const RULE_STATED = "kebab-case";

/** The Marketplaces row's clean verdict, which a refused manifest must not earn. */
const MARKETPLACES_ROW_CLEAN = "marketplace validated";

/** Publishes the fixture marketplace under `name`, replacing whatever manifest it had. */
async function publishUnder(source: E2ESource, name: string): Promise<void> {
  const manifestDir = path.join(source.sourceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR);
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    path.join(manifestDir, FILES.MARKETPLACE_JSON),
    JSON.stringify({
      name,
      version: "1.0.0",
      owner: { name: "E2E Fixture" },
      plugins: [{ name: E2E_SKILL.react.id, source: `./src/skills/${E2E_SKILL.react.id}` }],
    }),
  );
}

describe("a marketplace whose manifest names it something Claude Code cannot register", () => {
  let source: E2ESource;
  let project: { dir: string };
  let projectTempDir: string;

  beforeAll(async () => {
    source = await createE2ESource();
    project = await ProjectBuilder.editable({
      marketplace: source.sourceDir,
      skills: [E2E_SKILL.react.id],
      agents: ["web-developer"],
    });
    projectTempDir = path.dirname(project.dir);
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupTempDir(source.tempDir);
    await cleanupTempDir(projectTempDir);
  });

  it("is refused by search, which must not answer out of it", async () => {
    await publishUnder(source, NAME_REFUSED);

    const { exitCode, combined } = await runCLI(["search", E2E_SKILL.react.slug], project.dir, {
      env: { HOME: project.dir },
    });

    const output = flattenCliOutput(combined);
    expect(
      exitCode,
      "a marketplace nothing can be installed from must not answer a query",
    ).not.toBe(EXIT_CODES.SUCCESS);
    expect(output, "the manifest holding the name must be named").toContain(FILES.MARKETPLACE_JSON);
    expect(output, "the refusal must state the rule, not the regex").toContain(RULE_STATED);
  });

  it("is answered out of by search once the name is one Claude Code accepts", async () => {
    await publishUnder(source, NAME_ACCEPTED);

    const { exitCode, combined } = await runCLI(["search", E2E_SKILL.react.slug], project.dir, {
      env: { HOME: project.dir },
    });

    expect(exitCode, "the same marketplace, renamed, loads like any other").toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(flattenCliOutput(combined), "its skills must still be found").toContain(
      E2E_SKILL.react.id,
    );
  });

  it("is reported by doctor as an error rather than counted as validated", async () => {
    await publishUnder(source, NAME_REFUSED);

    const { exitCode, combined } = await runCLI(["doctor"], project.dir, {
      env: { HOME: project.dir },
    });

    const output = flattenCliOutput(combined);
    expect(
      exitCode,
      "doctor must not exit clean over a marketplace it cannot install from",
    ).not.toBe(EXIT_CODES.SUCCESS);
    expect(
      output,
      "the row is the summary a reader trusts — it must not contradict itself",
    ).not.toContain(MARKETPLACES_ROW_CLEAN);
    expect(output, "the manifest holding the name must be named").toContain(FILES.MARKETPLACE_JSON);
    expect(output, "the refusal must state the rule, not the regex").toContain(RULE_STATED);
  });

  it("is counted as validated by doctor once the name is one Claude Code accepts", async () => {
    await publishUnder(source, NAME_ACCEPTED);

    const { combined } = await runCLI(["doctor"], project.dir, { env: { HOME: project.dir } });

    const output = flattenCliOutput(combined);
    expect(output, "a marketplace with a usable name is one doctor validates").toContain(
      MARKETPLACES_ROW_CLEAN,
    );
    expect(output, "nothing may be said about the manifest's name").not.toContain(RULE_STATED);
  });
});

/** The name the installer reads back as "copied, not installed". */
const EJECT_MARKER_NAME = "eject";

/** The plan line an install that asked for a plugin must print. */
const PLUGIN_PLAN = `Install mode: ${STEP_TEXT.PLUGIN_NATIVE}`;
/** The plan line the defect printed in its place. */
const EJECT_PLAN = `Install mode: ${STEP_TEXT.EJECT_LOCAL_COPY}`;

/**
 * The accepted twin is the SAME built marketplace under its own name, the built manifest with only
 * its name replaced — so the plugins it lists are the ones `build plugins` wrote. It asserts the
 * install PLAN rather than the finished install: the plan line is what the defect falsified, and
 * finishing a plugin install is the Claude CLI's subject, covered by the plugin-install specs.
 */
describe("a marketplace whose manifest names it after the ejected-copy marker", () => {
  const webDev = E2E_AGENT["web-developer"].name;
  const sharedId = "EjectMk1";
  let sourceDir: string;
  let sourceTempDir: string;
  let builtManifest: Record<string, unknown>;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  async function republishUnder(name: string): Promise<void> {
    await writeFile(
      path.join(sourceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, FILES.MARKETPLACE_JSON),
      JSON.stringify({ ...builtManifest, name }, null, 2),
    );
  }

  beforeAll(async () => {
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
    builtManifest = JSON.parse(
      await readTestFile(
        path.join(sourceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, FILES.MARKETPLACE_JSON),
      ),
    );
    store = await startSeedConfigStore();
    store.publish(
      sharedId,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [webDev]: "lazy" },
          }),
        },
        agents: { [webDev]: { scope: "project" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it("is refused by init --from as a reserved name, which writes nothing", async () => {
    env = await createTestEnvironment({ permissions: false });
    await republishUnder(EJECT_MARKER_NAME);
    const before = await readTreeSnapshot(env.fakeHome);

    const { exitCode, output } = await runInitFrom(
      store,
      sharedId,
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    const said = flattenCliOutput(output);
    expect(said, "a plugin asked for must never be announced as a copy").not.toContain(EJECT_PLAN);
    expect(exitCode, said).toBe(EXIT_CODES.ERROR);
    expect(said, "the refusal is the reserved-name one build marketplace gives").toContain(
      `Marketplace name '${EJECT_MARKER_NAME}' is reserved`,
    );
    expect(
      await readTreeSnapshot(env.fakeHome),
      "a refused install leaves the project and the global install exactly as they were",
    ).toStrictEqual(before);
  });

  it("is installed by init --from as the plugin asked for once its name is its own", async () => {
    env = await createTestEnvironment({ permissions: false });
    await republishUnder(E2E_MARKETPLACE_NAME);

    const { output } = await runInitFrom(
      store,
      sharedId,
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    const said = flattenCliOutput(output);
    expect(said, "the same configuration, from a marketplace named otherwise").toContain(
      PLUGIN_PLAN,
    );
    expect(said).not.toContain(EJECT_PLAN);
    expect(said, "nothing about this name is reserved").not.toContain("is reserved");
  });
});

/**
 * The reserved name reaching a load the other way: the installation's own `config.ts` recorded it
 * as `marketplaceName`, over a manifest whose name is fine. The refusal is about that config, so it
 * names the field and the file holding it — sending the reader to rename the marketplace sends them
 * to the one file with nothing wrong in it. The accepted twin is the same installation recording
 * the manifest's own name.
 */
describe("an installation whose config.ts recorded a reserved name its manifest does not carry", () => {
  let source: E2ESource;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    source = await createE2ESource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupTempDir(source.tempDir);
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  async function installationRecording(marketplaceName: string): Promise<string> {
    const project = await ProjectBuilder.editable({
      marketplace: source.sourceDir,
      skills: [E2E_SKILL.react.id],
      agents: ["web-developer"],
    });
    tempDirs.push(path.dirname(project.dir));
    await injectMarketplaceIntoConfig(project.dir, marketplaceName);
    return project.dir;
  }

  it("is refused by search as a name the installation recorded, not one to rename", async () => {
    const projectDir = await installationRecording(EJECT_MARKER_NAME);
    const before = await readTreeSnapshot(projectDir);

    const { exitCode, combined } = await runCLI(["search", E2E_SKILL.react.slug], projectDir, {
      env: { HOME: projectDir },
    });

    const said = flattenCliOutput(combined);
    expect(exitCode, said).toBe(EXIT_CODES.ERROR);
    expect(said, "the reserved name is what is refused").toContain(
      `Marketplace name '${EJECT_MARKER_NAME}' is reserved`,
    );
    expect(said, "the manifest's own name is fine, so renaming it is no way out").not.toContain(
      STEP_TEXT.RESERVED_NAME_MANIFEST_WAY_OUT,
    );
    expect(said, "the field that recorded the name is named").toContain(
      STEP_TEXT.RECORDED_MARKETPLACE_NAME_FIELD,
    );
    expect(compactCliOutput(combined), "and so is the config.ts holding it, by its path").toContain(
      compactCliOutput(configTsPath(projectDir)),
    );
    expect(await readTreeSnapshot(projectDir), "a refused search writes nothing").toStrictEqual(
      before,
    );
  });

  it("is answered out of by search once the name recorded is the manifest's own", async () => {
    const projectDir = await installationRecording(E2E_MARKETPLACE_NAME);

    const { exitCode, combined } = await runCLI(["search", E2E_SKILL.react.slug], projectDir, {
      env: { HOME: projectDir },
    });

    expect(exitCode, flattenCliOutput(combined)).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(combined)).toContain(E2E_SKILL.react.id);
  });
});
