import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  writeProjectConfig,
  createPermissionsFile,
  createLocalSkill,
  agentsPath,
  fileExists,
  readTestFile,
  renderMetadataYaml,
  writeAgentFile,
} from "../helpers/test-utils.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * Bug A regression test: edit command must route agent compilation output
 * to the correct scope directory.
 *
 * Scenario: A project has both global and project configs. The global config has
 * web-developer (scope: global). The project config has both web-developer (global)
 * and api-developer (project). After running edit and recompiling agents, each
 * agent's compiled output must land in its scope-appropriate directory:
 *   - global agents -> <HOME>/.claude/agents/
 *   - project agents -> <projectDir>/.claude/agents/
 */

describe("edit recompile routes agents to correct scope directory", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempHOME: string | undefined;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempHOME) {
      await cleanupTempDir(tempHOME);
      tempHOME = undefined;
    }
  });

  it(
    "should route global agents to ~/.claude/agents/ and project agents to project/.claude/agents/",
    { timeout: TIMEOUTS.SETUP },
    async () => {
      tempHOME = await createTempDir();
      const projectDir = path.join(tempHOME, "project");

      // --- Setup global config at <tempHOME>/.claude-src/config.ts ---
      await writeProjectConfig(tempHOME, {
        name: "global",
        skills: [{ id: "web-framework-react", scope: "global", source: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
        domains: ["web"],
      });

      // Create global skill directory with SKILL.md and metadata.yaml
      await createLocalSkill(tempHOME, "web-framework-react", {
        description: "React framework",
        metadata: renderMetadataYaml({
          displayName: "web-framework-react",
          category: "web-framework",
          slug: "react",
          contentHash: "e2e-hash-react",
        }),
      });

      // Create global agent file (stub — will be overwritten by recompilation)
      await writeAgentFile(tempHOME, E2E_AGENT["web-developer"].name, {
        frontmatter: true,
        body: "STUB: global web developer agent.\n",
      });

      // --- Setup project config at <tempHOME>/project/.claude-src/config.ts ---
      // web-developer is global-scoped, api-developer is project-scoped.
      // The config includes "web-styling-tailwind" — a skill that does NOT exist
      // in the E2E source. The wizard drops it, creating a "removed" change
      // that triggers the full edit flow (config write + agent recompilation).
      await writeProjectConfig(projectDir, {
        name: "bug-a-test",
        skills: [
          { id: "web-framework-react", scope: "global", source: "eject" },
          { id: "web-testing-vitest", scope: "project", source: "eject" },
          { id: "web-styling-tailwind", scope: "project", source: "eject" },
        ],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "global" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
        selectedAgents: [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
        domains: ["web"],
      });

      // Create project skill directories
      for (const skill of [
        { id: "web-framework-react", category: "web-framework", slug: "react" },
        { id: "web-testing-vitest", category: "web-testing", slug: "vitest" },
        { id: "web-styling-tailwind", category: "web-styling", slug: "tailwind" },
      ] as const) {
        await createLocalSkill(projectDir, skill.id, {
          description: `${skill.id} skill`,
          metadata: renderMetadataYaml({
            displayName: skill.id,
            category: skill.category,
            slug: skill.slug,
            contentHash: `e2e-hash-${skill.slug}`,
          }),
        });
      }

      // Create project agent file for api-developer (stub)
      await writeAgentFile(projectDir, E2E_AGENT["api-developer"].name, {
        frontmatter: true,
        body: "STUB: project api developer agent.\n",
      });

      // Create permissions file to prevent blocking prompt
      await createPermissionsFile(projectDir);

      // --- Action: run edit wizard, navigate through without changes ---
      // Agent definitions come from the CLI built-ins (web-developer, api-developer).
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: tempHOME },
      });

      // Single domain — advance through build -> sources -> agents -> confirm
      const result = await wizard.build.saveFromBuild("edit");

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // --- Assert: agents were routed to correct scope directories ---

      // 1. Global agent: web-developer.md should exist at <tempHOME>/.claude/agents/
      //    and should have been recompiled (no longer the "STUB" content)
      const globalWebDevPath = path.join(
        agentsPath(tempHOME),
        `${E2E_AGENT["web-developer"].name}.md`,
      );
      expect(
        await fileExists(globalWebDevPath),
        "Global agent web-developer.md should exist in ~/.claude/agents/",
      ).toBe(true);

      const globalWebDevContent = await readTestFile(globalWebDevPath);
      expect(
        globalWebDevContent,
        "Global agent web-developer.md should have been recompiled (not the stub)",
      ).not.toContain("STUB");

      // 2. Project agent: api-developer.md should exist at <projectDir>/.claude/agents/
      //    and should have been recompiled (no longer the "STUB" content)
      const projectApiDevPath = path.join(
        agentsPath(projectDir),
        `${E2E_AGENT["api-developer"].name}.md`,
      );
      expect(
        await fileExists(projectApiDevPath),
        "Project agent api-developer.md should exist in project/.claude/agents/",
      ).toBe(true);

      const projectApiDevContent = await readTestFile(projectApiDevPath);
      expect(
        projectApiDevContent,
        "Project agent api-developer.md should have been recompiled (not the stub)",
      ).not.toContain("STUB");

      // 3. Cross-contamination check: web-developer should NOT have been recompiled
      //    into the project agents directory.
      const projectWebDevPath = path.join(
        agentsPath(projectDir),
        `${E2E_AGENT["web-developer"].name}.md`,
      );
      expect(
        await fileExists(projectWebDevPath),
        "Global-scoped web-developer.md should NOT be recompiled into project/.claude/agents/",
      ).toBe(false);
    },
  );
});
