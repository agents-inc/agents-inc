import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  createTempDir,
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  writeProjectConfig,
  createPermissionsFile,
  createLocalSkill,
  writeAgentFile,
  readCompiledAgents,
  readTestFile,
  renderMetadataYaml,
} from "../helpers/test-utils.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";

/**
 * Bug B regression test: project config must not accumulate global-scoped skills
 * after running the edit wizard.
 *
 * Scenario: A project has both global and project configs. The global config has
 * web-framework-react (scope: global). The project config has web-testing-vitest
 * (scope: project). After a no-op edit (navigate through wizard without changes),
 * the project config should inline the global skill with scope: "global" exactly
 * once, alongside the project-scoped skill. The global skill must not be
 * duplicated or accumulated across re-edits.
 *
 * Code path under test:
 *   edit.tsx -> buildAndMergeConfig() -> writeScopedFromWizard() -> splitConfigByScope()
 */

describe("project config does not accumulate global skills after edit", () => {
  let tempHOME: string | undefined;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempHOME) {
      await cleanupTempDir(tempHOME);
      tempHOME = undefined;
    }
  });

  it(
    "should not add global skills to project config after no-op edit",
    { timeout: TIMEOUTS.SETUP },
    async () => {
      tempHOME = await createTempDir();
      const projectDir = path.join(tempHOME, "project");

      // --- Setup global config at <tempHOME>/.claude-src/config.ts ---
      await writeProjectConfig(tempHOME, {
        name: "global",
        skills: [{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
        selectedDomains: ["web"],
      });

      // Create global skill directory with SKILL.md and metadata.yaml
      await createLocalSkill(tempHOME, E2E_SKILL.react.id, {
        description: "React framework",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: "react",
          contentHash: "e2e-hash-react",
        }),
      });

      // Create global agent file
      await writeAgentFile(tempHOME, E2E_AGENT["web-developer"].name, {
        frontmatter: true,
        body: "Global web developer agent.\n",
      });

      // --- Setup project config at <tempHOME>/project/.claude-src/config.ts ---
      await writeProjectConfig(projectDir, {
        name: "bug-b-test",
        skills: [
          { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
          { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        selectedDomains: ["web"],
      });

      // Create project skill directory with SKILL.md and metadata.yaml
      await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
        description: "Vitest testing",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.vitest.display,
          category: "web-testing",
          slug: "vitest",
          contentHash: "e2e-hash-vitest",
        }),
      });

      // Create project agent file
      await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, {
        frontmatter: true,
        body: "Project web developer agent.\n",
      });

      // Create permissions file to prevent blocking prompt
      await createPermissionsFile(projectDir);

      const projectConfigPath = configTsPath(projectDir);

      // --- Action: run edit wizard, navigate through without changes ---
      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: tempHOME },
      });

      // Single domain — advance through build -> sources -> agents -> confirm
      const result = await wizard.build.saveFromBuild("edit");

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // --- Assert: project config inlines global skills with scope: "global" (no spread) ---
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.vitest.id, E2E_SKILL.react.id],
      });

      // Structural checks require raw file reading
      const updatedProjectConfig = await readTestFile(projectConfigPath);

      // The project config must NOT use the old `...globalConfig.skills` spread pattern
      expect(updatedProjectConfig).not.toContain("globalConfig.skills");
      expect(updatedProjectConfig).not.toContain("globalConfig.agents");

      // Key invariant: the global skill must appear exactly once in the skills array (no accumulation).
      // Structural load scopes the check to the skills array (the ID may also appear in the stack).
      const reactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);
      expect(
        reactEntries,
        "Global skill 'web-framework-react' should appear exactly once in skills array (no accumulation)",
      ).toHaveLength(1);

      // Also verify the global config still has its skill (it wasn't removed)
      await expect({ dir: tempHOME }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
      });

      // In this test, the installation is global-only (no project init was run).
      // Agents are compiled at HOME scope, not project scope — and the global config
      // above declares ONE sub-agent, so the roster is named rather than counted: the
      // parameterless `toHaveCompiledAgents()` that stood here was satisfied by the
      // agent file this spec's own setup wrote before the wizard ever ran. The named
      // matcher stays beside it because it also proves the file carries frontmatter.
      expect(Object.keys(await readCompiledAgents(tempHOME))).toStrictEqual([
        `${E2E_AGENT["web-developer"].name}.md`,
      ]);
      await expect({ dir: tempHOME }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
    },
  );
});
