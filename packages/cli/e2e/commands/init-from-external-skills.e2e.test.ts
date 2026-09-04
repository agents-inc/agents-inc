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
import { DIRS, EXIT_CODES, FILES } from "../pages/constants.js";
import {
  UPSTREAM_SKILL_NAME,
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { renderSkillMd } from "../../src/cli/lib/__tests__/content-generators.js";

/**
 * `init --from <id>` with a skill the catalogue never had.
 *
 * Every other id in a payload is resolved against the catalogue the receiver loads. A skill added
 * from outside answers to no catalogue, so its whole directory travels inline — and the claim this
 * file exists to prove is that those bytes become a real install: files on disk under the scope
 * the entry names, a config entry, and a compiled sub-agent that really references it.
 *
 * Eject only. The payload IS the source, so there is no marketplace for a plugin install of one to
 * fetch from, and asking for one is refused rather than quietly ejected instead.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/**
 * The id an added skill is minted under at intake — `external-<category>-<name>` — and the
 * category the user confirmed for it.
 *
 * A NON-exclusive category, deliberately: an exclusive one holds a single skill, so placing a
 * carried skill in the same exclusive category as a catalogue skill is refused by the config
 * model's own rule and would make these specs about that rule instead of about carried content.
 */
const EXTERNAL_CATEGORY = "web-tooling";
const EXTERNAL_ID = "external-web-tooling-brainstorming";
const EXTERNAL_DISPLAY = "Brainstorming";
const EXTERNAL_REPO = "obra/superpowers";

/** A sub-agent entry that keeps its agent in the project rather than at the default scope. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/**
 * A real public-catalogue id the E2E marketplace does not ship.
 *
 * The two halves are what make it the bypass's subject: the SHIPPED catalogue owns it, so a
 * carried skill taking it writes over `~/.claude/skills/web-framework-react/` on any machine that
 * installs the catalogue's own copy — and the marketplace the payload steers the loader to has
 * never heard of it, so a guard reading only the LOADED matrix finds no incumbent and installs.
 */
const CATALOGUE_ID_THE_FIXTURE_LACKS = "web-framework-react";

/** The whole directory an added skill carries: its manifest, and the reference file beside it. */
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
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [EXTERNAL_ID]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
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

    // The failure this whole leg exists to end: the id reported as one this catalogue does not
    // know, while its content sat in the payload unread.
    expect(flattenCliOutput(output)).not.toContain("does not know");

    // "eject" is the only origin an added skill can have — nothing serves it as a plugin.
    const config = await loadConfigOrFail(env.projectDir);
    expect(config.skills).toStrictEqual([
      ...buildSkillConfigs([E2E_SKILL.react.id]),
      ...buildSkillConfigs([EXTERNAL_ID]),
    ]);
    expect(config.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));

    // Exhaustive, not "contains": the catalogue skill and the carried one land side by side in
    // one directory, and a copy that also reached HOME would satisfy a subset check here.
    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([
      E2E_SKILL.react.id,
      EXTERNAL_ID,
    ]);

    // The whole directory, not the manifest alone: a skill installed without its reference files
    // loads and then cannot do what it says.
    const skillDir = path.join(skillsPath(env.projectDir), EXTERNAL_ID);
    expect(await readTestFile(path.join(skillDir, "reference", "prompts.md"))).toBe("# Prompts\n");

    // Named by the id it installs under. The compiled sub-agent references that id, and every
    // loader reads a skill's id off this line — left as the repository wrote it, the sub-agent
    // would name a skill Claude Code knows as something else.
    expect(await readTestFile(path.join(skillDir, FILES.SKILL_MD))).toContain(
      `name: ${EXTERNAL_ID}`,
    );

    // Registered on disk as well as in this run's memory, or the next `edit` or `compile` finds
    // a config entry for a skill nothing on disk describes.
    const metadata = await readTestFile(path.join(skillDir, FILES.METADATA_YAML));
    expect(metadata).toContain(`category: ${EXTERNAL_CATEGORY}`);
    // Provenance: this directory is the CLI's, which is what lets `uninstall` remove it and the
    // producer tell it apart from a skill the user wrote by hand.
    expect(metadata).toContain(`source: github:${EXTERNAL_REPO}`);

    // And the point of all of it — the sub-agent really carries the skill.
    const compiled = await readCompiledAgents(env.projectDir);
    expect(compiled[`${WEB_DEV}.md`]).toContain(EXTERNAL_ID);

    // A carried skill answers to no catalogue, so the id it installs under only reaches the
    // generated unions if the writer treated it as a real installed skill. Four surfaces is
    // where that shows: a config naming an id its own `config-types.ts` never learned fails
    // `tsc` in the user's editor while every directory listing above still passes.
    await expectFourSurfaces(env.projectDir, { globalHome: env.fakeHome });
    // The other scope, asserted as owning nothing rather than skipped. Every entry in this
    // payload is pinned to the project, so a skill or a sub-agent appearing in the user's own
    // ~/.claude is content that crossed a boundary it was told not to cross — and an absence
    // nobody asserts is indistinguishable from one nobody looked for.
    await expectFourSurfaces(env.fakeHome, { expectEmpty: true });
  });

  it("routes a carried skill to the scope its own entry names", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "External2",
      buildSeedPayload({
        skills: {
          [EXTERNAL_ID]: buildSeedSkill({ scope: "global", assignments: { [WEB_DEV]: "lazy" } }),
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

    // A carried skill obeys the same per-entry scope rule a catalogue skill does: the bytes go
    // to the user's own skills directory, and the project keeps none of its own.
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([EXTERNAL_ID]);
    await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);

    // The carried skill went to one scope and the sub-agent to the other, so each side's pair
    // is checked where it was written.
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
    // Named, because the fix is on the sharer's side: the id is what they have to switch.
    expect(flattenCliOutput(output)).toContain(EXTERNAL_ID);
    // For the RIGHT reason. Skipping the id as one this catalogue does not know also exits with
    // an error naming it, so a refusal spec that asked no more than that would pass against the
    // very behaviour this file exists to replace.
    expect(flattenCliOutput(output)).not.toContain("does not know");
    expect(flattenCliOutput(output)).toContain("plugin");
    // The refusal fires before anything is written, like every other refusal on this path.
    await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
    expect(await fileExists(path.join(env.projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS))).toBe(
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
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        // Keyed by an id this run's marketplace already publishes. A skill id IS the directory
        // the skill installs into, so a carried skill taking one writes its own bytes over the
        // catalogue's copy — and every sub-agent that names that id afterwards is handed whatever
        // the payload shipped, under the catalogue's own display name and placement.
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

    // One snapshot for both scopes: the project this installs into is nested inside the fake
    // HOME that would hold a global install, so every surface a refusal must leave alone —
    // skills, compiled sub-agents, config.ts and config-types.ts, at either scope — is under it.
    const homeBefore = await readTreeSnapshot(env.fakeHome);

    const { exitCode, output } = await runInitFrom(
      store,
      "External4",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    // This assertion is the one that carries the red against an unguarded build, and the two
    // below it cannot: measured 2026-09-03, the impostor installs, the run exits 0 with
    // "initialized successfully", and the success report NAMES the id on its "Wrote 1 skill(s)
    // this configuration carries" line — so the `toContain` and the `not.toContain` are both
    // green while `.claude/skills/<react id>/SKILL.md` holds the payload's bytes.
    expect(exitCode).toBe(EXIT_CODES.ERROR);
    // Named, because the fix is on the sharer's side: the id is what they have to re-mint.
    expect(flattenCliOutput(output)).toContain(E2E_SKILL.react.id);
    // For the RIGHT reason, and it is also the proof the run reached its decision rather than
    // failing on the way there. Skipping the id as one this catalogue does not know names it too,
    // so a refusal spec that asked no more than "the id appears" would pass against the very
    // behaviour this leg exists to end.
    expect(flattenCliOutput(output)).not.toContain("does not know");

    // `readTreeSnapshot` rather than the plugin leg's pair of absence checks: that leg names the
    // two surfaces it happens to think of, and a refusal owes every surface. This carries content
    // AND mtime for every file under both scopes, so a write that produced identical bytes is
    // visible too.
    //
    // Watched go red rather than assumed, and NOT by reverting a fix — a guarantee not to write
    // and a bug that skipped the write are the same bytes on disk. Flipping the exit-code
    // expectation above to SUCCESS on 2026-09-03 left this the only failing assertion, reporting
    // 8 files against the empty tree: the impostor's SKILL.md, metadata.yaml and reference/, the
    // compiled web-developer.md, config.ts and config-types.ts. Restore that flip to re-measure.
    expect(await readTreeSnapshot(env.fakeHome)).toStrictEqual(homeBefore);
  });

  it("refuses a carried skill claiming a shipped catalogue id, even under a marketplace the payload chose", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "External5",
      buildSeedPayload({
        // The payload's OWN marketplace, and the whole of the bypass. `sharedConfigSourceFlags`
        // in `src/cli/commands/init.tsx` reads `flags.marketplace ?? payload.marketplace`, so
        // with no flag given the payload decides which catalogue the receiver loads — and it
        // names one that does not ship the id it is about to impersonate.
        marketplace: sourceDir,
        skills: {
          [CATALOGUE_ID_THE_FIXTURE_LACKS]: buildSeedSkill({
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

    // `runInitFrom` is deliberately not used: it always passes `--marketplace <sourceDir>`, and
    // the flag BEATS the payload's field — which is the one arrangement under which this bypass
    // cannot happen. The env is the same one that helper sets.
    const { exitCode, output } = await CLI.run(
      ["init", "--from", "External5"],
      { dir: env.projectDir, globalHome: env.fakeHome },
      { env: { AGENTS_INC_API_URL: store.url } },
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(CATALOGUE_ID_THE_FIXTURE_LACKS);
    // For the RIGHT reason: an id the loaded marketplace does not carry is also skipped by name,
    // so a refusal spec asking no more than "the id appears" would pass against the very
    // behaviour this leg exists to end.
    expect(flattenCliOutput(output)).not.toContain("does not know");
    expect(await readTreeSnapshot(env.fakeHome)).toStrictEqual(homeBefore);
  });

  it("refuses to write a carried skill over a directory nobody shared, and leaves it untouched", async () => {
    env = await createTestEnvironment({ permissions: false });
    // The user's own skill, sitting at the id the configuration below carries. It is a REAL local
    // skill — metadata and all — so the load merges it into the matrix wearing `local: true`,
    // which is exactly the flag the collision guard carves out for a re-apply. Nothing about the
    // catalogue can tell the two apart; only the disk can.
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
          [EXTERNAL_ID]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
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
    // Named, because the fix is the user's: the directory is theirs to move or rename.
    expect(flattenCliOutput(output)).toContain(EXTERNAL_ID);
    // Content AND mtime for every file under the directory. Journey 34's claim is that a
    // hand-authored skill survives untouched — measured 2026-09-03, the payload's bytes replaced
    // its SKILL.md and its metadata.yaml was stamped `forkedFrom`, which hands the user's own
    // work to the round trip: `uninstall` may then delete it and `share` will carry it.
    expect(await readTreeSnapshot(handAuthoredDir)).toStrictEqual(before);
  });
});
