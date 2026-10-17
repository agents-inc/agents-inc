import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTempDir,
  configTsPath,
  fileExists,
  listFiles,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { CUSTOM_PROJECT_SKILL_ID, ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { stubBrowserOpener, type BrowserOpenerStub } from "../fixtures/browser-opener.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * A custom skill whose metadata.yaml describes no skill stops `edit --from` before it asks, and a
 * bare `edit` before it mints, as `compile` does; the entry is not dropped from config.ts. Both run
 * in a terminal.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const APPLIED_ID = "MetaFix01";
const APPLIED = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
  },
  agents: { [WEB_DEV]: { scope: "project" } },
});

const UNPARSEABLE_YAML = `{{{ this is not: valid: yaml: "at all\n`;

/** One token of the `yaml` parser's own reason, short enough to survive wrapping. */
const PARSE_REASON_TOKEN = "mappings";

type Fixture = {
  projectDir: string;
  tempDir: string;
  metadataPath: string;
  healthyMetadata: string;
};

/**
 * Custom, because only an id the marketplace lacks becomes unresolvable; an ejected marketplace
 * skill still resolves from the catalogue.
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
      // The loader already warns about the file, so only this closing line shows the run refused.
      expect(
        flattenCliOutput(output),
        "the refusal must offer the two ways out and point at doctor",
      ).toContain(STEP_TEXT.METADATA_UNUSABLE_WAY_OUT);
      expect(output, "a refused run must not reach the question").not.toContain(
        STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM,
      );

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

      // Keyed to the unusable file: once repaired, the run reaches the question (declined here).
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

describe("bare edit with a saved entry whose installed metadata.yaml describes no skill", () => {
  let tempDir: string;
  let source: E2ESource;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    store.reset();
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  function launchBareEdit(projectDir: string, opener: BrowserOpenerStub): InteractivePrompt {
    prompt = new InteractivePrompt(["edit"], projectDir, {
      env: { AGENTS_INC_API_URL: store.url, PATH: opener.path },
    });
    return prompt;
  }

  it(
    "refuses naming the skill, the file and the reason, before it mints an id or opens the editor",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const fixture = await seedBrokenCustomSkillMetadata(source.sourceDir);
      tempDir = fixture.tempDir;
      const opener = await stubBrowserOpener(fixture.tempDir);
      const treeBefore = await readTreeSnapshot(fixture.projectDir);

      const edit = launchBareEdit(fixture.projectDir, opener);
      const exitCode = await edit.waitForExit(TIMEOUTS.EXIT_WAIT);
      const output = edit.getRawOutput();

      expect(exitCode, `edit must refuse an unusable metadata.yaml:\n${output}`).toBe(
        EXIT_CODES.ERROR,
      );
      expect(output, "the offending skill must be named").toContain(CUSTOM_PROJECT_SKILL_ID);
      expect(output, "the offending file must be named").toContain(fixture.metadataPath);
      expect(output, "the parser's own reason must reach the user").toContain(PARSE_REASON_TOKEN);
      // Reading the file already warns, so only the closing line shows the run stopped.
      expect(
        flattenCliOutput(output),
        "the refusal must offer the two ways out and point at doctor",
      ).toContain(STEP_TEXT.METADATA_UNUSABLE_WAY_OUT);

      expect(store.requests, "a refused run must not post the installation").toStrictEqual([]);
      expect(await fileExists(opener.logPath), "a refused run must not open the browser").toBe(
        false,
      );
      expect(
        await readTreeSnapshot(fixture.projectDir),
        "opening the editor reads the installation and rewrites nothing",
      ).toStrictEqual(treeBefore);
    },
  );

  it(
    "mints an id and opens the editor on it once the metadata.yaml describes its skill",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const fixture = await seedBrokenCustomSkillMetadata(source.sourceDir);
      tempDir = fixture.tempDir;
      await writeFile(fixture.metadataPath, fixture.healthyMetadata);
      const opener = await stubBrowserOpener(fixture.tempDir);
      const treeBefore = await readTreeSnapshot(fixture.projectDir);

      // Keyed to the unusable file, so the repaired installation is handed to the editor.
      const edit = launchBareEdit(fixture.projectDir, opener);
      const exitCode = await edit.waitForExit(TIMEOUTS.EXIT_WAIT);
      const output = edit.getRawOutput();

      expect(exitCode, `a readable metadata.yaml must not be refused:\n${output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(store.minted).toHaveLength(1);
      const mintedId = firstElement(store.minted);
      expect(output).toContain(`Shared as ${mintedId}`);
      const opened = await readTestFile(opener.logPath);
      expect(opened, "the browser must be handed the editor").toContain(STEP_TEXT.EDITOR_URL);
      expect(opened, "the browser must be handed the id just minted").toContain(mintedId);
      expect(await readTreeSnapshot(fixture.projectDir)).toStrictEqual(treeBefore);
    },
  );
});
