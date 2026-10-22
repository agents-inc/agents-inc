import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import {
  CLAUDE_DIR,
  DEFAULT_BRANDING,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  STANDARD_DIRS,
} from "../../../consts";
import { EXPECTED_SKILLS } from "../expected-values";
import type { BrandingConfig, SkillConfig, SkillId } from "../../../types";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildAgentConfigs } from "../factories/config-factories.js";

/** Shares no substring with the default name, so neither paired assertion fakes the other. */
const WHITE_LABEL_NAME = "Northwind";

/** Written out, not built from the command's options, so a renamed option fails here. */
const DASHBOARD_OPTIONS_LINE = "  [Edit in the web editor]  [Compile]  [Doctor]  [List]";

/** Held against `SkillId` so retiring an id reddens this line rather than a consumer. */
const MARKETPLACE_SKILL_IDS = [
  "web-framework-react",
  "web-state-zustand",
  "web-testing-vitest",
] as const satisfies readonly SkillId[];

const EJECTED_SKILL_ID = "web-mocks-msw" satisfies SkillId;

/** Declared by no configuration, so deliberately not a `SkillId`. */
const UNDECLARED_SKILL_DIR = "context7-mcp";

/**
 * One sub-agent declared and none compiled: the least that makes a config an installation. A
 * content-less config is not one, and `init` opens the editor for it before any dashboard is drawn.
 */
const DECLARED_SUB_AGENTS = buildAgentConfigs(["web-developer"]);

/** `skills` are declared; each `onDisk` id gets a `.claude/skills/<id>` dir. */
async function writeInstallation(
  projectDir: string,
  skills: SkillConfig[],
  onDisk: readonly string[],
): Promise<void> {
  await writeTestTsConfig(projectDir, { name: "test-project", skills });
  for (const skillId of onDisk) {
    await mkdir(path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId), {
      recursive: true,
    });
  }
}

