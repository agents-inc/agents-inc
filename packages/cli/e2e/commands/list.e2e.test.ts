import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  ensureBinaryExists,
  renderMetadataYaml,
  skillsPath,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";

describe("list command", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should show no installation found in empty directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["list"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.NO_INSTALLATION);
  });

  it("should work with ls alias", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["ls"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.NO_INSTALLATION);
  });

  it("should suggest running init when no installation found", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["list"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("init");
  });

  it("should display help text with --help flag", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["list", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("Show installation information");
  });

  it("should display help text with ls --help alias", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["ls", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("USAGE");
  });

  describe("with local installation", () => {
    it("should show installation details for a local project", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Installation:");
      expect(stdout).toContain("Eject");
      expect(stdout).toContain("Skills:");
      expect(stdout).toContain("Agents:");
    });

    it("should show correct skill count", async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react", "web-testing-vitest"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Skills:");
      expect(stdout).toContain("2");
    });

    it("should show mode as Local for local installations", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Mode:");
      expect(stdout).toContain("Eject");
    });

    it("should show config path in output", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Config:");
      expect(stdout).toContain(FILES.CONFIG_TS);
    });

    it("should show agent count when agents exist", async () => {
      const project = await ProjectBuilder.editable({
        agents: [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create agent markdown files in the agents directory
      await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name);
      await writeAgentFile(projectDir, E2E_AGENT["api-developer"].name);

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Agents:");
      expect(stdout).toContain("2");
    });
  });

  describe("with multiple skills installed", () => {
    // The list command currently only shows skill counts, not individual skill IDs.
    // This test asserts the user should see which skills are installed.
    it.fails("should show all skill IDs in output", async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("web-framework-react");
      expect(stdout).toContain("web-testing-vitest");
      expect(stdout).toContain("web-state-zustand");
    });
  });

  describe("skill type distinction", () => {
    // BUG: The list command only shows skill counts (e.g., "Skills: 3"), not individual
    // skill names or types. There is no distinction between CLI-managed skills (installed
    // from a source with forkedFrom metadata) and user-created skills (custom: true,
    // no forkedFrom). Users should be able to see which skills are custom vs managed.
    it.fails("should distinguish CLI-managed and user-created skills in output", async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react", "web-testing-vitest"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Add a user-created skill (custom: true, no forkedFrom)
      await createLocalSkill(projectDir, "web-utilities-date-fns", {
        description: "A user-created custom skill",
        metadata: renderMetadataYaml({
          custom: true,
          author: "@local",
          displayName: "My Custom Helper",
          category: "web-utilities",
          contentHash: "custom-hash",
        }),
      });

      const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // The output should show individual skills with some kind of type indicator
      expect(stdout).toContain("web-framework-react");
      expect(stdout).toContain("web-testing-vitest");
      expect(stdout).toContain("web-utilities-date-fns");
      // There should be a visible distinction between managed and custom skills
      expect(stdout).toMatch(/custom|user|local/i);
    });
  });

  describe("edge cases", () => {
    it("should handle project with skills directory but no config", async () => {
      tempDir = await createTempDir();

      // Create .claude/skills/ with a skill but no config.ts
      await mkdir(skillsPath(tempDir), { recursive: true });
      await createLocalSkill(tempDir, "web-animation-css-animations");

      const { exitCode, stdout } = await CLI.run(["list"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // Without config.ts, detectInstallation returns null
      expect(stdout).toContain(STEP_TEXT.NO_INSTALLATION);
    });

    it("should work with ls alias on a local installation", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const { exitCode, stdout } = await CLI.run(["ls"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Installation:");
      expect(stdout).toContain("Eject");
    });
  });

  describe("global installation fallback", () => {
    it("should show global installation details when no project config exists", async () => {
      tempDir = await createTempDir();

      // Create a "global home" directory with .claude-src/config.ts
      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(globalHome, {
        name: "global-test",
        skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      // Create skills directory with a skill folder so skill count > 0
      await mkdir(path.join(skillsPath(globalHome), "web-framework-react"), { recursive: true });

      // Create a project directory WITHOUT config (so detectInstallation falls back to global)
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      // Run list with HOME pointing to globalHome so detectGlobalInstallation finds the config
      const { exitCode, stdout } = await CLI.run(
        ["list"],
        { dir: projectDir },
        {
          env: { HOME: globalHome },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // detectInstallation should fall back to the global config and show installation info
      expect(stdout).toContain("Installation:");
      expect(stdout).toContain("Eject");
      expect(stdout).toContain("Skills:");
    });
  });
});
