import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { missingArgsRefusal, runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import {
  fingerprintSharedCheckout,
  serveDefaultMarketplaceHere,
  SHARED_CHECKOUT_ETAG,
} from "../helpers/shared-marketplace-checkout.js";
import { EXIT_CODES } from "../../exit-codes";
import { renderAgentMd, renderMetadataYaml, renderSkillMd } from "../content-generators";
import { stampProvenanceMarker } from "../../agents/agent-provenance.js";
import { writeRawTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { saUnflagged } from "../factories/skill-factories.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { matchedAsWritten } from "../helpers/matched-as-written.js";
import { CUSTOM_HOUSE_TOOLING_SKILL } from "../mock-data/mock-skills.js";
import { CLAUDE_DIR, LOCAL_SKILLS_PATH, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";

/** Mirrors `STEP_TEXT.DOCTOR_STATUS_SKIP`; the product's own glyph would move with the row. */
const STATUS_SKIP = "–";

/** The installed pair a deleted configuration strands: one skill directory, one compiled agent. */
const ORPHANED_SKILL_ID = "web-framework-react";
const ORPHANED_AGENT_NAME = "web-developer";

/** `.claude/skills/` belongs to Claude Code, so this CLI did not put this there. */
const FOREIGN_SKILL_DIR = "context7-mcp";

/** Carries no provenance marker, which is what makes it somebody else's file. */
const FOREIGN_AGENT_NAME = "my-own-reviewer";

/** Without a config, provenance is a directory's only claim; `uninstall` reads it too. */
const CLI_PROVENANCE = {
  skillId: ORPHANED_SKILL_ID,
  contentHash: "abc1234",
  date: "2026-01-01",
};

describe("doctor command", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let stopServing: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("doctor-test-home-"));
    // Doctor asks the marketplace itself, which here answers with the saved copy's ETag, then
    // downloads it from the stand-in served here.
    await fingerprintSharedCheckout(fakeHome);
    stopServing = await serveDefaultMarketplaceHere();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { headers: { etag: SHARED_CHECKOUT_ETAG } })),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServing();
    await cleanup();
  });

  describe("basic execution", () => {
    it("should run without arguments", async () => {
      const { error } = await runCliCommand(["doctor"]);

      const output = error?.message || "";
      expect(
        output,
        "doctor reads the project at the cwd and declares no positional",
      ).not.toContain(missingArgsRefusal(1));
    });

    it("should fail when no config exists", async () => {
      const { error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("should pass when valid config exists", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: [],
          skills: [],
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      // Read from stdout, where the row is printed: `error` carries only the exit.
      const output = stdout + (error?.message || "");
      expect(output).toContain("config.ts is valid");
      expect(output.toLowerCase()).not.toContain("config.ts has errors");
    });
  });

  /** No config and a corrupt one both exit ERROR, so the row and path are asserted. */
  describe("config validation", () => {
    /** Verbatim from a run; the absent-config row says nothing of the kind. */
    const UNREADABLE_CONFIG_ROW = "exists but could not be loaded";

    it("should fail on a config.ts with syntax errors", async () => {
      const configPath = await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

      const { error, stdout } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      // Discriminating half: doctor looking elsewhere exits ERROR too.
      expect(
        stdout,
        `doctor exited ERROR without reporting the config at ${configPath} — it found no config rather than a broken one, so this spec is about the wrong failure`,
      ).toContain(UNREADABLE_CONFIG_ROW);
      expect(stdout).toContain(configPath);
    });

    it("should pass with minimal valid config", async () => {
      await writeTestTsConfig(projectDir, {
        name: "test-project",
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      // Read from stdout, where the row is printed.
      const output = stdout + (error?.message || "");
      expect(output).toContain("config.ts is valid");
      expect(output.toLowerCase()).not.toContain("config.ts has errors");
    });

    it("should name a config that loads and declares nothing rather than calling it missing", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "declares-nothing",
          skills: [],
          agents: [],
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("declares no skills and no agents");
      expect(output, "the file is on disk and it loaded — it is not missing").not.toContain(
        "config.ts not found",
      );
      expect(output).toContain("Nothing is configured yet");
    });

    it("should run the operational rows on an empty config instead of skipping them", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "declares-nothing",
          skills: [],
          agents: [],
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output, "the rows below claimed a valid config was invalid").not.toContain(
        "Skipped (config invalid)",
      );
      expect(output).toContain("No skills configured");
      expect(output).toContain("No agents configured");
    });
  });

  describe("agents check", () => {
    const CONFIGURED_AGENT_NAME = "web-developer";

    it("should pass when agents are compiled", async () => {
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });

      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
          skills: [],
        }),
      );

      await writeFile(
        path.join(agentsDir, `${CONFIGURED_AGENT_NAME}.md`),
        renderAgentMd(CONFIGURED_AGENT_NAME, "Agent content here."),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      const output = stdout + (error?.message || "");
      expect(output).toContain("1/1 agent compiled");
      expect(output, "an agent whose file is on disk is not missing").not.toContain(
        `- ${CONFIGURED_AGENT_NAME} (missing)`,
      );
    });

    it("should warn when agents need recompilation", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
          skills: [],
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      const output = stdout + (error?.message || "");
      expect(output).toContain("1 agent needs recompilation");
      expect(output).toContain(`- ${CONFIGURED_AGENT_NAME} (missing)`);
    });
  });

  describe("orphans check", () => {
    it("should detect orphaned agent files", async () => {
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });

      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: [],
          skills: [],
        }),
      );

      await writeFile(
        path.join(agentsDir, "orphaned-agent.md"),
        "# Orphaned Agent\n\nThis agent is not in config.",
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      const output = stdout + (error?.message || "");
      expect(output).toContain("1 orphaned agent file");
      expect(output).toContain("- orphaned-agent.md (not in config)");
    });

    it("should flag excluded project agent .md file as orphan", async () => {
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });

      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: buildAgentConfigs(["web-developer"], { excluded: true }),
          skills: [],
        }),
      );

      // Real frontmatter: a bare heading is rejected before the orphan check.
      await writeFile(
        path.join(agentsDir, "web-developer.md"),
        renderAgentMd("web-developer", "Excluded agent content."),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("orphaned agent file");
      expect(output).toContain("web-developer.md (not in config)");
    });
  });

  /** With no configuration, ownership is settled: nothing owns any of it. */
  describe("orphans check with no configuration", () => {
    /** Each carries the claim its kind can make without a config: `forkedFrom`, or the marker. */
    async function installContentWithoutConfig(): Promise<void> {
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, ORPHANED_SKILL_ID);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd(ORPHANED_SKILL_ID),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          displayName: ORPHANED_SKILL_ID,
          category: "web-framework",
          slug: "react",
          cliDescription: "React JavaScript framework",
          usageGuidance: "Use React for building component-based UIs",
          contentHash: "b2c3d4e",
          forkedFrom: CLI_PROVENANCE,
        }),
      );

      await writeAgentFileForTest(ORPHANED_AGENT_NAME, { compiled: true });
    }

    async function installForeignSkillDir(): Promise<void> {
      await mkdir(path.join(projectDir, LOCAL_SKILLS_PATH, FOREIGN_SKILL_DIR), {
        recursive: true,
      });
    }

    async function installForeignAgentFile(): Promise<void> {
      await writeAgentFileForTest(FOREIGN_AGENT_NAME, { compiled: false });
    }

    async function writeAgentFileForTest(
      agentName: string,
      options: { compiled: boolean },
    ): Promise<void> {
      const agentsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      const rendered = renderAgentMd(agentName, "Stranded agent content.");
      await writeFile(
        path.join(agentsDir, `${agentName}.md`),
        options.compiled ? stampProvenanceMarker(rendered) : rendered,
      );
    }

    it("names every installed skill and agent when no config declares them", async () => {
      await installContentWithoutConfig();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("no configuration declares them");
      expect(output).toContain(ORPHANED_SKILL_ID);
      expect(output).toContain(`${ORPHANED_AGENT_NAME}.md`);
      expect(output, "the row that names them cannot also report itself skipped").not.toMatch(
        new RegExp(`No Orphans\\s+${matchedAsWritten(STATUS_SKIP)}\\s+Skipped`),
      );
      expect(output).toContain("Nothing declares the files above");
    });

    it("keeps the skip when there is no config and nothing installed", async () => {
      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // An empty directory with no configuration is the state `init` exists for.
      expect(output).toMatch(
        new RegExp(`No Orphans\\s+${matchedAsWritten(STATUS_SKIP)}\\s+Skipped`),
      );
      expect(output).not.toContain("no configuration declares them");
    });

    it("counts only the directories carrying provenance when a foreign one sits beside them", async () => {
      await installContentWithoutConfig();
      await installForeignSkillDir();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // The count: the content layer names the foreign dir too, so `not.toContain` is vacuous.
      expect(
        output,
        "the row offers files for removal — it must count only what `uninstall` would remove",
      ).toContain("1 skill and 1 agent installed here, and no configuration declares them");
      expect(output).toContain(ORPHANED_SKILL_ID);
    });

    it("keeps the skip when the only thing installed is a directory this CLI did not install", async () => {
      await installForeignSkillDir();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // `uninstall` refuses a directory with no provenance, so offering it would contradict it.
      expect(output).toMatch(
        new RegExp(`No Orphans\\s+${matchedAsWritten(STATUS_SKIP)}\\s+Skipped`),
      );
      expect(output).not.toContain("no configuration declares them");
      expect(output).not.toContain("Nothing declares the files above");

      // Stepped over is not unmentioned: the content layer names it.
      expect(output).toContain(FOREIGN_SKILL_DIR);
      expect(output).toContain("not installed by this CLI");
    });

    it("counts only the agent files carrying the marker when a hand-written one sits beside them", async () => {
      await installContentWithoutConfig();
      await installForeignAgentFile();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // The count, as for skills: the content layer walks every agent file too.
      expect(
        output,
        "the row offers files for removal — it must count only what `uninstall` would remove",
      ).toContain("1 skill and 1 agent installed here, and no configuration declares them");
      expect(output).toContain(`${ORPHANED_AGENT_NAME}.md`);
    });

    it("keeps the skip when the only thing installed is an agent this CLI did not compile", async () => {
      await installForeignAgentFile();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // `uninstall` without config keeps unmarked agents, so offering this one would contradict it.
      expect(output).toMatch(
        new RegExp(`No Orphans\\s+${matchedAsWritten(STATUS_SKIP)}\\s+Skipped`),
      );
      expect(output).not.toContain("no configuration declares them");
    });

    it("names a stranded skill alone, word for word", async () => {
      await installContentWithoutConfig();
      await rm(path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS), { recursive: true });

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        [
          "    No Orphans              ✗  1 skill installed here, and no configuration declares them",
          `                               - ${path.join(projectDir, LOCAL_SKILLS_PATH, ORPHANED_SKILL_ID)}`,
          "    Skills Installed",
        ].join("\n"),
      );
    });

    it("names a stranded agent alone, word for word", async () => {
      await installContentWithoutConfig();
      await rm(path.join(projectDir, LOCAL_SKILLS_PATH), { recursive: true });

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        [
          "    No Orphans              ✗  1 agent installed here, and no configuration declares them",
          `                               - ${path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS, `${ORPHANED_AGENT_NAME}.md`)}`,
          "    Skills Installed",
        ].join("\n"),
      );
    });

    it("still stands down for a config that exists and cannot be read", async () => {
      await installContentWithoutConfig();
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // Unreadable is not absent: it is a content finding that gates this row too.
      expect(output).toContain("exists but could not be loaded");
      expect(output).toContain("Skipped — fix the content errors above first");
      expect(output).not.toContain("no configuration declares them");
    });
  });

  describe("skills installed check", () => {
    it("should warn when eject-mode skill is missing from disk", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: [],
          skills: buildSkillConfigs(["web-framework-react"]),
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("missing from disk");
      expect(output).toContain("web-framework-react");
    });

    it("should pass when eject-mode skill files exist on disk", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: [],
          skills: buildSkillConfigs(["web-framework-react"]),
        }),
      );

      // metadata.yaml too: without it doctor stops at the content layer.
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react"),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          displayName: "web-framework-react",
          category: "web-framework",
          slug: "react",
          cliDescription: "React JavaScript framework",
          usageGuidance: "Use React for building component-based UIs",
          contentHash: "b2c3d4e",
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).not.toContain("missing from disk");
      expect(output).toContain("1/1 eject-mode skill installed");
    });

    it("should not check plugin-mode skills for disk presence", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: [],
          skills: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).not.toContain("missing from disk");
      expect(output).toContain("No eject-mode skills configured");
    });
  });

  /**
   * The pair: a skill found nowhere is reported; one found only as a local skill is not. The local
   * one needs an id no marketplace carries, since a catalogue id resolves without anything on disk.
   */
  describe("broken agent references", () => {
    /** Not a category any installation declares, which the loader refuses for a custom skill. */
    const UNDECLARED_CATEGORY = "house-conventions";

    function configNamingTheHouseSkill(scope: "project" | "global") {
      return buildProjectConfig({
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs([CUSTOM_HOUSE_TOOLING_SKILL.id], { scope }),
        stack: {
          "web-developer": {
            [CUSTOM_HOUSE_TOOLING_SKILL.category]: [saUnflagged(CUSTOM_HOUSE_TOOLING_SKILL.id)],
          },
        },
      });
    }

    /** Whole skill: `custom: true` carries a non-catalogue slug; every required field is present. */
    async function writeHouseSkill(
      scopeRoot: string,
      category: string = CUSTOM_HOUSE_TOOLING_SKILL.category,
    ): Promise<void> {
      const skillDir = path.join(scopeRoot, LOCAL_SKILLS_PATH, CUSTOM_HOUSE_TOOLING_SKILL.id);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd(CUSTOM_HOUSE_TOOLING_SKILL.id, CUSTOM_HOUSE_TOOLING_SKILL.description),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          custom: true,
          displayName: CUSTOM_HOUSE_TOOLING_SKILL.displayName,
          category,
          slug: CUSTOM_HOUSE_TOOLING_SKILL.slug,
          cliDescription: CUSTOM_HOUSE_TOOLING_SKILL.description,
          usageGuidance: "Use for the tooling conventions this project wrote for itself",
          contentHash: "b2c3d4e",
        }),
      );
    }

    it("should report skills in stack that cannot be resolved", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          agents: buildAgentConfigs(["web-developer"]),
          skills: [],
          stack: {
            "web-developer": {
              "web-framework": [saUnflagged("web-framework-nonexistent")],
            },
          },
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("web-framework-nonexistent");
      expect(output).toContain("not found");
    });

    it("should pass when stack skills exist as local skills", async () => {
      await writeTestTsConfig(projectDir, configNamingTheHouseSkill("project"));
      await writeHouseSkill(projectDir);

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("1/1 skill found");
      expect(output).not.toContain(`${CUSTOM_HOUSE_TOOLING_SKILL.id} (not found)`);
    });

    it("should pass when a stack skill exists only as a global local skill", async () => {
      await writeTestTsConfig(projectDir, configNamingTheHouseSkill("global"));
      await writeHouseSkill(fakeHome);

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("1/1 skill found");
      expect(output).not.toContain(`${CUSTOM_HOUSE_TOOLING_SKILL.id} (not found)`);
    });

    it.each([
      ["project", () => projectDir],
      ["global", () => fakeHome],
    ] as const)(
      "should report a %s local skill the loader refuses for a category nothing declares",
      async (scope, scopeRoot) => {
        await writeTestTsConfig(projectDir, configNamingTheHouseSkill(scope));
        await writeHouseSkill(scopeRoot(), UNDECLARED_CATEGORY);

        const { stdout, error } = await runCliCommand(["doctor"]);
        const output = stdout + (error?.message || "");

        expect(output).toContain(`- ${CUSTOM_HOUSE_TOOLING_SKILL.id} (not found)`);
        expect(output, "the loader dropped it, so no sub-agent can be given it").not.toContain(
          "1/1 skill found",
        );
      },
    );
  });
});
