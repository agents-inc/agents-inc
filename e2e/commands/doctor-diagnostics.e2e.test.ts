import path from "path";
import { writeFile, mkdir, rm } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  agentsPath,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import type { SkillId } from "../../src/cli/types/index.js";

describe("doctor diagnostics", () => {
  let tempDir: string;
  // Created once for the whole file — doctor only reads the source via CC_SOURCE
  let source: { sourceDir: string; tempDir: string };

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  });

  afterAll(async () => {
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("verbose diagnostics always emitted", () => {
    it("should show additional details for all checks", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: tempDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      // Doctor now always emits details (no --verbose flag needed).
      // The Source Reachable check passes and includes "N skills available" in details.
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("skills available");
    });
  });

  describe("valid config with local E2E source", () => {
    it("should show Source Reachable with local source info and skill count", async () => {
      const project = await ProjectBuilder.editable();
      tempDir = path.dirname(project.dir);

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: project.dir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // Source Reachable check: "Connected to local: <path>"
      expect(stdout).toContain("Connected to local:");
      // Details line shows skill count
      expect(stdout).toContain("skills available");
      // Config Valid should pass
      expect(stdout).toContain("Config Valid");
      expect(stdout).toContain("is valid");
    });
  });

  describe("agents compiled check", () => {
    it("should pass when agent .md files exist for configured agents", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create the compiled agent .md file so checkAgentsCompiled passes
      await writeAgentFile(projectDir, "web-developer");

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      // checkAgentsCompiled returns pass with "N/N agents compiled"
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Agents Compiled");
      expect(stdout).toContain("agents compiled");
    });

    it("should warn when agent .md files are missing for configured agents", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      // Do NOT create web-developer.md -- it's missing

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // checkAgentsCompiled returns warn with "N agent(s) need recompilation"
      expect(stdout).toContain("Agents Compiled");
      expect(stdout).toContain("recompilation");
      // The tip suggests running compile
      expect(stdout).toContain("compile");
    });
  });

  describe("orphaned agent files check", () => {
    it("should warn when orphaned .md files exist in agents dir", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create the configured agent file AND an orphan
      await writeAgentFile(projectDir, "web-developer");
      await writeAgentFile(projectDir, "orphan-agent");

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // checkNoOrphans returns warn with "N orphaned agent file(s)"
      expect(stdout).toContain("No Orphans");
      expect(stdout).toContain("orphan");
      expect(stdout).toContain("not in config");
    });
  });

  describe("missing skills directory with valid config", () => {
    it("should report missing skills when skills directory does not exist", async () => {
      tempDir = await createTempDir();

      // Create valid config referencing a skill NOT in the E2E source matrix
      await writeProjectConfig(tempDir, {
        name: "test-project",
        agents: [{ name: "web-developer", scope: "project" }],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-nonexistent" as SkillId, preloaded: true }], // fabricated E2E test ID
          },
        },
      });

      // Do NOT create .claude/skills/ directory -- it is missing

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: tempDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      // Config is valid, but the nonexistent skill is not in the source matrix
      // and not found locally, so Skills Resolved should fail
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Config Valid");
      expect(stdout).toContain("Skills Resolved");
      expect(stdout).toContain("not found");
    });
  });

  describe("orphaned skill dirs", () => {
    it("should warn when .claude/skills has dirs not referenced in config", async () => {
      // Create project with one skill in config
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);

      // Manual mkdir+writeFile: fabricated orphan skill ID not in SkillId union,
      // so createLocalSkill() cannot be used without a type cast.
      const orphanDir = path.join(
        project.dir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-testing-orphan-extra",
      );
      await mkdir(orphanDir, { recursive: true });
      await writeFile(path.join(orphanDir, FILES.SKILL_MD), "# Orphan Skill\n");

      // Create the compiled agent so checkAgentsCompiled passes
      await writeAgentFile(project.dir, "web-developer");

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: project.dir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      // Orphaned skill dirs are NOT checked by doctor (only orphaned agent files are).
      // Doctor checks: Config Valid, Skills Resolved, Agents Compiled, No Orphans (agents), Source Reachable.
      // The orphan skill dir does not cause a failure.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Config Valid");
      expect(stdout).toContain("Summary:");
    });
  });

  describe("missing skill dirs", () => {
    it("should fail when config references skills not found in source or locally", async () => {
      tempDir = await createTempDir();

      // Create config referencing a skill that does NOT exist in the E2E source
      await writeProjectConfig(tempDir, {
        name: "test-missing-skills",
        agents: [{ name: "web-developer", scope: "project" }],
        stack: {
          "web-developer": {
            "web-framework": [
              { id: "web-framework-nonexistent-skill" as SkillId, preloaded: true },
            ], // fabricated E2E test ID
          },
        },
      });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: tempDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      // Skills Resolved should fail with "not found"
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Skills Resolved");
      expect(stdout).toContain("not found");
      expect(stdout).toContain("web-framework-nonexistent-skill");
    });
  });

  describe("no agents compiled", () => {
    it("should warn when no agent .md files exist for configured agents", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer", "api-developer"],
      });
      tempDir = path.dirname(project.dir);

      // Do NOT create any agent .md files — they are all missing
      // The editable builder creates an empty agents dir but no .md files

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: project.dir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      // Agents Compiled should warn (not fail) with "need recompilation"
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Agents Compiled");
      expect(stdout).toContain("recompilation");
      // Should suggest running compile
      expect(stdout).toContain("compile");
    });
  });

  describe("details always emitted", () => {
    it("should show detailed output for passing checks", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);

      // Create the compiled agent file
      await writeAgentFile(project.dir, "web-developer");

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: project.dir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // doctor always shows details even for "pass" results
      expect(stdout).toContain("skills available");
      expect(stdout).toContain("Connected to local:");
      expect(stdout).toContain("Config Valid");
      expect(stdout).toContain("is valid");
    });

    it("should show skill resolution details when skills are missing", async () => {
      tempDir = await createTempDir();
      await writeProjectConfig(tempDir, {
        name: "test-missing-skill-details",
        agents: [{ name: "web-developer", scope: "project" }],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-doesnt-exist" as SkillId, preloaded: true }], // fabricated E2E test ID
          },
        },
      });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: tempDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      // Should show the specific missing skill in the details
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("web-framework-doesnt-exist");
      expect(stdout).toContain("not found");
    });
  });

  describe("tip discrimination by check kind", () => {
    it("should emit 'Check skill IDs' tip when skills check fails", async () => {
      tempDir = await createTempDir();
      await writeProjectConfig(tempDir, {
        name: "skills-check-fails",
        agents: [{ name: "web-developer", scope: "project" }],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-unknown-skill" as SkillId, preloaded: true }],
          },
        },
      });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: tempDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      // Skills Resolved fails, so hasSkillError tip is emitted
      expect(stdout).toContain("Check skill IDs");
    });

    it("should emit 'reinstall missing skill files' tip when installed check warns", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Overwrite config to register an eject-mode skill whose disk files are missing
      await writeProjectConfig(projectDir, {
        name: "installed-skill-missing",
        skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
        agents: [{ name: "web-developer", scope: "project" }],
      });

      // Make agents compile check pass so the only warn is from checkSkillsInstalled
      await writeAgentFile(projectDir, "web-developer");

      // Ensure the eject skill directory is absent so checkSkillsInstalled warns
      const ejectedSkillDir = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-framework-react",
      );
      await rm(ejectedSkillDir, { recursive: true, force: true });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("reinstall missing skill files");
    });
  });

  describe("healthy project", () => {
    it("should pass all checks on a properly configured project", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);

      // Create the compiled agent file so all checks pass
      await writeAgentFile(project.dir, "web-developer");

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: project.dir },
        { env: { CC_SOURCE: source.sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // Config Valid passes
      expect(stdout).toContain("Config Valid");
      expect(stdout).toContain("is valid");
      // Skills Resolved passes
      expect(stdout).toContain("Skills Resolved");
      // Agents Compiled passes
      expect(stdout).toContain("Agents Compiled");
      expect(stdout).toContain("agents compiled");
      // No Orphans passes
      expect(stdout).toContain("No Orphans");
      // Source Reachable passes
      expect(stdout).toContain("Source Reachable");
      // Summary shows all passed
      expect(stdout).toContain("Summary:");
      expect(stdout).toContain("0 errors");
    });
  });
});
