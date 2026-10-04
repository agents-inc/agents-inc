import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { E2E_AGENT, E2E_SKILL, e2eSkillId } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createLocalSkillIn,
  createTempDir,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  renderUnparseableMetadataYaml,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from <id>` and `edit --from <id>` say what loading the marketplace raised, as every
 * other command that loads one does.
 *
 * The load runs with its warnings captured, because the wizard paints them as its startup band.
 * The two `--from` runs mount no wizard, so what the load captured went nowhere: a skill the
 * marketplace ships with a `metadata.yaml` that will not parse was reported only as one "this
 * catalog does not know", with the cause — the file, and what is wrong with it — held and dropped.
 * The same goes for two folders claiming one id, a stack naming a skill the catalogue lacks, and a
 * stale cached copy served because the marketplace is offline; the unparseable `metadata.yaml`
 * stands for the class here, because it is the one whose effect a `--from` run also prints.
 *
 * The cause is asserted above the effect: a skill this catalogue "does not know" is often one it
 * ships with a file that will not parse, and the line saying so is what explains the skip below
 * it. The clean marketplace is the control — the capture also holds the band's own narration
 * ("Loaded N skills"), and a run that replayed everything it captured would print that as well.
 *
 * Observed red against the unfixed build: both `--from` runs printed the effect and not the cause.
 * The clean control, the installed files and the declined apply are green there and must stay so.
 */

/** A skill the marketplace ships whose metadata.yaml no YAML parser reads. */
const BROKEN_SKILL_ID = e2eSkillId("web-broken-metadata");

/** The file the load names as the cause, relative to the marketplace's skills directory. */
const BROKEN_FILE = `${BROKEN_SKILL_ID}/${FILES.METADATA_YAML}`;

/** What the decode says about the same id: the effect the cause explains. */
const EFFECT = `${STEP_TEXT.CATALOG_DOES_NOT_KNOW} ${BROKEN_SKILL_ID}`;

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Ships the broken skill into a marketplace: a SKILL.md that reads, beside a metadata.yaml that does not. */
async function shipSkillWithUnparseableMetadata(sourceDir: string): Promise<void> {
  await createLocalSkillIn(path.join(sourceDir, SOURCE_PATHS.SKILLS_DIR), BROKEN_SKILL_ID, {
    description: "Shipped with a broken metadata.yaml",
    metadata: renderUnparseableMetadataYaml(),
  });
}

describe("--from runs say what the marketplace load raised", () => {
  let broken: E2ESource;
  let clean: E2ESource;
  let store: SeedConfigStore;
  let tempDir: string | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    broken = await createE2ESource();
    await shipSkillWithUnparseableMetadata(broken.sourceDir);
    clean = await createE2ESource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(broken);
    await cleanupFixture(clean);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "init --from names why a skill the marketplace ships was skipped, above the skip",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Broken01",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: {
            [E2E_SKILL.react.id]: ejectedGlobalSkill(),
            [BROKEN_SKILL_ID]: ejectedGlobalSkill(),
          },
        }),
      );

      const { exitCode, output, stderr } = await runInitFrom(
        store,
        "Broken01",
        { dir: tempDir },
        broken.sourceDir,
      );

      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(stderr);
      expect(said, "the effect is said today, so the cause has something to explain").toContain(
        EFFECT,
      );
      expect(said, "the load names the file it could not read").toContain(BROKEN_FILE);
      expect(said, "and what is wrong with it").toContain(
        STEP_TEXT.MARKETPLACE_METADATA_UNPARSEABLE,
      );
      expect(
        said.indexOf(BROKEN_FILE),
        "the cause is said above the skip it explains",
      ).toBeLessThan(said.indexOf(EFFECT));

      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect((await loadConfigOrFail(tempDir)).skills.map((skill) => skill.id)).toStrictEqual([
        E2E_SKILL.react.id,
      ]);
      expect(await listFiles(skillsPath(tempDir))).toStrictEqual([E2E_SKILL.react.id]);
    },
  );

  it(
    "edit --from names it too, before asking to apply",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await ProjectBuilder.editable({
        marketplace: broken.sourceDir,
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: [WEB_DEV],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      store.publish(
        "Broken02",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [BROKEN_SKILL_ID]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );
      const before = await readTreeSnapshot(project.dir);

      prompt = new InteractivePrompt(["edit", "--from", "Broken02"], project.dir, {
        env: { AGENTS_INC_API_URL: store.url },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);

      const said = flattenCliOutput(prompt.getOutput());
      expect(said, "the effect is said today, so the cause has something to explain").toContain(
        EFFECT,
      );
      expect(said, "the load names the file it could not read").toContain(BROKEN_FILE);
      expect(said, "and what is wrong with it").toContain(
        STEP_TEXT.MARKETPLACE_METADATA_UNPARSEABLE,
      );

      await prompt.deny();
      expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
      expect(await readTreeSnapshot(project.dir), "a declined apply changes nothing").toStrictEqual(
        before,
      );
    },
  );

  it(
    "init --from says nothing more when the marketplace loads cleanly",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Clean001",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        }),
      );

      const { exitCode, output, stderr } = await runInitFrom(
        store,
        "Clean001",
        { dir: tempDir },
        clean.sourceDir,
      );

      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(
        stderr,
        "only what the load warned is said — never the startup band's own narration",
      ).not.toContain(STEP_TEXT.LOADED);
      expect(stderr).not.toContain(STEP_TEXT.MARKETPLACE_METADATA_UNPARSEABLE);
    },
  );
});
