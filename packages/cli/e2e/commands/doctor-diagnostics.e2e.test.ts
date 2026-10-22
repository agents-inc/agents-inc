import path from "path";
import { writeFile, mkdir, rm } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  createLocalSkill,
  createTempDir,
  cleanupTempDir,
  configTsPath,
  FORKED_FROM_METADATA,
  listFiles,
  recordInstallSource,
  skillsPath,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  startTarballSourceServer,
  type TarballSourceServer,
} from "../helpers/tarball-source-server.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { createMockSkillAssignment } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/** `checkSourceReachable` counts what the E2E source carries. */
const SOURCE_SKILL_COUNT_LINE = `${E2E_SKILL_IDS.length} ${STEP_TEXT.DOCTOR_SKILLS_AVAILABLE}`;

/** A `string`: a hand-written config is unvalidated input. */
const UNKNOWN_SKILL_ID = "web-framework-nonexistent";

/** No metadata.yaml, so nothing can carry the `forkedFrom` marker that would claim it. */
const FOREIGN_SKILL_DIR = "context7-mcp";

/** Carries no provenance marker, so it is the user's own file. */
const FOREIGN_AGENT_NAME = "my-own-reviewer";

describe("doctor diagnostics", () => {
  let tempDir: string;
  let source: E2ESource;

  beforeAll(async () => {
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

      // `doctor` takes no marketplace flag or env, so a bare directory reads the global config
      // under HOME.
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });
      await writeProjectConfig(
        home,
        buildProjectConfig({
          name: "global",
          marketplace: source.sourceDir,
          skills: [],
          agents: [],
        }),
      );

      const projectWithoutConfig = path.join(tempDir, "project-without-config");
      await mkdir(projectWithoutConfig, { recursive: true });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectWithoutConfig },
        { env: { HOME: home } },
      );

      // The count, not the bare phrase: an unreachable source could still print the label.
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(SOURCE_SKILL_COUNT_LINE);
    });

    // Only a one-skill source can tell `1 skill` from `1 skills`.
    it("says '1 skill available' for a source that ships exactly one", async () => {
      tempDir = await createTempDir();
      const oneSkillSource = await createE2ESource({
        withoutSkills: E2E_SKILL_IDS.slice(1),
      });

      try {
        const home = path.join(tempDir, "home");
        await mkdir(home, { recursive: true });
        await writeProjectConfig(
          home,
          buildProjectConfig({
            name: "global",
            marketplace: oneSkillSource.sourceDir,
            skills: [],
            agents: [],
          }),
        );

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
      expect(stdout).toContain("1/1 agent compiled");
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_NO_ORPHANS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_INSTALLED);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_PLUGINS_INSTALLED);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SOURCE_LOCAL);
      expect(stdout).toContain(SOURCE_SKILL_COUNT_LINE);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_LAYOUT);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_PLACEMENTS);
      // The count catches a row this spec has never heard of; the named rows above catch a swap.
      expect(stdout).toContain(`${STEP_TEXT.DOCTOR_SUMMARY} 14 passed, 0 warnings, 0 errors`);
    });
  });

  describe("agents compiled check", () => {
    it("should warn once per missing agent and tip at compile", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer", "api-developer"],
      });
      tempDir = path.dirname(project.dir);

      await recordInstallSource([project.dir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED);
      // The count discriminates: both agents are missing.
      expect(stdout).toContain(`2 agents need ${STEP_TEXT.DOCTOR_AGENTS_NEED_RECOMPILATION}`);
      expect(stdout).toContain("- web-developer (missing)");
      expect(stdout).toContain("- api-developer (missing)");
      // Not `toContain("compile")`: the report's header names the command.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_COMPILE_AGENTS);
    });

    it("should pass when agent .md files exist for configured agents", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await writeAgentFile(projectDir, "web-developer", { frontmatter: true });

      await recordInstallSource([projectDir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED);
      expect(stdout).toContain("1/1 agent compiled");
      // Control: the tip fires only on the warn result.
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_TIP_COMPILE_AGENTS);
    });
  });

  /**
   * A served tarball, since a local marketplace is read where it is and never cached. Doctor asks
   * the marketplace itself; `search` is the other commands, which still read the saved copy.
   */
  describe("a remote marketplace, reached once and then not", () => {
    let server: TarballSourceServer;
    let reached: CLIResult;
    let unreached: CLIResult;
    let searchedOffline: CLIResult;

    beforeAll(async () => {
      server = await startTarballSourceServer(source.sourceDir);
      tempDir = await createTempDir();
      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "unreachable-marketplace",
          skills: [],
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: server.url,
        }),
      );
      await writeAgentFile(tempDir, "web-developer", { frontmatter: true });

      reached = await CLI.run(["doctor"], { dir: tempDir });
      await server.close();
      unreached = await CLI.run(["doctor"], { dir: tempDir });
      searchedOffline = await CLI.run(["search", E2E_SKILL.vitest.slug], { dir: tempDir });
    });

    afterAll(async () => {
      await server.close();
    });

    it("says it connected while the marketplace answers", () => {
      expect(reached.exitCode, reached.stdout).toBe(EXIT_CODES.SUCCESS);
      expect(reached.stdout).toMatch(/Marketplace Reachable\s+✓\s+Connected to remote: /);
    });

    it("fails the marketplace row while the marketplace cannot be reached, reading no saved copy", () => {
      expect(unreached.exitCode, unreached.output).toBe(EXIT_CODES.ERROR);
      expect(unreached.stdout).toContain(`Could not reach ${server.url}\n`);
      expect(unreached.stdout).toMatch(
        new RegExp(
          `${STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE}\\s+${STEP_TEXT.DOCTOR_STATUS_FAIL}\\s`,
        ),
      );
      expect(unreached.stdout).toMatch(
        /Skills Resolved\s+–\s+Skipped \(marketplace unreachable\)\n/,
      );
      expect(unreached.output, "the saved copy never stands in for doctor").not.toContain(
        STEP_TEXT.SOURCE_UNREACHABLE_CACHED,
      );
    });

    it("leaves the saved copy for the other commands, which still read it offline", () => {
      expect(searchedOffline.exitCode, searchedOffline.output).toBe(EXIT_CODES.SUCCESS);
      expect(searchedOffline.output).toContain(E2E_SKILL.vitest.display);
      expect(searchedOffline.output).toContain(STEP_TEXT.SOURCE_UNREACHABLE_CACHED);
    });
  });

  /**
   * Answered with no ETag: a 404, as GitHub answers a repository gone or private, and a 405 to
   * every method, which a HEAD alone cannot tell from a host refusing only that method. Doctor asks
   * twice: over the saved copy, then with only giget's tarball left, which giget extracts anyway.
   */
  describe.each([
    { status: 404, refusal: (url: string) => `Repository not found: ${url}\n` },
    {
      status: 405,
      refusal: (url: string) =>
        `Failed to fetch ${url}: the marketplace answered 405 Method Not Allowed\n`,
    },
  ])(
    "a remote marketplace that answers $status, withholding its content",
    ({ status, refusal }) => {
      let server: TarballSourceServer;
      let reached: CLIResult;
      let refused: CLIResult;
      let searchedRefused: CLIResult;
      let refusedAfterDownload: CLIResult;
      let searchedAfterDownload: CLIResult;

      beforeAll(async () => {
        server = await startTarballSourceServer(source.sourceDir);
        tempDir = await createTempDir();
        await writeProjectConfig(
          tempDir,
          buildProjectConfig({
            name: "refusing-marketplace",
            skills: [],
            agents: buildAgentConfigs(["web-developer"]),
            marketplace: server.url,
          }),
        );
        await writeAgentFile(tempDir, "web-developer", { frontmatter: true });

        reached = await CLI.run(["doctor"], { dir: tempDir });
        server.refuse(status);
        refused = await CLI.run(["doctor"], { dir: tempDir });
        searchedRefused = await CLI.run(["search", E2E_SKILL.vitest.slug], { dir: tempDir });

        await rm(path.join(tempDir, DIRS.SOURCE_CACHE), { recursive: true });
        refusedAfterDownload = await CLI.run(["doctor"], { dir: tempDir });
        searchedAfterDownload = await CLI.run(["search", E2E_SKILL.vitest.slug], { dir: tempDir });
      }, TIMEOUTS.SETUP_DUAL);

      afterAll(async () => {
        await server.close();
      });

      it("says it connected while the marketplace serves its content", () => {
        expect(reached.exitCode, reached.output).toBe(EXIT_CODES.SUCCESS);
        expect(reached.stdout).toMatch(/Marketplace Reachable\s+✓\s+Connected to remote: /);
      });

      it.each([
        ["over the saved copy", () => refused],
        ["after giget extracts its saved tarball", () => refusedAfterDownload],
      ])("fails the marketplace row on the refusal %s, vouching for no copy", (_when, result) => {
        const { exitCode, output, stdout } = result();
        expect(exitCode, output).toBe(EXIT_CODES.ERROR);
        expect(stdout).toMatch(
          new RegExp(
            `${STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE}\\s+${STEP_TEXT.DOCTOR_STATUS_FAIL}\\s+${STEP_TEXT.DOCTOR_MARKETPLACE_LOAD_FAILED}\n`,
          ),
        );
        expect(stdout).toContain(refusal(server.url));
        expect(stdout).toMatch(/Skills Resolved\s+–\s+Skipped \(marketplace unreachable\)\n/);
        expect(stdout, "a refusal is not a connection").not.toContain("Connected to remote");
      });

      it.each([
        ["over the saved copy", () => searchedRefused],
        ["after giget extracts its saved tarball", () => searchedAfterDownload],
      ])("leaves the copy for the other commands on the refusal %s", (_when, result) => {
        const { exitCode, output } = result();
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(output).toContain(E2E_SKILL.vitest.display);
      });
    },
  );

  /**
   * A refused load reads giget's saved tarball and records it with no ETag; the marketplace then
   * withdraws a skill. Doctor downloads rather than read a copy no fingerprint vouches for.
   */
  describe("a remote marketplace whose saved copy no fingerprint vouches for", () => {
    const UNAVAILABLE = 503;
    let withdrawn: E2ESource;
    let server: TarballSourceServer;
    let searchedRefused: CLIResult;
    let reachedOverTheCopy: CLIResult;

    beforeAll(async () => {
      withdrawn = await createE2ESource({ withoutSkills: [E2E_SKILL.vitest.id] });
      server = await startTarballSourceServer(source.sourceDir);
      tempDir = await createTempDir();
      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "unfingerprinted-marketplace",
          skills: [],
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: server.url,
        }),
      );
      await writeAgentFile(tempDir, "web-developer", { frontmatter: true });

      await CLI.run(["doctor"], { dir: tempDir });
      await rm(path.join(tempDir, DIRS.SOURCE_CACHE), { recursive: true });
      server.refuse(UNAVAILABLE);
      searchedRefused = await CLI.run(["search", E2E_SKILL.vitest.slug], { dir: tempDir });
      await server.publish(withdrawn.sourceDir);
      reachedOverTheCopy = await CLI.run(["doctor"], { dir: tempDir });
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await server.close();
      await cleanupTempDir(withdrawn.tempDir);
    });

    it("counts what the marketplace serves now, not the copy a refused load left", () => {
      expect(searchedRefused.output, "the copy still carries the withdrawn skill").toContain(
        E2E_SKILL.vitest.display,
      );
      expect(reachedOverTheCopy.exitCode, reachedOverTheCopy.output).toBe(EXIT_CODES.SUCCESS);
      expect(reachedOverTheCopy.stdout).toContain(
        ` ${E2E_SKILL_IDS.length - 1} ${STEP_TEXT.DOCTOR_SKILLS_AVAILABLE}\n`,
      );
    });
  });

  describe("orphaned agent files check", () => {
    it("should warn when orphaned .md files exist in agents dir", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await writeAgentFile(projectDir, "web-developer", { frontmatter: true });
      await writeAgentFile(projectDir, "orphan-agent", { frontmatter: true });

      await recordInstallSource([projectDir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_NO_ORPHANS);
      expect(stdout).toContain("1 orphaned agent file");
      expect(stdout).toContain("- orphan-agent.md (not in config)");
    });

    it("should name none of the skill folders eject skills copies in, though no config lists them", async () => {
      tempDir = await createTempDir();
      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "ejected-everything",
          skills: [],
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: source.sourceDir,
        }),
      );
      await writeAgentFile(tempDir, "web-developer", { frontmatter: true });

      const eject = await CLI.run(["eject", "skills"], { dir: tempDir });
      expect(eject.exitCode, eject.output).toBe(EXIT_CODES.SUCCESS);
      expect(
        (await listFiles(skillsPath(tempDir))).sort(),
        "the subject: every skill the marketplace ships, copied in",
      ).toStrictEqual([...E2E_SKILL_IDS].sort());

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

      expect(stdout).toMatch(/No Orphans\s+✓\s+No orphaned agent files\n/);
      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
    });

    it("should leave a skill folder alone that carries no provenance, the user's own", async () => {
      const project = await ProjectBuilder.editable({ agents: ["web-developer"] });
      tempDir = path.dirname(project.dir);
      await writeAgentFile(project.dir, "web-developer", { frontmatter: true });
      await mkdir(path.join(skillsPath(project.dir), FOREIGN_SKILL_DIR), { recursive: true });
      await recordInstallSource([project.dir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: project.dir });

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toMatch(/No Orphans\s+✓\s+No orphaned agent files\n/);
    });

    /**
     * The project-scope half; `lifecycle/global-config-deleted-under-install` carries the global
     * half.
     */
    it("names every installed skill and agent when the project config is deleted", async () => {
      const project = await ProjectBuilder.editable({ agents: ["web-developer"] });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      await writeAgentFile(projectDir, "web-developer", { frontmatter: true, provenance: true });

      // A home of its own: with HOME at the project the two install roots collapse into one.
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });

      const skillIds = await listFiles(skillsPath(projectDir));
      const agentFiles = await listFiles(agentsPath(projectDir));
      expect(skillIds.length, "the fixture must have skills to strand").toBeGreaterThan(0);
      expect(agentFiles.length, "the fixture must have agents to strand").toBeGreaterThan(0);

      await rm(configTsPath(projectDir), { force: true });

      // No source override: the config that would name one is deleted.
      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        { env: { HOME: home } },
      );

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(
        new RegExp(`${STEP_TEXT.DOCTOR_ROW_NO_ORPHANS}\\s+${STEP_TEXT.DOCTOR_STATUS_FAIL}\\s`),
      );
      expect(stdout).toContain(STEP_TEXT.DOCTOR_UNOWNED_INSTALL);
      for (const name of [...skillIds, ...agentFiles]) {
        expect(stdout, `${name} is stranded and the orphan row must name it`).toContain(name);
      }
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL);
    });
  });

  describe("skills the config names but nothing provides", () => {
    it("should fail Skills Resolved, name the skill and tip at checking skill IDs", async () => {
      tempDir = await createTempDir();

      await writeProjectConfig(
        tempDir,
        buildProjectConfig({
          name: "test-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          stack: {
            "web-developer": {
              "web-framework": [createMockSkillAssignment(UNKNOWN_SKILL_ID, true)],
            },
          },
        }),
      );

      // No .claude/skills/: the skill is absent from source and disk, so the check fails rather
      // than warns.

      await recordInstallSource([tempDir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_IS_VALID);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED);
      expect(stdout).toContain("0/1 skill found");
      expect(stdout).toContain(`- ${UNKNOWN_SKILL_ID} (not found)`);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CHECK_SKILL_IDS);
    });
  });

  describe("skill dirs this installation does not own", () => {
    it("should name a skill dir no config references and no provenance claims, without failing", async () => {
      const project = await ProjectBuilder.editable({
        agents: ["web-developer"],
      });
      tempDir = path.dirname(project.dir);

      // SKILL.md only: no `forkedFrom` marker, and no config names it.
      await createLocalSkill(project.dir, "web-testing-orphan-extra", { body: "# Orphan Skill" });

      await writeAgentFile(project.dir, "web-developer", { frontmatter: true });

      await recordInstallSource([project.dir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: project.dir });

      // `.claude/skills/` is shared with other tools; an unclaimed directory is named and stepped
      // over, not reported as a fault.
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

      // `forkedFrom` without a SKILL.md: this CLI wrote it, so its fault is the CLI's to report.
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
     * `uninstall` removes only `forkedFrom` skill directories and marker-carrying agents, so doctor
     * must offer nothing else.
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
      // The count proves the others were stepped over: a `not.toContain` passes whether or not the
      // row listed them.
      expect(
        stdout,
        "the row names what `uninstall` removes — a file with no provenance is not that",
      ).toContain("1 skill and 1 agent installed here");
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL);

      // Named, not dropped: stepping over a directory is still said.
      expect(stdout).toContain(FOREIGN_SKILL_DIR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_FOREIGN_SKILL_DIR);

      // Asserted, not assumed: the uninstall doctor recommends removes exactly the named files.
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

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "installed-skill-missing",
          skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        }),
      );

      await writeAgentFile(projectDir, "web-developer", { frontmatter: true });

      const ejectedSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      await rm(ejectedSkillDir, { recursive: true, force: true });

      await recordInstallSource([projectDir], source.sourceDir);

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_RE_EJECT);
      // The skill resolves in the source and only its ejected copy is missing, so the skills tip
      // must not fire.
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_TIP_CHECK_SKILL_IDS);
    });
  });
});
