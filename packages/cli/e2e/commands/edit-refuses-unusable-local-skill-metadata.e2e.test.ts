import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTempDir,
  configTsPath,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { CUSTOM_PROJECT_SKILL_ID, ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A saved skill entry whose local files ARE on disk, and whose metadata.yaml describes no
 * skill, stops `edit --from` before it asks anything — the same refusal `compile` raises over
 * the same file, for the same reason: nothing can be loaded for that skill.
 *
 * What it replaces: the entry resolved to nothing, so the run dropped it from config.ts — which
 * blamed the marketplace for a YAML typo in the user's own working copy, and cost them the
 * config record of an install whose files were sitting right there.
 *
 * `edit --from` asks before it applies, so it runs in a terminal.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** What the edit applies: one marketplace skill on the project's own sub-agent. */
const APPLIED_ID = "MetaFix01";
const APPLIED = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
  },
  agents: { [WEB_DEV]: { scope: "project" } },
});

/** Unparseable YAML: a flow-mapping opener followed by nested compact mappings. */
const UNPARSEABLE_YAML = `{{{ this is not: valid: yaml: "at all\n`;

/** A single token of the `yaml` parser's own reason, safe from output wrapping. */
const PARSE_REASON_TOKEN = "mappings";

type Fixture = {
  projectDir: string;
  tempDir: string;
  metadataPath: string;
  healthyMetadata: string;
};

/**
 * A project whose one skill is CUSTOM — a skill the marketplace has never heard of, which is
 * the only kind whose broken metadata.yaml can make a saved entry unresolvable. Corrupt an
 * ejected copy of a marketplace skill instead and the catalogue still carries the id, so the
 * run resolves it from there and nothing is classified at all.
 */
async function seedBrokenCustomSkillMetadata(source: string): Promise<Fixture> {
  const project = await ProjectBuilder.withCustomSkill({ marketplace: source });
  const metadataPath = path.join(
    skillsPath(project.dir),
    CUSTOM_PROJECT_SKILL_ID,
    FILES.METADATA_YAML,
  );
  const healthyMetadata = await readTestFile(metadataPath);
  await writeFile(metadataPath, UNPARSEABLE_YAML);

  return {
    projectDir: project.dir,
    tempDir: path.dirname(project.dir),
    metadataPath,
    healthyMetadata,
  };
}

describe("edit --from with a saved entry whose installed metadata.yaml describes no skill", () => {
  let tempDir: string;
  let source: E2ESource;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    store.publish(APPLIED_ID, APPLIED);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  /** `edit --from` in a terminal over the project, under a HOME of its own. */
  function launchEditFrom(projectDir: string): InteractivePrompt {
    prompt = new InteractivePrompt(["edit", "--from", APPLIED_ID], projectDir, {
      env: { AGENTS_INC_API_URL: store.url },
    });
    return prompt;
  }

  it(
    "refuses naming the skill, the file and the reason, and keeps the config entry",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const fixture = await seedBrokenCustomSkillMetadata(source.sourceDir);
      tempDir = fixture.tempDir;

      const configBefore = await readTestFile(configTsPath(fixture.projectDir));
      const skillDirsBefore = await listFiles(skillsPath(fixture.projectDir));

      const edit = launchEditFrom(fixture.projectDir);
      const exitCode = await edit.waitForExit(TIMEOUTS.EXIT_WAIT);
      const output = edit.getRawOutput();

      expect(exitCode, `edit must refuse an unusable metadata.yaml:\n${output}`).toBe(
        EXIT_CODES.ERROR,
      );
      expect(output, "the offending skill must be named").toContain(CUSTOM_PROJECT_SKILL_ID);
      expect(output, "the offending file must be named").toContain(fixture.metadataPath);
      expect(output, "the parser's own reason must reach the user").toContain(PARSE_REASON_TOKEN);
      // The refusal's own closing line. The loader already WARNS about the same file while
      // discovering local skills, so only this sentence distinguishes a run that refused
      // from one that shrugged and carried on to the question.
      expect(
        flattenCliOutput(output),
        "the refusal must offer the two ways out and point at doctor",
      ).toContain(STEP_TEXT.METADATA_UNUSABLE_WAY_OUT);
      expect(output, "a refused run must not reach the question").not.toContain(
        STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM,
      );

      // The whole point: the entry survives the refusal, on disk, byte for byte.
      expect(
        await readTestFile(configTsPath(fixture.projectDir)),
        "config.ts must not lose the entry over a file that can be repaired",
      ).toBe(configBefore);
      expect(await listFiles(skillsPath(fixture.projectDir))).toStrictEqual(skillDirsBefore);
      expect(
        await readTestFile(fixture.metadataPath),
        "edit must not rewrite the file it refused",
      ).toBe(UNPARSEABLE_YAML);
    },
  );

  it(
    "stops refusing once the metadata.yaml is repaired",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const fixture = await seedBrokenCustomSkillMetadata(source.sourceDir);
      tempDir = fixture.tempDir;
      const refused = launchEditFrom(fixture.projectDir);
      expect(await refused.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
      expect(flattenCliOutput(refused.getRawOutput())).toContain(
        STEP_TEXT.METADATA_UNUSABLE_WAY_OUT,
      );
      await refused.destroy();

      await writeFile(fixture.metadataPath, fixture.healthyMetadata);
      const configBefore = await readTestFile(configTsPath(fixture.projectDir));

      // The guard is keyed to the unusable FILE, not to custom skills or to unresolvable
      // entries at large, so a repaired file lets the run reach the question it was stopped
      // short of — declined here, so nothing is applied.
      const repaired = launchEditFrom(fixture.projectDir);
      await repaired.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
      const asked = repaired.getRawOutput();
      expect(flattenCliOutput(asked), "a readable metadata.yaml must not be refused").not.toContain(
        STEP_TEXT.METADATA_UNUSABLE_WAY_OUT,
      );
      expect(asked, "a readable metadata.yaml lets the run ask").toContain(
        STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM,
      );
      await repaired.deny();
      await repaired.waitForExit(TIMEOUTS.EXIT_WAIT);
      expect(
        await readTestFile(configTsPath(fixture.projectDir)),
        "a declined apply writes nothing",
      ).toBe(configBefore);
    },
  );
});
