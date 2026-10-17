import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  fileExists,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readTestFile,
  readTreeSnapshot,
  renderMetadataYaml,
  skillsPath,
  sourceFolderIn,
} from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  UPSTREAM_SKILL_NAME,
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { renderSkillMd } from "../../src/cli/lib/__tests__/content-generators.js";

/**
 * `init --from` with a skill from outside the catalogue: its inline directory becomes a real
 * install (files, config entry, compiled reference). Eject only: the payload is the source, so
 * plugin install is refused.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/**
 * Non-exclusive on purpose: an exclusive category would make these specs about the one-skill rule.
 */
const EXTERNAL_CATEGORY = "web-tooling";
const EXTERNAL_ID = "external-web-tooling-brainstorming";
const EXTERNAL_DISPLAY = "Brainstorming";
const EXTERNAL_REPO = "obra/superpowers";

const PINNED_TO_PROJECT = { scope: "project" } as const;

/**
 * Owned by the shipped catalogue but not by the E2E marketplace, so a guard reading only the loaded
 * matrix finds no incumbent.
 */
const CATALOGUE_ID_THE_FIXTURE_LACKS = "web-framework-react";

/** Longer than the `cliDescription` doctor accepts. */
const LONG_EXTERNAL_DESCRIPTION =
  "Use before any creative work - explores user intent, requirements and design before implementation";

const EXTERNAL_FILES = {
  [FILES.SKILL_MD]: renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
  "reference/prompts.md": "# Prompts\n",
};

