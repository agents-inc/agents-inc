import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  renderSkillMd,
  skillsPath,
  writeConfigTypes,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";

/**
 * CLI-346 — `update` keeps global-scoped and project-scoped skills in their own scopes.
 *
 * `compareSkillsWithSource` builds `projectResults` from the cwd and `globalResults`
 * from `os.homedir()`, and `update` joins them into one `skillBaseDir` map that decides
 * which `.claude/skills/` root each skill is rewritten under. Nothing asserted which
 * scope a skill was updated in: `update-refreshes-registered-projects.e2e.test.ts`
 * covers the fan-out from a home-scope update outward to registered projects, and every
 * other update spec runs one scope at a time, where a broken `skillBaseDir` is invisible
 * because both branches resolve to the same directory.
 *
 * This drives both at once: one outdated fork under HOME, one under the cwd, forked from
 * two different source skills so `compareSkillsWithSource`'s merge (project wins on
 * duplicate id) cannot drop either. The scope proof is a pair of assertions that fail in
 * opposite directions — each scope's skills directory must hold EXACTLY its own fork
 * (so nothing was written into the wrong root), and each fork's SKILL.md must carry the
 * marker of the source skill it forked from (so it was written at all).
 *
 * FIXTURE NOTE — each fork is named for a skill the E2E source does NOT contain. The
 * source loader merges local skills into the matrix by id, so a directory named after
 * the source skill it forked from replaces that source entry, `buildSourceSkillsMap`
 * drops it as local, and `update` reports it "local-only" instead of outdated. Same
 * constraint the registered-projects spec documents.
 */

/** Directory the global fork lives in — an id the E2E source does not carry. */
const GLOBAL_FORK_DIR = "web-meta-framework-nextjs";

/** Directory the project fork lives in — likewise absent from the E2E source. */
const PROJECT_FORK_DIR = "web-testing-react-testing-library";

/** The source skill each fork came from. Different ids, so neither is merged away. */
const GLOBAL_FORK_ORIGIN = E2E_SKILL.react.id;
const PROJECT_FORK_ORIGIN = E2E_SKILL.vitest.id;

const GLOBAL_MARKER = "Global-scope guidance E2E-SCOPE-MARKER-9c21";
const PROJECT_MARKER = "Project-scope guidance E2E-SCOPE-MARKER-4d78";

/** Content hash both installed forks record — stale by construction, so both are outdated. */
const STALE_HASH = "0000000";

const WEB_DEV = "web-developer";
const API_DEV = "api-developer";

function forkMetadata(originId: string, description: string): string {
  return renderMetadataYaml({
    author: "@agents-inc",
    category: "web-testing",
    domain: "web",
    slug: "scope-fork",
    cliDescription: description,
    usageGuidance: "Use when testing E2E scenarios",
    contentHash: STALE_HASH,
    forkedFrom: { skillId: originId, contentHash: STALE_HASH, date: "2025-01-01" },
  });
}

/** Rewrites a source skill's SKILL.md so the update has an identifiable payload to carry. */
async function markSourceSkill(sourceDir: string, skillId: string, marker: string): Promise<void> {
  const skillDir = path.join(sourceDir, SOURCE_PATHS.SKILLS_DIR, skillId);
  await writeFile(
    path.join(skillDir, FILES.SKILL_MD),
    renderSkillMd(skillId, marker, `# ${marker}`),
  );
}

describe("update keeps each scope's skills in that scope", () => {
  let tempDir: string | undefined;
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
    await markSourceSkill(sourceDir, GLOBAL_FORK_ORIGIN, GLOBAL_MARKER);
    await markSourceSkill(sourceDir, PROJECT_FORK_ORIGIN, PROJECT_MARKER);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "updates the global fork under HOME and the project fork under the cwd",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      await writeProjectConfig(globalHome, {
        name: "global-test",
        skills: [{ id: GLOBAL_FORK_DIR, scope: "global", source: "eject" }],
        agents: [{ name: WEB_DEV, scope: "global" }],
        domains: ["web"],
        selectedAgents: [WEB_DEV],
        stack: { [WEB_DEV]: { "web-meta-framework": [{ id: GLOBAL_FORK_DIR, preloaded: false }] } },
      });
      await writeConfigTypes(globalHome);
      await createLocalSkill(globalHome, GLOBAL_FORK_DIR, {
        description: "Stale global guidance",
        body: "# Stale global guidance",
        metadata: forkMetadata(GLOBAL_FORK_ORIGIN, "Stale global guidance"),
      });

      await writeProjectConfig(projectDir, {
        name: "project-test",
        skills: [{ id: PROJECT_FORK_DIR, scope: "project", source: "eject" }],
        agents: [{ name: API_DEV, scope: "project" }],
        domains: ["web"],
        selectedAgents: [API_DEV],
        stack: { [API_DEV]: { "web-testing": [{ id: PROJECT_FORK_DIR, preloaded: false }] } },
      });
      await writeConfigTypes(projectDir);
      await createLocalSkill(projectDir, PROJECT_FORK_DIR, {
        description: "Stale project guidance",
        body: "# Stale project guidance",
        metadata: forkMetadata(PROJECT_FORK_ORIGIN, "Stale project guidance"),
      });

      const globalConfigBefore = await readTestFile(configTsPath(globalHome));
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      const update = await CLI.run(
        ["update", "--yes", "--source", sourceDir],
        { dir: projectDir, globalHome },
        { env: { HOME: globalHome } },
      );
      expect(update.exitCode, `update failed: ${update.output}`).toBe(EXIT_CODES.SUCCESS);

      // Pre-condition: both scopes' forks were seen as outdated and acted on. Without
      // this, every assertion below could hold on a run that updated nothing.
      expect(update.output, "both scopes' outdated skills must be updated in one run").toContain(
        "2 skill(s) updated",
      );
      expect(update.output).toContain(GLOBAL_FORK_ORIGIN);
      expect(update.output).toContain(PROJECT_FORK_ORIGIN);

      // Each scope's skills directory holds exactly its own fork: a skill written under
      // the wrong root shows up here as an extra directory.
      expect(
        await listFiles(skillsPath(globalHome)),
        "the global skills directory must hold only the global-scoped fork",
      ).toStrictEqual([GLOBAL_FORK_DIR]);
      expect(
        await listFiles(skillsPath(projectDir)),
        "the project skills directory must hold only the project-scoped fork",
      ).toStrictEqual([PROJECT_FORK_DIR]);

      // Each fork carries its own source skill's content, and only that.
      const globalSkillMd = await readTestFile(
        path.join(skillsPath(globalHome), GLOBAL_FORK_DIR, FILES.SKILL_MD),
      );
      expect(globalSkillMd, "the global fork must carry its own source skill").toContain(
        GLOBAL_MARKER,
      );
      expect(globalSkillMd).not.toContain(PROJECT_MARKER);

      const projectSkillMd = await readTestFile(
        path.join(skillsPath(projectDir), PROJECT_FORK_DIR, FILES.SKILL_MD),
      );
      expect(projectSkillMd, "the project fork must carry its own source skill").toContain(
        PROJECT_MARKER,
      );
      expect(projectSkillMd).not.toContain(GLOBAL_MARKER);

      // `update` rewrites skill content only — neither scope's config may move.
      expect(await readTestFile(configTsPath(globalHome))).toBe(globalConfigBefore);
      expect(await readTestFile(configTsPath(projectDir))).toBe(projectConfigBefore);
    },
  );
});
