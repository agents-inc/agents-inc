import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { getDashboardData, formatDashboardText } from "../../../commands/init";
import { formatInstallationDisplay, getInstallationInfo } from "../../plugins";
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

/** Shares no substring with the default name, so neither paired assertion fakes the other. */
const WHITE_LABEL_NAME = "Northwind";

/** Held against `SkillId` so retiring an id reddens this line rather than a consumer. */
const MARKETPLACE_SKILL_IDS = [
  "web-framework-react",
  "web-state-zustand",
  "web-testing-vitest",
] as const satisfies readonly SkillId[];

const EJECTED_SKILL_ID = "web-mocks-msw" satisfies SkillId;

/** Declared by no configuration, so deliberately not a `SkillId`. */
const UNDECLARED_SKILL_DIR = "context7-mcp";

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

      const data = await getDashboardData(projectDir);
      expect(data.skillCount).toBe(2);
      expect(data.agentCount).toBe(2);
      expect(data.mode).toBe("eject");

      const text = formatDashboardText(data);
      expect(text).toContain("2 installed");
      expect(text).toContain("2 compiled");
    });

    it("should show source when configured", async () => {
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        marketplace: TEST_SOURCE_URL,
      });

      const data = await getDashboardData(projectDir);
      expect(data.source).toBe("github:agents-inc/skills");

      const text = formatDashboardText(data);
      expect(text).toContain("github:agents-inc/skills");
    });

    /** Paired with the default below: either alone passes on a hardcoded or config-blind title. */
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

    it("should show 0 counts when skills and agents are empty", async () => {
      await writeTestTsConfig(projectDir, { name: "test-project", skills: [] });

      const data = await getDashboardData(projectDir);
      expect(data.skillCount).toBe(0);
      expect(data.agentCount).toBe(0);

      const text = formatDashboardText(data);
      expect(text).toContain("0 installed");
      expect(text).toContain("0 compiled");
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

      const data = await getDashboardData(projectDir);
      const info = await getInstallationInfo();

      expect(data.mode, "a config mixing marketplace and ejected origins is a mixed install").toBe(
        "mixed",
      );
      expect(
        data.skillCount,
        "a mixed installation manages its plugin skills as much as its ejected ones",
      ).toBe(MIXED_INSTALL_SKILLS.length);
      expect(formatDashboardText(data)).toContain(`${MIXED_INSTALL_SKILLS.length} installed`);

      expect(info).not.toBeNull();
      expect(
        info!.skillCount,
        "the dashboard and list read one installation, so they cannot report two numbers",
      ).toBe(data.skillCount);
      expect(formatInstallationDisplay(info!)).toContain(`Skills:  ${data.skillCount}`);
    });

    it("does not count a skill directory the configuration never declared", async () => {
      await writeInstallation(projectDir, MIXED_INSTALL_SKILLS, [
        EJECTED_SKILL_ID,
        UNDECLARED_SKILL_DIR,
      ]);

      const data = await getDashboardData(projectDir);
      const info = await getInstallationInfo();

      expect(
        data.skillCount,
        "a directory this CLI never installed is not part of what it reports it manages",
      ).toBe(MIXED_INSTALL_SKILLS.length);
      expect(info).not.toBeNull();
      expect(info!.skillCount).toBe(data.skillCount);
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

      const data = await getDashboardData(projectDir);
      const info = await getInstallationInfo();

      expect(
        data.skillCount,
        "a tombstone records a skill this project has excluded, not one it manages",
      ).toBe(MIXED_INSTALL_SKILLS.length);
      expect(info).not.toBeNull();
      expect(info!.skillCount).toBe(data.skillCount);
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

      // The formatter titles with the name it was handed; `getDashboardData` resolves it.
      expect(text).toContain(WHITE_LABEL_NAME);
      expect(text).toContain("12 installed");
      expect(text).toContain("3 compiled");
      expect(text).toContain("Plugin");
      expect(text).toContain("github:agents-inc/skills");
      expect(text).toContain("[Edit in the web editor]");
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
