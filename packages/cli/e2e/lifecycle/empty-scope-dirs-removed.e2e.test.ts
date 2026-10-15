import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  fileExists,
  FORKED_FROM_METADATA,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  recordInstallSource,
  renderMetadataYaml,
  runCLI,
  skillsPath,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { CLAUDE_DIR } from "../../src/cli/consts.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * A scope directory (`.claude/skills/`, `.claude/agents/`) is an artefact of what
 * it holds. When a removal empties it, the directory itself must go — and no flow
 * may pre-create one it has nothing to put in.
 *
 * Emptiness is FILESYSTEM emptiness, never roster emptiness: a hand-authored agent
 * or any user-owned file keeps its directory alive, and `.claude/` itself is
 * uninstall's decision, not the edit/compile path's.
 */

// Basename outside the AgentName union — a file the CLI never compiled and never prunes.
const HAND_AUTHORED_AGENT = "my-custom-agent";

const webDeveloperStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const reactSkillMetadata = renderMetadataYaml({
  displayName: E2E_SKILL.react.display,
  category: "web-framework",
  slug: E2E_SKILL.react.slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "empty-scope-dirs-react",
});

/** The project's react kept, with no sub-agent left to hold it. */
const NO_AGENT_ID = "NoAgent2";

/** The global installation's sub-agent kept, with no skill left in it. */
const NO_SKILL_ID = "NoSkill1";

