import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName, StackAgentConfig } from "../../src/cli/types/index.js";

/**
 * Dual-scope partial removal: skill X is installed at BOTH scopes — a global copy
 * (in the global config, referenced by a global agent's stack) and the project's
 * own independent project-scoped copy (referenced by a project-scoped agent's
 * stack). Removing ONLY the global copy (edit at global scope) must strip X from
 * the global config while leaving the project's own project-scope entry — in both
 * skills[] and stack — completely untouched. The project is registered so global
 * propagation actually runs against it, proving it does not clobber the project's
 * own copy.
 */

const VITEST = "web-testing-vitest";
const WEB_DEVELOPER: AgentName = "web-developer";
const API_DEVELOPER: AgentName = "api-developer";

const globalStack = {
  [WEB_DEVELOPER]: {
    "web-testing": [{ id: VITEST, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

const projectStack = {
  [API_DEVELOPER]: {
    "web-testing": [{ id: VITEST, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

const vitestMetadata =
  `author: "@test"\ndisplayName: ${VITEST}\ncategory: web-testing\nslug: vitest\n` +
  `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
  `contentHash: "c3d4e5f"\n`;

describe("edit at global scope removes only the global copy of a dual-scope skill", () => {
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
    "strips the global copy and leaves the project-scope copy untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Seed a GLOBAL install (HOME === globalHome) that owns a global
      // vitest referenced by web-developer's stack, plus a registered project
      // that owns its OWN project-scoped vitest referenced by api-developer's
      // stack (and inlines the inherited global vitest in its skills[]).
      // ================================================================

      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");
      await mkdir(globalHome, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await createPermissionsFile(globalHome);
      await createPermissionsFile(projectDir);

      const globalConfig = buildProjectConfig({
        name: "dual-scope-global",
        skills: buildSkillConfigs([VITEST], { scope: "global", source: "eject" }),
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        domains: ["web"],
        selectedAgents: [WEB_DEVELOPER],
        stack: globalStack,
        projects: [realpathSync(projectDir)],
      });
      await writeProjectConfig(globalHome, globalConfig);
      await createLocalSkill(globalHome, VITEST, {
        description: "Global vitest copy",
        metadata: vitestMetadata,
      });

      // Project config inlines the inherited global vitest AND carries its own
      // project-scoped vitest. api-developer (project-scoped) references it.
      const projectConfig = buildProjectConfig({
        name: "dual-scope-project",
        skills: [
          ...buildSkillConfigs([VITEST], { scope: "global", source: "eject" }),
          ...buildSkillConfigs([VITEST], { scope: "project", source: "eject" }),
        ],
        agents: buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
        selectedAgents: [API_DEVELOPER],
        stack: projectStack,
      });
      await writeProjectConfig(projectDir, projectConfig);
      await createLocalSkill(projectDir, VITEST, {
        description: "Project's own vitest copy",
        metadata: vitestMetadata,
      });

      // ================================================================
      // Phase 2: Run `cc edit` at global scope and deselect vitest. This
      // removes the GLOBAL copy only and triggers propagation to the project.
      // ================================================================

      const wizard = await EditWizard.launch({
        projectDir: globalHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: globalHome },
        rows: 60,
        cols: 120,
      });

      await wizard.build.selectSkill(VITEST);

      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // ================================================================
      // Phase 3a: Global config — vitest gone from skills[] and stack.
      // ================================================================

      const globalLoaded = await loadProjectConfigFromDir(globalHome);
      expect(globalLoaded, "global config.ts must exist after edit").not.toBeNull();
      if (!globalLoaded) return;
      const g = globalLoaded.config;
      expect(g.skills.map((s) => s.id)).not.toContain(VITEST);
      expect(g.stack?.[WEB_DEVELOPER]?.["web-testing"]).toBeUndefined();

      // ================================================================
      // Phase 3b: Project config — the project's OWN project-scope vitest entry
      // (skills[] and stack) is completely untouched. Proof-of-execution: the
      // inherited global vitest is dropped, showing propagation actually ran.
      // ================================================================

      const projectLoaded = await loadProjectConfigFromDir(projectDir);
      expect(projectLoaded, "project config.ts must exist after edit").not.toBeNull();
      if (!projectLoaded) return;
      const p = projectLoaded.config;

      // Proof-of-execution: propagation rewrote the project, dropping the stale
      // inherited global vitest. Without this, the assertions below could pass
      // vacuously on an untouched file.
      expect(
        p.skills.filter((s) => s.scope === "global").length,
        "propagation must drop the inherited global vitest from the project",
      ).toBe(0);

      // The project's own project-scope vitest survives, unchanged.
      const projectVitest = p.skills.find((s) => s.id === VITEST && s.scope === "project");
      expect(
        projectVitest,
        "project's own project-scope vitest must survive the global removal",
      ).toStrictEqual({ id: VITEST, scope: "project", source: "eject" });

      // The project agent's stack still references its project-scope vitest.
      expect(
        p.stack?.[API_DEVELOPER]?.["web-testing"],
        "project agent stack must still reference the project-scope vitest",
      ).toStrictEqual([{ id: VITEST, preloaded: false }]);

      // Filesystem side: the project's own eject skill dir is untouched.
      expect(
        await directoryExists(path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, VITEST)),
        "project's own vitest skill dir must remain",
      ).toBe(true);
    },
  );
});