describe("init --from <id>: skills the payload carries rather than names", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it("installs a skill no catalogue knows, from the bytes the payload carries", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "External1",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [EXTERNAL_ID]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        external: {
          [EXTERNAL_ID]: buildSeedExternalSkill({
            displayName: EXTERNAL_DISPLAY,
            categoryId: EXTERNAL_CATEGORY,
            repo: EXTERNAL_REPO,
            files: EXTERNAL_FILES,
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "External1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode, `install failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

    // The old failure: reported as unknown while its content sat unread in the payload.
    expect(flattenCliOutput(output)).not.toContain("does not know");

    // "eject" is the only origin an added skill can have.
    const config = await loadConfigOrFail(env.projectDir);
    expect(config.skills).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id, EXTERNAL_ID], { scope: "project", origin: "eject" }),
    );
    expect(config.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));

    // Exhaustive: a copy that also reached HOME would pass a subset check.
    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([
      E2E_SKILL.react.id,
      EXTERNAL_ID,
    ]);

    // The whole directory: a skill without its reference files loads but cannot work.
    const skillDir = path.join(skillsPath(env.projectDir), EXTERNAL_ID);
    expect(await readTestFile(path.join(skillDir, "reference", "prompts.md"))).toBe("# Prompts\n");

    // Every loader reads the id off this line, so it must be the installed id.
    expect(await readTestFile(path.join(skillDir, FILES.SKILL_MD))).toContain(
      `name: ${EXTERNAL_ID}`,
    );

    // On disk too, or the next `edit` or `compile` finds a config entry nothing describes.
    const metadata = await readTestFile(path.join(skillDir, FILES.METADATA_YAML));
    expect(metadata).toContain(`category: ${EXTERNAL_CATEGORY}`);
    // Provenance lets `uninstall` remove it and tells it apart from a hand-written skill.
    expect(metadata).toContain(`source: github:${EXTERNAL_REPO}`);

    const compiled = await readCompiledAgents(env.projectDir);
    expect(compiled[`${WEB_DEV}.md`]).toContain(EXTERNAL_ID);

    // A config naming an id its config-types.ts never learned fails `tsc` while every listing
    // passes.
    await expectFourSurfaces(env.projectDir, { globalHome: env.fakeHome });
    // Everything is pinned to the project, so the other scope must own nothing.
    await expectFourSurfaces(env.fakeHome, { expectEmpty: true });
  });

  it("writes a carried skill's metadata that doctor does not warn about", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "ExternalDoc",
      buildSeedPayload({
        skills: {
          [EXTERNAL_ID]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        external: {
          [EXTERNAL_ID]: buildSeedExternalSkill({
            description: LONG_EXTERNAL_DESCRIPTION,
            categoryId: EXTERNAL_CATEGORY,
            repo: EXTERNAL_REPO,
            files: {
              [FILES.SKILL_MD]: renderSkillMd(UPSTREAM_SKILL_NAME, LONG_EXTERNAL_DESCRIPTION),
            },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const installed = await runInitFrom(store, "ExternalDoc", project, sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, stdout } = await CLI.run(["doctor"], project);

    expect(exitCode, `doctor failed: ${stdout}`).toBe(EXIT_CODES.SUCCESS);
    // Subject guard: the content layer ran.
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
    expect(
      stdout,
      "an install must not write a metadata.yaml its own doctor warns about",
    ).not.toContain(STEP_TEXT.DOCTOR_CLI_DESCRIPTION_OVER_LENGTH);
  });

  it("routes a carried skill to the scope its own entry names", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "External2",
      buildSeedPayload({
        skills: {
          [EXTERNAL_ID]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        external: {
          [EXTERNAL_ID]: buildSeedExternalSkill({
            categoryId: EXTERNAL_CATEGORY,
            repo: EXTERNAL_REPO,
            files: EXTERNAL_FILES,
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "External2",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode, `install failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

    // Same per-entry scope rule as a catalogue skill.
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([EXTERNAL_ID]);
    await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);

    await expectFourSurfaces(env.projectDir, { globalHome: env.fakeHome });
    await expectFourSurfaces(env.fakeHome);
  });

  it("refuses to install a carried skill as a plugin, and writes nothing", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "External3",
      buildSeedPayload({
        skills: {
          [EXTERNAL_ID]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        external: {
          [EXTERNAL_ID]: buildSeedExternalSkill({
            categoryId: EXTERNAL_CATEGORY,
            repo: EXTERNAL_REPO,
            files: EXTERNAL_FILES,
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "External3",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    // Named: the sharer has to switch this id.
    expect(flattenCliOutput(output)).toContain(EXTERNAL_ID);
    // For the right reason: an unknown-id skip also errors naming it.
    expect(flattenCliOutput(output)).not.toContain("does not know");
    expect(flattenCliOutput(output)).toContain("plugin");
    await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
    expect(await fileExists(path.join(sourceFolderIn(env.projectDir), FILES.CONFIG_TS))).toBe(
      false,
    );
  });

  it("refuses a carried skill claiming an id the loaded catalogue already owns, and writes nothing", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "External4",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        // An id this marketplace publishes: the skill id is its directory, so a carried skill there
        // would overwrite the catalogue's copy.
        external: {
          [E2E_SKILL.react.id]: buildSeedExternalSkill({
            categoryId: EXTERNAL_CATEGORY,
            repo: EXTERNAL_REPO,
            files: EXTERNAL_FILES,
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    // The project is nested in the fake HOME, so one snapshot covers both scopes.
    const homeBefore = await readTreeSnapshot(env.fakeHome);

    const { exitCode, output } = await runInitFrom(
      store,
      "External4",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    // This assertion carries the red: unguarded, the impostor installs, exits 0, and the report
    // names the id, so the two below stay green.
    expect(exitCode).toBe(EXIT_CODES.ERROR);
    // Named: the sharer has to re-mint this id.
    expect(flattenCliOutput(output)).toContain(E2E_SKILL.react.id);
    // For the right reason: an unknown-id skip names the id too.
    expect(flattenCliOutput(output)).not.toContain("does not know");

    // Content and mtime under both scopes: a refusal owes every surface.
    expect(await readTreeSnapshot(env.fakeHome)).toStrictEqual(homeBefore);
  });

  it("refuses a carried skill claiming a shipped catalogue id, even under a marketplace the payload chose", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "External5",
      buildSeedPayload({
        // With no flag the payload's own marketplace decides the catalogue (`flags.marketplace ??
        // payload.marketplace`), and it lacks the id it impersonates.
        marketplace: sourceDir,
        skills: {
          [CATALOGUE_ID_THE_FIXTURE_LACKS]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        external: {
          [CATALOGUE_ID_THE_FIXTURE_LACKS]: buildSeedExternalSkill({
            categoryId: EXTERNAL_CATEGORY,
            repo: EXTERNAL_REPO,
            files: EXTERNAL_FILES,
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );
    const homeBefore = await readTreeSnapshot(env.fakeHome);

    // Not `runInitFrom`: it always passes `--marketplace`, which beats the payload's field. Same
    // env as that helper.
    const { exitCode, output } = await CLI.run(
      ["init", "--from", "External5"],
      { dir: env.projectDir, globalHome: env.fakeHome },
      { env: { AGENTS_INC_API_URL: store.url } },
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(CATALOGUE_ID_THE_FIXTURE_LACKS);
    // For the right reason: an id the loaded marketplace lacks is also skipped by name.
    expect(flattenCliOutput(output)).not.toContain("does not know");
    expect(await readTreeSnapshot(env.fakeHome)).toStrictEqual(homeBefore);
  });

  it("refuses to write a carried skill over a directory nobody shared, and leaves it untouched", async () => {
    env = await createTestEnvironment({ permissions: false });
    // A real local skill, so the load marks it `local: true`, which the collision guard carves out
    // for a re-apply; only the disk can tell them apart.
    const handAuthoredDir = await createLocalSkill(env.projectDir, EXTERNAL_ID, {
      description: "The house's own way of doing things",
      metadata: renderMetadataYaml({
        author: "@vince",
        displayName: "House Style",
        category: EXTERNAL_CATEGORY,
        slug: "house-style",
        cliDescription: "The house's own way of doing things",
        usageGuidance: "Use when writing anything this house has an opinion about",
        contentHash: "a1b2c3d",
        custom: true,
      }),
    });
    const before = await readTreeSnapshot(handAuthoredDir);
    store.publish(
      "External6",
      buildSeedPayload({
        skills: {
          [EXTERNAL_ID]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        external: {
          [EXTERNAL_ID]: buildSeedExternalSkill({
            categoryId: EXTERNAL_CATEGORY,
            repo: EXTERNAL_REPO,
            files: EXTERNAL_FILES,
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFrom(
      store,
      "External6",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    // Named: the directory is the user's to move or rename.
    expect(flattenCliOutput(output)).toContain(EXTERNAL_ID);
    // A hand-authored skill must survive untouched; content and mtime for every file.
    expect(await readTreeSnapshot(handAuthoredDir)).toStrictEqual(before);
  });
});