describe("empty scope directories", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      NO_AGENT_ID,
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: buildSeedSkill({ scope: "project", assignments: {} }) },
      }),
    );
    store.publish(
      NO_SKILL_ID,
      buildSeedPayload({
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "global" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  /** A fresh temp dir holding an empty fake HOME beside an empty project dir. */
  const createEnvironment = async (): Promise<{ fakeHome: string; projectDir: string }> => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "home");
    await mkdir(fakeHome, { recursive: true });
    return { fakeHome, projectDir: path.join(tempDir, "project") };
  };

  /**
   * A project-scoped install naming `agents`: config plus the one ejected skill on
   * disk, so a compile pass has something to discover and is not skipped.
   */
  const seedProjectScopedInstall = async (
    projectDir: string,
    agents: AgentName[],
  ): Promise<void> => {
    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "project-scoped-install",
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs(agents, { scope: "project" }),
        selectedDomains: ["web"],
        ...(agents.length > 0 && { stack: webDeveloperStack }),
      }),
    );
    await createLocalSkill(projectDir, E2E_SKILL.react.id, {
      description: "Project-scoped skill so the compile pass is not skipped",
      metadata: reactSkillMetadata,
    });
  };

  it(
    "a wholly project-scoped compile leaves the global agents directory uncreated",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await createEnvironment();
      await seedProjectScopedInstall(projectDir, [E2E_AGENT["web-developer"].name]);

      // Setup proof: nothing under HOME yet, so a directory found afterwards was
      // created by this run and not carried in by the fixture.
      expect(
        await directoryExists(agentsPath(fakeHome)),
        "the fake home must start without a global agents directory",
      ).toBe(false);
      const configBefore = await readTestFile(configTsPath(projectDir));

      const { exitCode, combined } = await runCLI(["compile"], projectDir, {
        env: { HOME: fakeHome },
      });
      expect(exitCode, `compile must succeed; output:\n${combined}`).toBe(EXIT_CODES.SUCCESS);

      // Subject guard: the project agent really was compiled, so the assertion
      // below describes a pass that did work rather than one that no-opped.
      expect(
        await fileExists(
          path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`),
        ),
        "the project-scoped agent must be compiled into the project",
      ).toBe(true);
      expect(
        await readTestFile(configTsPath(projectDir)),
        "compile must not rewrite config.ts",
      ).toBe(configBefore);

      expect(
        await directoryExists(agentsPath(fakeHome)),
        "an install that routes no agent to global must not create ~/.claude/agents",
      ).toBe(false);
    },
  );

  it(
    "the agents directory goes when the prune leaves nothing in it",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await createEnvironment();
      // A config that still declares a skill but no agents: the compile pass runs
      // and prunes the agent a larger prior config left behind.
      await seedProjectScopedInstall(projectDir, []);
      await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });

      expect(
        await listFiles(agentsPath(projectDir)),
        "the stale compiled agent must be on disk before the compile",
      ).toStrictEqual([`${E2E_AGENT["web-developer"].name}.md`]);
      const configBefore = await readTestFile(configTsPath(projectDir));

      const { exitCode, combined } = await runCLI(["compile"], projectDir, {
        env: { HOME: fakeHome },
      });
      expect(exitCode, `compile must succeed; output:\n${combined}`).toBe(EXIT_CODES.SUCCESS);

      expect(
        await readTestFile(configTsPath(projectDir)),
        "compile must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        await directoryExists(agentsPath(projectDir)),
        "an agents directory the prune emptied must not survive",
      ).toBe(false);
      expect(
        await directoryExists(path.join(projectDir, CLAUDE_DIR)),
        ".claude itself is uninstall's decision — compile must leave it alone",
      ).toBe(true);
    },
  );

  it(
    "the agents directory stays while a hand-authored agent is still in it",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await createEnvironment();
      await seedProjectScopedInstall(projectDir, []);
      await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });
      await writeAgentFile(projectDir, HAND_AUTHORED_AGENT);

      const { exitCode, combined } = await runCLI(["compile"], projectDir, {
        env: { HOME: fakeHome },
      });
      expect(exitCode, `compile must succeed; output:\n${combined}`).toBe(EXIT_CODES.SUCCESS);

      expect(
        await directoryExists(agentsPath(projectDir)),
        "a directory that still holds anything must never be deleted",
      ).toBe(true);
      expect(await listFiles(agentsPath(projectDir))).toStrictEqual([`${HAND_AUTHORED_AGENT}.md`]);
    },
  );

  it(
    "removing the last agent takes the agents directory with it",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await createEnvironment();
      await seedProjectScopedInstall(projectDir, [E2E_AGENT["web-developer"].name]);
      // The compiled artefact a prior install left behind — what the removal deletes.
      await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });

      expect(
        await listFiles(agentsPath(projectDir)),
        "the compiled agent must be the only thing in the agents directory before the edit",
      ).toStrictEqual([`${E2E_AGENT["web-developer"].name}.md`]);

      // A PROJECT context (HOME is a separate empty dir), so the recompile runs
      // its scope-filtered passes and prunes nothing — the removal itself is
      // the only thing that empties the directory.
      await recordInstallSource([projectDir], E2E_SOURCE.sourceDir);
      const result = await applyEditFrom(store, NO_AGENT_ID, {
        dir: projectDir,
        globalHome: fakeHome,
      });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      // Config side: no agent is left active in the roster.
      const finalConfig = await loadConfigOrFail(projectDir);
      expect(
        finalConfig.agents.filter((agent) => !agent.excluded).map((agent) => agent.name),
        "the removed agent must not remain active in config.ts",
      ).toStrictEqual([]);

      // Filesystem side: the compiled file goes, and so does the directory it emptied.
      expect(
        await fileExists(
          path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`),
        ),
        "the removed agent's compiled file must be deleted",
      ).toBe(false);
      expect(
        await directoryExists(agentsPath(projectDir)),
        "an agents directory the removal emptied must not survive it",
      ).toBe(false);
      expect(
        await directoryExists(path.join(projectDir, CLAUDE_DIR)),
        ".claude itself is uninstall's decision — the edit path must leave it alone",
      ).toBe(true);
    },
  );

  it(
    "the agents directory stays when a hand-authored agent outlives the removed one",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await createEnvironment();
      await seedProjectScopedInstall(projectDir, [E2E_AGENT["web-developer"].name]);
      await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });
      await writeAgentFile(projectDir, HAND_AUTHORED_AGENT);

      await recordInstallSource([projectDir], E2E_SOURCE.sourceDir);
      const result = await applyEditFrom(store, NO_AGENT_ID, {
        dir: projectDir,
        globalHome: fakeHome,
      });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      // Emptiness is FILESYSTEM emptiness: the roster is empty, the directory is not.
      expect(
        await directoryExists(agentsPath(projectDir)),
        "a hand-authored agent keeps the directory alive whatever the roster says",
      ).toBe(true);
      expect(await listFiles(agentsPath(projectDir))).toStrictEqual([`${HAND_AUTHORED_AGENT}.md`]);
    },
  );

  it(
    "removing the last ejected skill takes the skills directory with it",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome: globalHome } = await createEnvironment();

      // Global install (HOME === project dir) where react is the ONLY skill, so
      // removing it empties ~/.claude/skills/ outright.
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "last-skill-global",
          skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
          selectedDomains: ["web"],
          stack: webDeveloperStack,
        }),
      );
      // Fork provenance, so the round trip owns the copy and the apply may remove it.
      await createLocalSkill(globalHome, E2E_SKILL.react.id, {
        description: "The only installed skill",
        metadata: FORKED_FROM_METADATA,
      });
      // Puts settings.json in .claude/, so ".claude survived" is a claim about
      // .claude rather than about a directory that had nothing else in it anyway.
      await createPermissionsFile(globalHome);

      expect(
        await listFiles(skillsPath(globalHome)),
        "the skills directory must hold exactly the one skill before the edit",
      ).toStrictEqual([E2E_SKILL.react.id]);

      await recordInstallSource([globalHome], E2E_SOURCE.sourceDir);
      const result = await applyEditFrom(store, NO_SKILL_ID, { dir: globalHome });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      // Config side: the skill is gone from the roster.
      const finalConfig = await loadConfigOrFail(globalHome);
      expect(finalConfig.skills.map((s) => s.id)).not.toContain(E2E_SKILL.react.id);

      // Filesystem side: the copied directory goes, and so does the now-empty
      // scope directory that held it.
      expect(await directoryExists(path.join(skillsPath(globalHome), E2E_SKILL.react.id))).toBe(
        false,
      );
      expect(
        await directoryExists(skillsPath(globalHome)),
        "an emptied skills directory must not survive the removal",
      ).toBe(false);
      expect(
        await directoryExists(path.join(globalHome, CLAUDE_DIR)),
        ".claude itself is uninstall's decision — the edit path must leave it alone",
      ).toBe(true);
    },
  );
});
