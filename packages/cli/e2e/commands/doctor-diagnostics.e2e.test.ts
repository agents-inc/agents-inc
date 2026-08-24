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
  FORKED_FROM_METADATA,
  listFiles,
  recordInstallSource,
  skillsPath,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import type { SkillId } from "../../src/cli/types/index.js";

/** `checkSourceReachable` reports the whole matrix, which the E2E source defines. */
const SOURCE_SKILL_COUNT_LINE = `${E2E_SKILL_IDS.length} ${STEP_TEXT.DOCTOR_SKILLS_AVAILABLE}`;

/** A skill id the E2E source does not define, so `Skills Resolved` must fail on it. */
const UNKNOWN_SKILL_ID = "web-framework-nonexistent" as SkillId;

/**
 * A directory in the shared `.claude/skills/` tree that this CLI did not put there — no
 * `metadata.yaml`, so nothing in it can carry the `forkedFrom` marker that would claim it.
 */
const FOREIGN_SKILL_DIR = "context7-mcp";

/**
 * An agent file in the shared `.claude/agents/` tree that this CLI did not compile. Its claim is
 * the provenance marker rather than `forkedFrom`, and it carries none — which is the whole of
 * what makes it the user's own file.
 */
const FOREIGN_AGENT_NAME = "my-own-reviewer";

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

      // The source comes from the GLOBAL config: `doctor` takes no `--marketplace` and reads no
      // `CC_MARKETPLACE` (both are `init`'s), so a directory with no config of its own reads the
      // one under HOME — the machine-wide install a bare directory still inherits.
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });
      await writeProjectConfig(home, { name: "global", marketplace: source.sourceDir });

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

    // The count is built by hand at this one site while `plural()` sits in the same file and is
    // used at three others, so a marketplace with exactly one skill read `1 skills available`.
    // A one-skill source is the only input that can tell the two apart — every other count in
    // this suite is plural and satisfies the buggy form as readily as the fixed one.
    it("says '1 skill available' for a source that ships exactly one", async () => {
      tempDir = await createTempDir();
      const oneSkillSource = await createE2ESource({
        withoutSkills: E2E_SKILL_IDS.slice(1),
      });

      try {
        const home = path.join(tempDir, "home");
        await mkdir(home, { recursive: true });
        await writeProjectConfig(home, {
          name: "global",
          marketplace: oneSkillSource.sourceDir,
        });

        const projectDir = path.join(tempDir, "project");
        await mkdir(projectDir, { recursive: true });

        const { stdout } = await CLI.run(["doctor"], { dir: projectDir }, { env: { HOME: home } });

        expect(stdout).toContain(STEP_TEXT.DOCTOR_ONE_SKILL_AVAILABLE);
      } finally {
        await cleanupTempDir(oneSkillSource.tempDir);
      }
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
      await writeAgentFile(projectDir, "web-developer", { frontmatter: true, provenance: true });

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

  describe("skill dirs this installation does not own", () => {
    it("should name a skill dir no config references and no provenance claims, without failing", async () => {
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

      // `.claude/skills/` is Claude Code's directory, shared with everything else that installs a
      // skill into it. A directory no configuration names and no `forkedFrom` claims is not this
      // installation's to judge — so it is named and stepped over, not reported as the user's fault.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("web-testing-orphan-extra");
      expect(stdout).toContain(STEP_TEXT.DOCTOR_FOREIGN_SKILL_DIR);
      expect(stdout).not.toContain(`Missing ${FILES.METADATA_YAML}`);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SUMMARY);
    });

    it("should still report a broken skill dir this CLI's provenance claims", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);

      // Metadata carrying `forkedFrom` and no SKILL.md beside it: this CLI wrote the directory,
      // and what is wrong with it is the CLI's to report however the configuration has moved on.
      const forkedDir = path.join(skillsPath(project.dir), "web-testing-orphan-extra");
      await mkdir(forkedDir, { recursive: true });
      await writeFile(path.join(forkedDir, FILES.METADATA_YAML), FORKED_FROM_METADATA);

      await writeAgentFile(project.dir, "web-developer", { frontmatter: true });
      await recordInstallSource([project.dir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("web-testing-orphan-extra");
      expect(stdout).toContain(`Missing ${FILES.SKILL_MD}`);
    });

    /**
     * The same judgement on the path where there is no configuration to make it with, on both
     * kinds of file at once. `doctor` offers the unowned installation to `uninstall`, and
     * `uninstall` removes a skill directory only when it carries `forkedFrom` and an agent file
     * only when it carries the compiler's marker — so anything listed that answers to neither is
     * one command recommending what the next one refuses.
     */
    it("offers only what uninstall would remove when the configuration is gone", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      await writeAgentFile(projectDir, "web-developer", { frontmatter: true, provenance: true });
      await writeAgentFile(projectDir, FOREIGN_AGENT_NAME, { frontmatter: true });

      // A home of its own, or the global walk reads the machine running the suite.
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });

      const ownedSkillIds = await listFiles(skillsPath(projectDir));
      expect(ownedSkillIds.length, "the fixture must have skills to strand").toBe(1);
      await mkdir(path.join(skillsPath(projectDir), FOREIGN_SKILL_DIR), { recursive: true });

      await rm(configTsPath(projectDir), { force: true });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        { env: { HOME: home } },
      );

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_UNOWNED_INSTALL);
      // Two skill directories and two agent files are on disk, and one of each is this CLI's.
      // The count is what proves the others were stepped over: the content layer walks both in
      // the same report, so a `not.toContain` on either name would pass whether or not the row
      // listed it.
      expect(
        stdout,
        "the row names what `uninstall` removes — a file with no provenance is not that",
      ).toContain("1 skill and 1 agent installed here");
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL);

      // Named rather than dropped: stepping over a directory is not the same as going quiet
      // about it, and the content layer is where that is said.
      expect(stdout).toContain(FOREIGN_SKILL_DIR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_FOREIGN_SKILL_DIR);

      // The other half of the agreement, asserted rather than assumed: the command `doctor`
      // sends the reader to removes exactly the files the row named, and leaves the others.
      const uninstall = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        { env: { HOME: home } },
      );
      expect(uninstall.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(
        await listFiles(skillsPath(projectDir)),
        "uninstall keeps what doctor declined to offer, and removes what it offered",
      ).toStrictEqual([FOREIGN_SKILL_DIR]);
      expect(
        await listFiles(agentsPath(projectDir)),
        "the agent half of the same agreement — the marker decides, on both screens",
      ).toStrictEqual([`${FOREIGN_AGENT_NAME}.md`]);
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
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [{ name: "web-developer", scope: "project" }],
      });

      // Make agents compile check pass so the only warn is from checkSkillsInstalled
      await writeAgentFile(projectDir, "web-developer", { frontmatter: true });

      // Ensure the eject skill directory is absent so checkSkillsInstalled warns
      const ejectedSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
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
