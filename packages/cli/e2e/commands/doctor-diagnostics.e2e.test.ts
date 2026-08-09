import path from "path";
import { writeFile, mkdir, rm } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  listFiles,
  recordInstallSource,
  skillsPath,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import type { SkillId } from "../../src/cli/types/index.js";

/** `checkSourceReachable` reports the whole matrix, which the E2E source defines. */
const SOURCE_SKILL_COUNT_LINE = `${E2E_SKILL_IDS.length} ${STEP_TEXT.DOCTOR_SKILLS_AVAILABLE}`;

/** A skill id the E2E source does not define, so `Skills Resolved` must fail on it. */
const UNKNOWN_SKILL_ID = "web-framework-nonexistent" as SkillId;

describe("doctor diagnostics", () => {
  let tempDir: string;
  // Created once for the whole file — each install below records it as its own source
  let source: E2ESource;

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
    it("should count the source's skills even with no project config to check them against", async () => {
      tempDir = await createTempDir();

      // The source comes from the GLOBAL config: `doctor` takes no `--source` and reads no
      // `CC_SOURCE` (both are `init`'s), so a directory with no config of its own reads the
      // one under HOME — the machine-wide install a bare directory still inherits.
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });
      await writeProjectConfig(home, { name: "global", source: source.sourceDir });

      const projectWithoutConfig = path.join(tempDir, "project-without-config");
      await mkdir(projectWithoutConfig, { recursive: true });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectWithoutConfig },
        { env: { HOME: home } },
      );

      // Doctor always emits details (no --verbose flag needed). The count is
      // asserted rather than the bare phrase: an unreachable source that still
      // printed the label would satisfy "skills available" on its own.
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(SOURCE_SKILL_COUNT_LINE);
    });
  });

  describe("healthy project", () => {
    // One run, every pass row. Previously three `it`s ("valid config with local
    // E2E source", "details always emitted", "healthy project") built the same
    // fixture and asserted overlapping subsets of the same report.
    it("should pass every check and name every row on a properly configured project", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);

      await writeAgentFile(project.dir, "web-developer", { frontmatter: true });

      await recordInstallSource([project.dir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_IS_VALID);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED);
      expect(stdout).toContain("1/1 agents compiled");
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_NO_ORPHANS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_INSTALLED);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_PLUGINS_INSTALLED);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SOURCE_LOCAL);
      expect(stdout).toContain(SOURCE_SKILL_COUNT_LINE);
      // The counts, not the word "errors": every content and operational row above
      // passed, so a warn or a failure anywhere in the report reddens this line.
      expect(stdout).toContain(`${STEP_TEXT.DOCTOR_SUMMARY} 12 passed, 0 warnings, 0 errors`);
    });
  });

  describe("agents compiled check", () => {
    it("should warn once per missing agent and tip at compile", async () => {
      // Two configured agents, neither compiled. Previously two `it`s — one with
      // one agent, one with two — asserted the same three substrings.
      const project = await ProjectBuilder.editable({
        agents: ["web-developer", "api-developer"],
      });
      tempDir = path.dirname(project.dir);

      await recordInstallSource([project.dir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED);
      // The count discriminates: "1 agent needs recompilation" would pass a bare
      // match on the word, and both agents are missing here.
      expect(stdout).toContain(`2 agents need ${STEP_TEXT.DOCTOR_AGENTS_NEED_RECOMPILATION}`);
      expect(stdout).toContain("- web-developer (missing)");
      expect(stdout).toContain("- api-developer (missing)");
      // Not `toContain("compile")` — the report's header names the command.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_COMPILE_AGENTS);
    });

    it("should pass when agent .md files exist for configured agents", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create the compiled agent .md file so checkAgentsCompiled passes
      await writeAgentFile(projectDir, "web-developer", { frontmatter: true });

      await recordInstallSource([projectDir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED);
      expect(stdout).toContain("1/1 agents compiled");
      // The control for the spec above: the tip fires only on the warn result.
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_TIP_COMPILE_AGENTS);
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
      await writeAgentFile(projectDir, "web-developer", { frontmatter: true });
      await writeAgentFile(projectDir, "orphan-agent", { frontmatter: true });

      await recordInstallSource([projectDir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // checkNoOrphans returns warn with "N orphaned agent file(s)"
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_NO_ORPHANS);
      expect(stdout).toContain("1 orphaned agent file");
      expect(stdout).toContain("- orphan-agent.md (not in config)");
    });

    /**
     * The project-scope half of the same row. `lifecycle/global-config-deleted-under-install`
     * carries the global half, where both install roots resolve to one directory and the walk
     * covers it once; here the home directory is elsewhere, so two roots are walked and the
     * project's own leftovers are what the row has to name.
     */
    it("names every installed skill and agent when the project config is deleted", async () => {
      const project = await ProjectBuilder.editable({ agents: ["web-developer"] });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      await writeAgentFile(projectDir, "web-developer", { frontmatter: true });

      // A home directory of its own: with HOME at the project the two install
      // roots collapse into one, and this row's project-scope walk goes untested.
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });

      const skillIds = await listFiles(skillsPath(projectDir));
      const agentFiles = await listFiles(agentsPath(projectDir));
      expect(skillIds.length, "the fixture must have skills to strand").toBeGreaterThan(0);
      expect(agentFiles.length, "the fixture must have agents to strand").toBeGreaterThan(0);

      await rm(configTsPath(projectDir), { force: true });

      // No source override: the config that would have named one is what this spec deleted.
      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        { env: { HOME: home } },
      );

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(
        new RegExp(`${STEP_TEXT.DOCTOR_ROW_NO_ORPHANS}\\s+${UI_SYMBOLS.CROSS}\\s`),
      );
      expect(stdout).toContain(STEP_TEXT.DOCTOR_UNOWNED_INSTALL);
      for (const name of [...skillIds, ...agentFiles]) {
        expect(stdout, `${name} is stranded and the orphan row must name it`).toContain(name);
      }
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL);
    });
  });

  describe("skills the config names but nothing provides", () => {
    // One run covering what four `it`s ("missing skills directory with valid
    // config", "missing skill dirs", "details always emitted" -> skill details,
    // "tip discrimination" -> skill IDs) each asserted a fragment of: they all
    // wrote a config naming one fabricated skill id and read the same report.
    it("should fail Skills Resolved, name the skill and tip at checking skill IDs", async () => {
      tempDir = await createTempDir();

      await writeProjectConfig(tempDir, {
        name: "test-project",
        agents: [{ name: "web-developer", scope: "project" }],
        stack: {
          "web-developer": {
            "web-framework": [{ id: UNKNOWN_SKILL_ID, preloaded: true }],
          },
        },
      });

      // Do NOT create .claude/skills/ — the skill is absent from the source AND
      // from disk, which is what makes the check fail rather than warn.

      await recordInstallSource([tempDir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      // The config itself is fine — the failure is about the skill, not the file.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_IS_VALID);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED);
      expect(stdout).toContain("0/1 skills found");
      expect(stdout).toContain(`- ${UNKNOWN_SKILL_ID} (not found)`);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CHECK_SKILL_IDS);
    });
  });

  describe("orphaned skill dirs", () => {
    it("should report a skill dir that no config references as invalid content", async () => {
      // Create project with one skill in config
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);

      // Manual mkdir+writeFile: fabricated orphan skill ID not in SkillId union,
      // so createLocalSkill() cannot be used without a type cast.
      const orphanDir = path.join(skillsPath(project.dir), "web-testing-orphan-extra");
      await mkdir(orphanDir, { recursive: true });
      await writeFile(path.join(orphanDir, FILES.SKILL_MD), "# Orphan Skill\n");

      // Create the compiled agent so checkAgentsCompiled passes
      await writeAgentFile(project.dir, "web-developer", { frontmatter: true });

      await recordInstallSource([project.dir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: project.dir });

      // The operational checks key off config (they look for orphaned AGENT files
      // only), but the content layer walks every directory under .claude/skills/
      // whether or not a config names it — a skill directory with no metadata.yaml
      // is still content Claude Code would try to load.
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("web-testing-orphan-extra");
      expect(stdout).toContain(`Missing ${FILES.METADATA_YAML}`);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SUMMARY);
    });
  });

  describe("tip discrimination by check kind", () => {
    it("should emit re-eject tip when installed check warns", async () => {
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
      await writeAgentFile(projectDir, "web-developer", { frontmatter: true });

      // Ensure the eject skill directory is absent so checkSkillsInstalled warns
      const ejectedSkillDir = path.join(skillsPath(projectDir), "web-framework-react");
      await rm(ejectedSkillDir, { recursive: true, force: true });

      await recordInstallSource([projectDir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_RE_EJECT);
      // The discriminating half: the skills tip must NOT fire — the skill resolves
      // in the source, it is only its ejected copy that is missing.
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_TIP_CHECK_SKILL_IDS);
    });
  });
});
