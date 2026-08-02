import path from "path";
import { realpathSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  readTestFile,
  renderMetadataYaml,
  renderSkillMd,
  skillsPath,
  writeConfigTypes,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * Q6 — `update` rewrites the skill content that registered projects' compiled
 * agents were built from, so it owes those projects a recompile.
 *
 * A home-scope `update` replaces `~/.claude/skills/<dir>/` in place and recompiles
 * the agents at the cwd only. Every registered project compiled its own
 * `.claude/agents/*.md` from that same global skills directory, and nothing
 * rewrites them — so the instant the update lands, each registered project is
 * serving its agents guidance the source no longer contains, with no signal that
 * anything went stale.
 *
 * This is the content twin of the propagation the config gate already performs for
 * a global CONFIG change, and the helper the fix needs already exists:
 * `recompilePropagatedProjectAgents`.
 *
 * FIXTURE NOTE — why the installed fork is named for a different skill than the
 * one it forked from: the source loader merges every local skill into the matrix
 * by id, so a local directory named after the source skill it came from REPLACES
 * that source entry and `update` classifies it "local-only" instead of outdated
 * (the same reason `update.e2e.test.ts` forks under a different name). So the
 * global install here holds `web-meta-framework-nextjs` forked from the source's
 * react at a stale hash, and the update brings the source's react across into it.
 * The project's stack holds both ids, so the compiled agent quotes the stale fork
 * before and must quote the refreshed react after.
 *
 * The marker text is written into BOTH the source skill's `cliDescription` and its
 * `SKILL.md` body, so the spec cannot pass or fail on which of the two the agent
 * template happens to render.
 *
 * CURRENTLY RED, deliberately: `update` prints no propagated-recompile line and
 * the registered project's compiled agent still carries the pre-update text.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

/** The directory the stale global fork lives in, and the id it reports until the update. */
const STALE_FORK_ID = "web-meta-framework-nextjs";

/** What the registered project's compiled agent quotes BEFORE the update. */
const STALE_GUIDANCE = "Stale guidance predating the update";

/**
 * What it must quote after. Unique enough that it can only have come from the
 * source this spec rewrote.
 */
const REFRESHED_GUIDANCE = "Refreshed guidance E2E-UPDATE-MARKER-7f3a";

/** Content hash on the installed fork — stale by construction, so `update` acts. */
const INSTALLED_HASH = "0000000";

/** Content hash the rewritten source advertises. */
const REFRESHED_HASH = "9999999";

/** Metadata for the installed global fork: forked from the source's react, stale. */
const staleForkMetadata = renderMetadataYaml({
  author: "@agents-inc",
  displayName: STALE_FORK_ID,
  category: "web-meta-framework",
  domain: "web",
  slug: "nextjs",
  cliDescription: STALE_GUIDANCE,
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: INSTALLED_HASH,
  forkedFrom: { skillId: E2E_SKILL.react.id, contentHash: INSTALLED_HASH, date: "2025-01-01" },
});

/** Metadata the rewritten source skill advertises. */
const refreshedSourceMetadata = renderMetadataYaml({
  author: "@agents-inc",
  displayName: E2E_SKILL.react.id,
  category: "web-framework",
  domain: "web",
  slug: E2E_SKILL.react.slug,
  cliDescription: REFRESHED_GUIDANCE,
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: REFRESHED_HASH,
});

/** Rewrites the source's react skill so `update` has something to bring across. */
async function refreshSourceSkill(sourceDir: string): Promise<void> {
  const skillDir = path.join(sourceDir, SOURCE_PATHS.SKILLS_DIR, E2E_SKILL.react.id);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, FILES.SKILL_MD),
    renderSkillMd(E2E_SKILL.react.id, REFRESHED_GUIDANCE, `# ${REFRESHED_GUIDANCE}`),
  );
  await writeFile(path.join(skillDir, FILES.METADATA_YAML), refreshedSourceMetadata);
}

function compiledAgentPath(dir: string, agentName: string): string {
  return path.join(dir, DIRS.CLAUDE, DIRS.AGENTS, `${agentName}.md`);
}

describe("update refreshes the compiled agents of registered projects", () => {
  let tempDir: string | undefined;
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "rewrites a registered project's compiled agent with the updated skill content",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "global-home");
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      // --- The registered project: one project-scoped agent whose stack holds the
      // globally-installed skills, so its compiled agent quotes their text.
      await writeProjectConfig(projectDir, {
        name: "project-test",
        skills: [
          { id: STALE_FORK_ID, scope: "global", source: "eject" },
          { id: E2E_SKILL.react.id, scope: "global", source: "eject" },
        ],
        agents: [{ name: API_DEV, scope: "project" }],
        domains: ["web"],
        selectedAgents: [API_DEV],
        stack: {
          [API_DEV]: {
            "web-meta-framework": [{ id: STALE_FORK_ID, preloaded: false }],
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: false }],
          },
        },
      });
      await writeConfigTypes(projectDir);

      // --- The home-scope install, registering the project by realpath (as
      // registerProjectPath does).
      await writeProjectConfig(globalHome, {
        name: "global-test",
        skills: [{ id: STALE_FORK_ID, scope: "global", source: "eject" }],
        agents: [{ name: WEB_DEV, scope: "global" }],
        domains: ["web"],
        selectedAgents: [WEB_DEV],
        stack: { [WEB_DEV]: { "web-meta-framework": [{ id: STALE_FORK_ID, preloaded: false }] } },
        projects: [realpathSync(projectDir)],
      });
      await writeConfigTypes(globalHome);
      await createLocalSkill(globalHome, STALE_FORK_ID, {
        description: STALE_GUIDANCE,
        body: `# ${STALE_GUIDANCE}`,
        metadata: staleForkMetadata,
      });

      const compile = await CLI.run(
        ["compile"],
        { dir: projectDir, globalHome },
        { env: { HOME: globalHome } },
      );
      expect(compile.exitCode, `compile failed: ${compile.output}`).toBe(EXIT_CODES.SUCCESS);

      // Pre-condition: the project's compiled agent really is built from the
      // global skills directory, so a change there is a change to this file.
      const agentBefore = await readTestFile(compiledAgentPath(projectDir, API_DEV));
      expect(
        agentBefore,
        "the project's compiled agent must quote the global skill it was built from",
      ).toContain(STALE_GUIDANCE);
      expect(agentBefore).not.toContain(REFRESHED_GUIDANCE);

      await refreshSourceSkill(sourceDir);

      const update = await CLI.run(
        ["update", "--yes", "--source", sourceDir],
        { dir: globalHome, globalHome },
        { env: { HOME: globalHome } },
      );
      expect(update.exitCode, `update failed: ${update.output}`).toBe(EXIT_CODES.SUCCESS);

      // Pre-condition: the update genuinely brought the new content across.
      expect(update.output, "the outdated global skill must have been updated").toContain(
        "1 skill(s) updated",
      );
      expect(
        await readTestFile(path.join(skillsPath(globalHome), STALE_FORK_ID, FILES.METADATA_YAML)),
        "the installed global skill must carry the refreshed metadata",
      ).toContain(REFRESHED_GUIDANCE);

      expect(
        update.output,
        "update must report the registered projects whose agents it recompiled",
      ).toContain(STEP_TEXT.PROPAGATED_RECOMPILE);

      expect(
        await readTestFile(compiledAgentPath(projectDir, API_DEV)),
        "the registered project's compiled agent must carry the refreshed skill content",
      ).toContain(REFRESHED_GUIDANCE);
    },
  );
});
