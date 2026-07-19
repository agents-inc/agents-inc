import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { cleanupTempDir, ensureBinaryExists, isClaudeCLIAvailable } from "../helpers/test-utils.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { CLI } from "../fixtures/cli.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";

// Plugin-source fixture is required because local sources without
// marketplace.json now hard-error on default plugin-intent install.
// See feedback_no_plugin_to_eject_fallback.md.
const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("slug-based relationship rules", () => {
  let wizard: InitWizard | undefined;
  let fixture: E2EPluginSource | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (fixture) await cleanupTempDir(fixture.tempDir);
    fixture = undefined;
  });

  describe("conflict rules", () => {
    it(
      "should detect unresolved conflict references via validate",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // "angular-standalone" slug does not exist in the E2E source — should be flagged as unresolved
        fixture = await createE2EPluginSource({
          relationships: {
            conflicts: [
              {
                skills: ["react", "angular-standalone"],
                reason: "React and Angular are mutually exclusive frameworks",
              },
            ],
          },
        });

        wizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const { output } = await CLI.run(["validate"], result.project);

        // Slug resolution should detect that "angular-standalone" has no matching skill in the source
        expect(output).toContain("Unresolved slug");
        expect(output).toContain("angular-standalone");
      },
    );
  });

  describe("require rules", () => {
    it(
      "should detect unresolved require references via validate",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // "angular-standalone" is a valid SkillSlug but does not exist in the E2E source.
        // The slug must be valid for the rules file to pass schema validation,
        // but the matrix health check will then detect it as unresolved.
        fixture = await createE2EPluginSource({
          relationships: {
            requires: [
              {
                skill: "zustand",
                needs: ["angular-standalone"],
                reason: "Zustand needs Angular (testing unresolved reference)",
              },
            ],
          },
        });

        wizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const { output } = await CLI.run(["validate"], result.project);

        expect(output).toContain("Unresolved slug");
        expect(output).toContain("angular-standalone");
      },
    );
  });

  describe("valid source slugs are not reported as unresolved", () => {
    it(
      "should not flag E2E source slugs as unresolved references",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        fixture = await createE2EPluginSource({
          relationships: {
            conflicts: [
              {
                skills: ["react", "hono"],
                reason: "Test conflict with valid slugs only",
              },
            ],
            requires: [
              {
                skill: "zustand",
                needs: ["react"],
                reason: "Zustand requires React",
              },
            ],
            recommends: [
              {
                skill: "vitest",
                reason: "Vitest is recommended",
              },
            ],
          },
        });

        wizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const { output } = await CLI.run(["validate"], result.project);

        // Default rules may produce unresolved references for slugs not in E2E source
        // (e.g., "angular", "vue"), but E2E source slugs should all resolve cleanly.
        // When a slug resolves, its canonical SkillId (e.g., "web-framework-react")
        // exists in matrix.skills, so it won't be flagged as unresolved.
        // When a slug does NOT resolve, the raw slug string passes through as the
        // reference — only those unresolved raw slugs appear in the warning messages.
        //
        // Message format: "Skill 'X' has unresolved reference 'Y' in 'field'"
        // The quoted reference position must never hold an E2E skill's resolved ID.
        expect(output).not.toContain("unresolved reference 'web-framework-react'");
        expect(output).not.toContain("unresolved reference 'web-testing-vitest'");
        expect(output).not.toContain("unresolved reference 'web-state-zustand'");
        expect(output).not.toContain("unresolved reference 'api-framework-hono'");
      },
    );
  });

  describe("discourages rules", () => {
    it(
      "should detect unresolved discourages references via validate",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        fixture = await createE2EPluginSource({
          relationships: {
            discourages: [
              {
                skills: ["react", "angular-standalone"],
                reason: "React and Angular are discouraged together",
              },
            ],
          },
        });

        wizard = await InitWizard.launch({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });
        const result = await wizard.completeWithDefaults();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const { output } = await CLI.run(["validate"], result.project);

        // "angular-standalone" slug does not exist in the E2E source
        expect(output).toContain("Unresolved slug");
        expect(output).toContain("angular-standalone");
      },
    );
  });
});
