import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import {
  agentsPath,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
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
    await ensureBinaryExists();
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
});