async function writeDashboardConfig(projectDir: string, branding?: BrandingConfig): Promise<void> {
  await writeTestTsConfig(projectDir, {
    name: "test-project",
    skills: [],
    agents: DECLARED_SUB_AGENTS,
    ...(branding !== undefined && { branding }),
  });
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
      // Declaring skills makes it an installation; a content-less config routes to the editor.
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
      });

      const { stdout, stderr, error } = await runCliCommand(["init"]);

      expect(error?.oclif?.exit).toBeUndefined();

      const combinedOutput = stdout + stderr + (error?.message || "");
      expect(combinedOutput).toContain("Agents Inc.");
      expect(combinedOutput).toContain("Skills:");
      expect(combinedOutput).toContain("Agents:");
      expect(combinedOutput).toContain("[Edit in the web editor]");
      expect(combinedOutput).toContain("[Compile]");
      expect(combinedOutput).toContain("[Doctor]");
      expect(combinedOutput).toContain("[List]");
    });

    it("should show skill and agent counts in dashboard", async () => {
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
      });

      for (const skillId of EXPECTED_SKILLS.WEB_DEFAULT) {
        await mkdir(path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId), {
          recursive: true,
        });
      }

      const agentsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), "# Web Developer");
      await writeFile(path.join(agentsDir, "api-developer.md"), "# API Developer");

      const { stdout } = await runCliCommand(["init"]);

      // Ends on the options line, so a marketplace line printed with none configured fails it.
      expect(stdout).toContain(
        [
          "  Skills:       2 installed",
          "  Agents:       2 compiled",
          "  Mode:         Eject",
          "",
          DASHBOARD_OPTIONS_LINE,
        ].join("\n"),
      );
    });

    it("should show source when configured", async () => {
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: DECLARED_SUB_AGENTS,
        marketplace: TEST_SOURCE_URL,
      });

      const { stdout } = await runCliCommand(["init"]);

      expect(stdout).toContain(
        ["  Marketplace:  github:agents-inc/skills", "", DASHBOARD_OPTIONS_LINE].join("\n"),
      );
    });

    /** Paired with the default below: either alone passes on a hardcoded or config-blind title. */
    it("should title the dashboard with the configured branding name", async () => {
      await writeDashboardConfig(projectDir, { name: WHITE_LABEL_NAME });

      const { stdout } = await runCliCommand(["init"]);

      expect(stdout).toContain(`${WHITE_LABEL_NAME}\n\n  Skills:`);
      expect(stdout, "the configured name replaces the shipped one").not.toContain(
        DEFAULT_BRANDING.NAME,
      );
    });

    it("should title the dashboard with the shipped name when no branding is configured", async () => {
      await writeDashboardConfig(projectDir);

      const { stdout } = await runCliCommand(["init"]);

      expect(stdout).toContain(`${DEFAULT_BRANDING.NAME}\n\n  Skills:`);
      expect(stdout).not.toContain(WHITE_LABEL_NAME);
    });

    it("should not modify existing config when already initialized", async () => {
      // Declares skills, so init shows the dashboard rather than routing to the editor.
      const configPath = await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
      });
      const originalContent = await readFile(configPath, "utf-8");

      await runCliCommand(["init"]);

      const content = await readFile(configPath, "utf-8");
      expect(content).toBe(originalContent);
    });

    it("should exit with SUCCESS when already initialized", async () => {
      // Declares skills, so init shows the dashboard rather than routing to the editor.
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.WEB_DEFAULT]),
      });

      const { error } = await runCliCommand(["init"]);

      expect(error?.oclif?.exit).toBeUndefined();
    });
  });

  /**
   * The dashboard's `Skills: N installed` and `list`'s `Skills:  N` read one producer, so both are
   * asserted on the same installation in the same test.
   */
  describe("the number of skills the CLI reports it manages", () => {
    const MIXED_INSTALL_SKILLS: SkillConfig[] = [
      ...buildSkillConfigs(MARKETPLACE_SKILL_IDS, {
        scope: "project",
        origin: DEFAULT_PUBLIC_SOURCE_NAME,
      }),
      ...buildSkillConfigs([EJECTED_SKILL_ID], { scope: "project", origin: EJECT_SOURCE }),
    ];

    it("counts every skill a mixed installation declares, on both surfaces alike", async () => {
      // Only the ejected skill owns a directory; the plugin skills live in the Claude registry.
      await writeInstallation(projectDir, MIXED_INSTALL_SKILLS, [EJECTED_SKILL_ID]);

      const dashboard = await runCliCommand(["init"]);
      const list = await runCliCommand(["list"]);

      expect(
        dashboard.stdout,
        "a mixed installation manages its plugin skills as much as its ejected ones",
      ).toContain(
        [
          `  Skills:       ${MIXED_INSTALL_SKILLS.length} installed`,
          "  Agents:       0 compiled",
          "  Mode:         Mixed",
          "",
          DASHBOARD_OPTIONS_LINE,
        ].join("\n"),
      );
      expect(
        list.stdout,
        "the dashboard and list read one installation, so they cannot report two numbers",
      ).toContain(`  Mode:    Mixed\n  Skills:  ${MIXED_INSTALL_SKILLS.length}\n`);
    });

    it("does not count a skill directory the configuration never declared", async () => {
      await writeInstallation(projectDir, MIXED_INSTALL_SKILLS, [
        EJECTED_SKILL_ID,
        UNDECLARED_SKILL_DIR,
      ]);

      const dashboard = await runCliCommand(["init"]);
      const list = await runCliCommand(["list"]);

      expect(
        dashboard.stdout,
        "a directory this CLI never installed is not part of what it reports it manages",
      ).toContain(`  Skills:       ${MIXED_INSTALL_SKILLS.length} installed\n`);
      expect(list.stdout).toContain(`  Skills:  ${MIXED_INSTALL_SKILLS.length}\n`);
    });

    it("does not count a tombstoned entry", async () => {
      const tombstoned: SkillConfig[] = [
        ...MIXED_INSTALL_SKILLS,
        ...buildSkillConfigs(["web-testing-visual-regression"], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
          excluded: true,
        }),
      ];
      await writeInstallation(projectDir, tombstoned, [EJECTED_SKILL_ID]);

      const dashboard = await runCliCommand(["init"]);
      const list = await runCliCommand(["list"]);

      expect(
        dashboard.stdout,
        "a tombstone records a skill this project has excluded, not one it manages",
      ).toContain(`  Skills:       ${MIXED_INSTALL_SKILLS.length} installed\n`);
      expect(list.stdout).toContain(`  Skills:  ${MIXED_INSTALL_SKILLS.length}\n`);
    });
  });

  it("names a plugin-only installation's mode Plugin on its dashboard", async () => {
    await writeInstallation(
      projectDir,
      buildSkillConfigs(MARKETPLACE_SKILL_IDS, {
        scope: "project",
        origin: DEFAULT_PUBLIC_SOURCE_NAME,
      }),
      [],
    );

    const { stdout } = await runCliCommand(["init"]);

    expect(stdout).toContain(
      [
        `  Skills:       ${MARKETPLACE_SKILL_IDS.length} installed`,
        "  Agents:       0 compiled",
        "  Mode:         Plugin",
        "",
        DASHBOARD_OPTIONS_LINE,
      ].join("\n"),
    );
  });
});
