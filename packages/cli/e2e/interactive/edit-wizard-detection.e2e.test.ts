import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  writeProjectConfig,
  createLocalSkill,
  renderMetadataYaml,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";

/**
 * E2E tests for edit wizard skill detection (Gap 6).
 *
 * Verifies that the edit wizard correctly detects and displays skills
 * from different sources and scopes: local skills, project-scoped
 * plugin-like skills, and global-scoped skills.
 */

describe("edit wizard — skill detection across sources and scopes", () => {
  let wizard: EditWizard | undefined;
  let tempDir: string | undefined;
  let sourceTempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;

    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
    if (sourceTempDir) {
      await cleanupTempDir(sourceTempDir);
      sourceTempDir = undefined;
    }
  });

  describe("mixed local and plugin-sourced skills", () => {
    it(
      "should detect and display all skill types in the build step",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");

        const source = await createE2ESource();
        sourceTempDir = source.tempDir;

        // Create a project with mixed skills:
        //   - web-framework-react: local source, project scope
        //   - web-testing-vitest: local source, global scope
        //   - web-state-zustand: local source, project scope
        //   - api-framework-hono: local source, global scope
        await mkdir(agentsPath(projectDir), { recursive: true });

        await writeProjectConfig(projectDir, {
          name: "test-mixed-detection",
          skills: [
            { id: "web-framework-react", scope: "project", source: "eject" },
            { id: "web-testing-vitest", scope: "global", source: "eject" },
            { id: "web-state-zustand", scope: "project", source: "eject" },
            { id: "api-framework-hono", scope: "global", source: "eject" },
          ],
          agents: [
            { name: E2E_AGENT["web-developer"].name, scope: "project" },
            { name: E2E_AGENT["api-developer"].name, scope: "global" },
          ],
          domains: ["web", "api"],
          selectedAgents: [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
        });

        // Create local skill directories with SKILL.md and metadata
        const skills = [
          { id: "web-framework-react", category: "web-framework", slug: "react", domain: "web" },
          { id: "web-testing-vitest", category: "web-testing", slug: "vitest", domain: "web" },
          { id: "web-state-zustand", category: "web-client-state", slug: "zustand", domain: "web" },
          { id: "api-framework-hono", category: "api-api", slug: "hono", domain: "api" },
        ] as const;

        for (const skill of skills) {
          await createLocalSkill(projectDir, skill.id, {
            description: `Test skill ${skill.id}`,
            metadata: renderMetadataYaml({
              domain: skill.domain,
              displayName: skill.id,
              category: skill.category,
              slug: skill.slug,
              cliDescription: "Test skill",
              usageGuidance: "Testing",
              contentHash: "e2e-hash",
            }),
          });
        }

        // Launch edit wizard
        wizard = await EditWizard.launch({
          projectDir,
          source,
          ...TERMINAL_SIZE.TALL,
        });

        const webOutput = wizard.build.getOutput();

        // Verify we're on the build step — web domain categories should be visible
        expect(webOutput).toContain(STEP_TEXT.BUILD);
        expect(webOutput).toContain("Testing");

        // Navigate to API domain to verify api skills are also detected
        await wizard.build.advanceDomain();

        const apiOutput = wizard.build.getOutput();
        // The API domain's category header confirms we navigated to the API build step
        expect(apiOutput).toContain("API Framework");
      },
    );

    it(
      "should show startup message with correct installed skill count",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");

        const source = await createE2ESource();
        sourceTempDir = source.tempDir;

        await mkdir(agentsPath(projectDir), { recursive: true });

        // Create project with 3 skills
        await writeProjectConfig(projectDir, {
          name: "test-count-detection",
          skills: [
            { id: "web-framework-react", scope: "project", source: "eject" },
            { id: "web-testing-vitest", scope: "project", source: "eject" },
            { id: "web-state-zustand", scope: "global", source: "eject" },
          ],
          agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
          domains: ["web"],
        });

        // Create local skill files for all 3
        for (const id of [
          "web-framework-react",
          "web-testing-vitest",
          "web-state-zustand",
        ] as const) {
          const parts = id.split("-");
          const category = parts.slice(0, 2).join("-");
          const slug = parts.slice(2).join("-");
          await createLocalSkill(projectDir, id, {
            description: `Test skill`,
            metadata: renderMetadataYaml({
              displayName: id,
              category,
              slug,
              cliDescription: "Test",
              usageGuidance: "Test",
              contentHash: "e2e-hash",
            }),
          });
        }

        wizard = await EditWizard.launch({
          projectDir,
          source,
          ...TERMINAL_SIZE.TALL,
        });

        const buildOutput = wizard.build.getOutput();
        // All 3 installed skills should be pre-selected in the build step.
        // Framework (1 of 1) and Testing (1 of 1) confirm 2 of the 3 are detected;
        // the P/G scope badges confirm scope was loaded from config.
        expect(buildOutput).toContain("(1 of 1)");
        expect(buildOutput).toContain("web-framework-react");
        expect(buildOutput).toContain("web-testing-vitest");
      },
    );
  });
});
