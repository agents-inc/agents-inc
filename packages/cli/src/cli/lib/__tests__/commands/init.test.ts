import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { getDashboardData, formatDashboardText } from "../../../commands/init";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_BRANDING,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";
import { renderConfigTs } from "../content-generators";
import { EXPECTED_SKILLS } from "../expected-values";
import type { BrandingConfig } from "../../../types";

/**
 * A `branding.name` a project config supplies, sharing no substring with
 * {@link DEFAULT_BRANDING.NAME} so neither half of a paired assertion can be satisfied by the
 * other's output.
 */
const WHITE_LABEL_NAME = "Northwind";

/**
 * Writes the `.claude-src/config.ts` the dashboard reads: a project declaring no skills, carrying
 * a `branding` block only when one is named — the two states the title line is asserted over.
 */
async function writeDashboardConfig(projectDir: string, branding?: BrandingConfig): Promise<void> {
  const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(configDir, STANDARD_FILES.CONFIG_TS),
    renderConfigTs({
      name: "test-project",
      skills: [],
      ...(branding !== undefined && { branding }),
    }),
  );
}

describe("init command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-init-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("already initialized — dashboard", () => {
    it("should show dashboard when project is already initialized", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      // A real installation: the config declares skills so it is detected as
      // installed. A config declaring neither skills nor agents is content-less
      // and routes to the setup wizard, not the dashboard.
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({
          name: "test-project",
          skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
        }),
      );

      const { stdout, stderr, error } = await runCliCommand(["init"]);

      // Should NOT have an error exit code — dashboard exits with SUCCESS
      expect(error?.oclif?.exit).toBeUndefined();

      const combinedOutput = stdout + stderr + (error?.message || "");
      expect(combinedOutput).toContain("Agents Inc.");
      expect(combinedOutput).toContain("Skills:");
      expect(combinedOutput).toContain("Agents:");
      expect(combinedOutput).toContain("[Edit]");
      expect(combinedOutput).toContain("[Compile]");
      expect(combinedOutput).toContain("[Doctor]");
      expect(combinedOutput).toContain("[List]");
    });

    it("should show skill and agent counts in dashboard", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({
          name: "test-project",
          skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
        }),
      );

      // Install the declared skills — the dashboard reports what is on disk
      for (const skillId of EXPECTED_SKILLS.WEB_DEFAULT) {
        await mkdir(path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId), {
          recursive: true,
        });
      }

      // Create compiled agents
      const agentsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), "# Web Developer");
      await writeFile(path.join(agentsDir, "api-developer.md"), "# API Developer");

      const data = await getDashboardData(projectDir);
      expect(data.skillCount).toBe(2);
      expect(data.agentCount).toBe(2);
      expect(data.mode).toBe("eject");

      const text = formatDashboardText(data);
      expect(text).toContain("2 installed");
      expect(text).toContain("2 compiled");
    });

    it("should show source when configured", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({
          name: "test-project",
          skills: [],
          marketplace: TEST_SOURCE_URL,
        }),
      );

      const data = await getDashboardData(projectDir);
      expect(data.source).toBe("github:agents-inc/skills");

      const text = formatDashboardText(data);
      expect(text).toContain("github:agents-inc/skills");
    });

    /**
     * The dashboard's title line follows `branding.name`. Paired with the default below because
     * neither half means anything alone: the configured one passes on a title hardcoded to the
     * fixture, and the default one passes on a title that reads no config at all.
     */
    it("should title the dashboard with the configured branding name", async () => {
      await writeDashboardConfig(projectDir, { name: WHITE_LABEL_NAME });

      const data = await getDashboardData(projectDir);
      expect(data.name).toBe(WHITE_LABEL_NAME);

      const text = formatDashboardText(data);
      expect(text).toContain(WHITE_LABEL_NAME);
      expect(text, "the configured name replaces the shipped one").not.toContain(
        DEFAULT_BRANDING.NAME,
      );
    });

    it("should title the dashboard with the shipped name when no branding is configured", async () => {
      await writeDashboardConfig(projectDir);

      const data = await getDashboardData(projectDir);
      expect(data.name).toBe(DEFAULT_BRANDING.NAME);

      const text = formatDashboardText(data);
      expect(text).toContain(DEFAULT_BRANDING.NAME);
      expect(text).not.toContain(WHITE_LABEL_NAME);
    });

    it("should not modify existing config when already initialized", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      // A real installation (declares skills) so init shows the dashboard and
      // leaves the config untouched, rather than routing to the setup wizard.
      const originalContent = renderConfigTs({
        name: "test-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
      });
      await writeFile(configPath, originalContent);

      await runCliCommand(["init"]);

      const { readFile } = await import("fs/promises");
      const content = await readFile(configPath, "utf-8");
      expect(content).toBe(originalContent);
    });

    it("should exit with SUCCESS when already initialized", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      // A real installation (declares skills) so init shows the dashboard, which
      // exits cleanly, rather than routing to the setup wizard.
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({
          name: "test-project",
          skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
        }),
      );

      const { error } = await runCliCommand(["init"]);

      // No error exit code — dashboard exits cleanly
      expect(error?.oclif?.exit).toBeUndefined();
    });

    it("should show 0 counts when skills and agents are empty", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({ name: "test-project", skills: [] }),
      );

      const data = await getDashboardData(projectDir);
      expect(data.skillCount).toBe(0);
      expect(data.agentCount).toBe(0);

      const text = formatDashboardText(data);
      expect(text).toContain("0 installed");
      expect(text).toContain("0 compiled");
    });
  });

  describe("formatDashboardText", () => {
    it("should format dashboard with all fields", () => {
      const text = formatDashboardText({
        name: WHITE_LABEL_NAME,
        skillCount: 12,
        agentCount: 3,
        mode: "plugin",
        source: TEST_SOURCE_URL,
      });

      // The title is the name the formatter was HANDED, which is what makes this a formatter of
      // its data rather than of a constant. `getDashboardData` is where that name is resolved.
      expect(text).toContain(WHITE_LABEL_NAME);
      expect(text).toContain("12 installed");
      expect(text).toContain("3 compiled");
      expect(text).toContain("Plugin");
      expect(text).toContain("github:agents-inc/skills");
      expect(text).toContain("[Edit]");
      expect(text).toContain("[Compile]");
      expect(text).toContain("[Doctor]");
      expect(text).toContain("[List]");
    });

    it("should omit source line when not configured", () => {
      const text = formatDashboardText({
        name: DEFAULT_BRANDING.NAME,
        skillCount: 0,
        agentCount: 0,
        mode: "eject",
      });

      expect(text).toContain("Eject");
      expect(text).not.toContain("Source:");
    });

    it("should show Eject for eject mode", () => {
      const text = formatDashboardText({
        name: DEFAULT_BRANDING.NAME,
        skillCount: 5,
        agentCount: 2,
        mode: "eject",
      });

      expect(text).toContain("Eject");
    });

    it("should show Plugin for plugin mode", () => {
      const text = formatDashboardText({
        name: DEFAULT_BRANDING.NAME,
        skillCount: 5,
        agentCount: 2,
        mode: "plugin",
      });

      expect(text).toContain("Plugin");
    });
  });
});
