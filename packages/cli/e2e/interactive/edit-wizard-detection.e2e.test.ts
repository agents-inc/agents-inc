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
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";

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
            { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
            { id: E2E_SKILL.vitest.id, scope: "global", origin: "eject" },
            { id: E2E_SKILL.zustand.id, scope: "project", origin: "eject" },
            { id: E2E_SKILL.hono.id, scope: "global", origin: "eject" },
          ],
          agents: [
            { name: E2E_AGENT["web-developer"].name, scope: "project" },
            { name: E2E_AGENT["api-developer"].name, scope: "global" },
          ],
          selectedDomains: ["web", "api"],
        });

        // Create local skill directories with SKILL.md and metadata
        const skills = [
          {
            id: E2E_SKILL.react.id,
            display: E2E_SKILL.react.display,
            category: "web-framework",
            slug: "react",
            domain: "web",
          },
          {
            id: E2E_SKILL.vitest.id,
            display: E2E_SKILL.vitest.display,
            category: "web-testing",
            slug: "vitest",
            domain: "web",
          },
          {
            id: E2E_SKILL.zustand.id,
            display: E2E_SKILL.zustand.display,
            category: "web-client-state",
            slug: "zustand",
            domain: "web",
          },
          {
            id: E2E_SKILL.hono.id,
            display: E2E_SKILL.hono.display,
            category: "api-api",
            slug: "hono",
            domain: "api",
          },
        ] as const;

        for (const skill of skills) {
          await createLocalSkill(projectDir, skill.id, {
            description: `Test skill ${skill.id}`,
            metadata: renderMetadataYaml({
              domain: skill.domain,
              displayName: skill.display,
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

        // The scope badge is the only rendered signal that the wizard read each
        // skill's `scope` out of config rather than merely listing the source's
        // catalogue. Without it "detected across sources and scopes" and
        // "painted the grid" are the same assertion.
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display)).toStrictEqual([
          "P",
        ]);
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.vitest.display)).toStrictEqual([
          "G",
        ]);
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.zustand.display)).toStrictEqual([
          "P",
        ]);

        // Navigate to API domain to verify api skills are also detected
        await wizard.build.advanceDomain();

        const apiOutput = wizard.build.getOutput();
        // The API domain's category header confirms we navigated to the API build step
        expect(apiOutput).toContain("API Framework");
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.hono.display)).toStrictEqual([
          "G",
        ]);
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
            { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
            { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
            { id: E2E_SKILL.zustand.id, scope: "global", origin: "eject" },
          ],
          agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
          selectedDomains: ["web"],
        });

        // Create local skill files for all 3
        for (const skill of [E2E_SKILL.react, E2E_SKILL.vitest, E2E_SKILL.zustand] as const) {
          await createLocalSkill(projectDir, skill.id, {
            description: `Test skill`,
            metadata: renderMetadataYaml({
              ...metadataFieldsFor(skill.id),
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
        expect(buildOutput).toContain(E2E_SKILL.react.display);
        expect(buildOutput).toContain(E2E_SKILL.vitest.display);
        // The exclusive Framework category's own counter, read by name so a
        // "(1 of 1)" printed by some other category cannot stand in for it.
        expect(await wizard.build.getExclusiveCategorySelectedCount("Framework")).toBe(1);
        // The scope badges are what say the counts came from this config: the
        // two project-scoped skills and the one global-scoped skill each carry
        // the badge their config entry declares.
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display)).toStrictEqual([
          "P",
        ]);
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.vitest.display)).toStrictEqual([
          "P",
        ]);
        expect(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.zustand.display)).toStrictEqual([
          "G",
        ]);
      },
    );
  });
});
