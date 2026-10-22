import path from "path";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import { createE2ESource, E2E_SOURCE, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import type { RelationshipDefinitions } from "../../src/cli/types/index.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/** Longer than CLI_DESCRIPTION_MAX_LENGTH, which only warns. */
const OVER_LENGTH_CLI_DESCRIPTION = "x".repeat(75);

/** A slug the E2E fixture marketplace never ships, so a rule naming it resolves to nothing. */
const DANGLING_RULE_SLUG = "angular-standalone";

/**
 * A marketplace's own rules are not narrowed to what it ships, so a typo leaves a rule stating
 * nothing.
 */
const RULES_WITH_DANGLING_SLUG: Partial<RelationshipDefinitions> = {
  conflicts: [
    {
      skills: [E2E_SKILL.react.slug, DANGLING_RULE_SLUG],
      reason: "Deliberately names a slug no skill in this marketplace carries",
    },
  ],
};

async function firstInstalledSkillMetadata(globalHome: string): Promise<string> {
  const installedSkillsDir = path.join(globalHome, DIRS.CLAUDE, DIRS.SKILLS);
  const skillDirs = await readdir(installedSkillsDir);
  expect(skillDirs.length).toBeGreaterThan(0);
  return path.join(installedSkillsDir, firstElement(skillDirs), FILES.METADATA_YAML);
}

/** Ejected at the default (global) scope, so skills land under HOME. */
function useStackInstallations(): (sourceDir: string) => Promise<Required<ProjectHandle>> {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  return async (sourceDir) => {
    env = await createTestEnvironment();
    const site = { dir: env.projectDir, home: env.fakeHome };
    await installFromSeed(store, "DocStack", e2eStackPayload(), site, sourceDir);
    return { dir: site.dir, globalHome: site.home };
  };
}

describe("doctor layered output", () => {
  const installStack = useStackInstallations();

  it(
    "should run both layers and exit 0 on a clean install",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await installStack(E2E_SOURCE.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], project);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(
        stdout,
        "a clean install must reach the operational layer, not just report clean content",
      ).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SUMMARY);
    },
  );

  it(
    "should head both marketplace rows with the marketplace noun",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await installStack(E2E_SOURCE.sourceDir);

      const { stdout } = await CLI.run(["doctor"], project);

      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_MARKETPLACES);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE);
      // Subject guard before the absences: the row names are the only place "Source" heads a line.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(stdout, "the withdrawn row headings must be gone, not merely joined").not.toMatch(
        /^\s*Sources?(\s|$)/m,
      );
      expect(stdout).not.toContain("Source Reachable");
    },
  );

  /**
   * Only the row resolving configured ids against local-skill discovery is a cascade of a corrupt
   * skill; the others read config.ts and file names.
   */
  it(
    "should stand down only the row a corrupt installed skill can mislead",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await installStack(E2E_SOURCE.sourceDir);

      const metadataPath = await firstInstalledSkillMetadata(project.globalHome);
      await writeFile(metadataPath, ":\n  [unclosed: yaml\n    bad\n");

      const { exitCode, stdout } = await CLI.run(["doctor"], project);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain(FILES.METADATA_YAML);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
      expect(
        stdout,
        "the config row reads config.ts and nothing an installed skill holds",
      ).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(
        stdout,
        "the orphan row compares file names against the config and opens none of them",
      ).toContain(STEP_TEXT.DOCTOR_ROW_NO_ORPHANS);
      expect(stdout).toMatch(
        new RegExp(
          `${STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED}\\s+${STEP_TEXT.DOCTOR_STATUS_SKIP}\\s+Skipped`,
        ),
      );
      // The negatives only show the blanket skip did not happen; this positive names the blocking
      // pass.
      expect(
        stdout,
        "the row must name the pass that blocked it, not merely report itself skipped",
      ).toContain(STEP_TEXT.DOCTOR_SKIP_RESTATING_SKILL_ERRORS);
    },
  );

  it(
    "should keep content warnings non-fatal and still run the operational layer",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await installStack(E2E_SOURCE.sourceDir);

      const metadataPath = await firstInstalledSkillMetadata(project.globalHome);
      const metadata: Record<string, unknown> = parseYaml(await readFile(metadataPath, "utf8"));
      await writeFile(
        metadataPath,
        stringifyYaml({ ...metadata, cliDescription: OVER_LENGTH_CLI_DESCRIPTION }),
      );

      const { exitCode, stdout } = await CLI.run(["doctor"], project);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain("75 characters");
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
    },
  );
});

describe("doctor in a skills source repository", () => {
  let source: E2ESource | undefined;

  afterEach(async () => {
    if (source) await cleanupTempDir(source.tempDir);
    source = undefined;
  });

  it(
    "should validate the repository's own content and skip the operational layer",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource();

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: source.sourceDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(
        stdout,
        "the source repository under the cwd is the content an author runs doctor to check",
      ).toContain(source.sourceDir);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);
      expect(
        stdout,
        "there is no installed state in a source repo, so operational rows would be noise",
      ).not.toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    },
  );

  it(
    "should report the repository's own config it cannot read as a failed row, and finish the report",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource();
      const ownConfig = path.join(source.sourceDir, DIRS.SOURCE_ROOT, FILES.CONFIG_TS);
      await mkdir(path.dirname(ownConfig), { recursive: true });
      await writeFile(ownConfig, renderUnparseableConfigTs());

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: source.sourceDir });

      expect(exitCode, stdout).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(/Marketplace Repository\s+✗\s+Check threw\n/);
      expect(stdout, "the row names the file it could not read").toContain(ownConfig);
      expect(stdout, "the report runs to its end").toContain(STEP_TEXT.DOCTOR_SUMMARY);
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);
    },
  );

  it(
    "should fail the run for a slug the repository's own rules dangle",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource({ relationships: RULES_WITH_DANGLING_SLUG });

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: source.sourceDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(DANGLING_RULE_SLUG);
      expect(
        stdout,
        "the author owns the file, so the line must not tell them it is someone else's",
      ).not.toContain(STEP_TEXT.DOCTOR_FOREIGN_MARKETPLACE_DEFECT);
    },
  );
});

/**
 * In an installed marketplace the reader cannot edit, the same typo only warns, naming the
 * marketplace.
 */
describe("doctor in a project whose marketplace dangles a slug", () => {
  const installStack = useStackInstallations();
  let source: E2ESource | undefined;

  afterEach(async () => {
    if (source) await cleanupTempDir(source.tempDir);
    source = undefined;
  });

  it(
    "should warn without failing, and name the marketplace that shipped the rule",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource({ relationships: RULES_WITH_DANGLING_SLUG });
      const project = await installStack(source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], project);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(DANGLING_RULE_SLUG);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_FOREIGN_MARKETPLACE_DEFECT);
      expect(stdout, "the slug alone does not tell the reader whose defect it is").toContain(
        source.sourceDir,
      );
    },
  );

  /** A warning stands nothing down: an unresolved rule slug leaves every skill in the matrix. */
  it(
    "should leave every operational row answering for itself",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource({ relationships: RULES_WITH_DANGLING_SLUG });
      const project = await installStack(source.sourceDir);

      const { stdout } = await CLI.run(["doctor"], project);

      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED);
      expect(stdout, "a warning disables no row").not.toMatch(
        new RegExp(
          `${STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED}\\s+${STEP_TEXT.DOCTOR_STATUS_SKIP}\\s+Skipped`,
        ),
      );
    },
  );
});
