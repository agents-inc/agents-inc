import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  loadConfigOrFail,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName, StackAgentConfig } from "../../src/cli/types/index.js";

/**
 * Project-scope twin of edit-remove-last-skill-stack-cleanup.e2e.test.ts (which
 * exercises the same removal at GLOBAL scope). Verifies the buildStackForSelection
 * `{}`-not-`undefined` fix holds when the edit runs at PROJECT scope
 * (authoritativeScope "owned", HOME distinct from the project dir) rather than at
 * global scope. A non-preloaded project-scoped skill is the only entry in an
 * agent's stack category; deselecting it must leave no stale reference in `stack`.
 */

const singleSkillStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

describe("edit removes the only project-scoped skill an agent references", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "does not leave the removed skill behind in the project stack property",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Seed a PROJECT installation (HOME distinct from the project
      // dir) where web-testing-vitest is the ONLY skill and the ONLY entry in
      // web-developer's stack. vitest is a non-preloaded (dynamic) skill, so it
      // can be deselected on its own — removing it collapses the whole selection
      // to empty, the trigger condition for the merge-fallback bug.
      // ================================================================

      tempDir = await createTempDir();
      const fakeHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");
      await mkdir(fakeHome, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await createPermissionsFile(fakeHome);
      await createPermissionsFile(projectDir);

      const config = buildProjectConfig({
        name: "project-scope-edit-test",
        skills: buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "project", source: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        selectedDomains: ["web"],
        stack: singleSkillStack,
      });
      await writeProjectConfig(projectDir, config);

      await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
        description: "Vitest testing framework for project-scope edit testing",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.vitest.id,
          category: "web-testing",
          slug: E2E_SKILL.vitest.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "c3d4e5f",
        }),
      });

      // ================================================================
      // Phase 2: Run `cc edit` at PROJECT scope and deselect vitest entirely.
      // projectDir differs from HOME, so cwd !== GLOBAL_INSTALL_ROOT and the
      // edit writes with authoritativeScope "owned".
      // ================================================================

      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // vitest is currently selected — pressing Space deselects it. It is a
      // project-scoped, non-preloaded skill, so the deselect goes through.
      await wizard.build.selectSkill(E2E_SKILL.vitest.id);

      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // ================================================================
      // Phase 3: Assert on the post-edit project config (structural load) AND
      // the filesystem.
      // ================================================================

      const finalConfig = await loadConfigOrFail(projectDir);

      // Sanity: vitest is gone from the top-level skills roster.
      expect(finalConfig.skills.map((s) => s.id)).not.toContain(E2E_SKILL.vitest.id);

      // Filesystem side: the removed eject skill's directory is deleted.
      const removedSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.vitest.id);
      expect(
        await directoryExists(removedSkillDir),
        "removed skill's directory must be deleted from the project",
      ).toBe(false);

      // The stack must not retain a reference to the removed skill. web-testing
      // was vitest's only category and vitest was web-developer's only stack
      // entry, so the whole web-developer stack should be gone.
      const webTestingAssignments =
        finalConfig.stack?.[E2E_AGENT["web-developer"].name]?.["web-testing"];
      expect(
        webTestingAssignments,
        "web-developer stack must not retain the removed web-testing-vitest",
      ).toBeUndefined();
    },
  );
});
