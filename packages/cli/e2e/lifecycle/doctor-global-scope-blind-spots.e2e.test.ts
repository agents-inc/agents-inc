import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  skillsPath,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";

/**
 * Doctor blind spots that only appear once agents and skills are installed at
 * global scope.
 *
 * Both scenarios are certified healthy (or self-contradictory) by doctor today
 * even though the on-disk state is fine and doctor's own report is wrong.
 */

let source: E2ESource;

beforeAll(async () => {
  await ensureBinaryExists();
  source = await createE2ESource();
}, TIMEOUTS.SETUP);

afterAll(async () => {
  await cleanupFixture(source);
});

describe("doctor global-scope diagnostics", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it(
    "does not report compiled global agents as orphans when run at home scope",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const fakeHome = path.join(tempDir, "home");

      await writeProjectConfig(fakeHome, {
        name: "global-install",
        source: source.sourceDir,
        skills: [{ id: "web-framework-react", scope: "global", source: "eject" }],
        agents: [{ name: "web-developer", scope: "global" }],
        selectedDomains: ["web"],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });
      await createLocalSkill(fakeHome, "web-framework-react", {
        metadata: renderMetadataYaml({
          displayName: "web-framework-react",
          category: "web-framework",
          slug: "react",
          domain: "web",
          cliDescription: "React JavaScript framework",
          usageGuidance: "Use React for building component-based UIs",
          contentHash: "b2c3d4e",
        }),
      });
      await writeAgentFile(fakeHome, "web-developer", { frontmatter: true });

      const configBefore = await readTestFile(configTsPath(fakeHome));
      const agentsBefore = await listFiles(agentsPath(fakeHome));
      const skillsBefore = await listFiles(skillsPath(fakeHome));

      const { exitCode, stdout } = await runCLI(["doctor"], fakeHome, {
        env: { HOME: fakeHome },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      expect(await readTestFile(configTsPath(fakeHome)), "doctor must not rewrite config.ts").toBe(
        configBefore,
      );
      expect(await listFiles(agentsPath(fakeHome))).toStrictEqual(agentsBefore);
      expect(await listFiles(skillsPath(fakeHome))).toStrictEqual(skillsBefore);

      expect(stdout, "the global agent file is present, so it must count as compiled").toContain(
        "1/1 agents compiled",
      );
      expect(
        stdout,
        "a global agent declared in config.ts is not an orphan just because doctor ran at home scope",
      ).not.toContain("not in config");
      expect(stdout).toContain("No orphaned agent files");
    },
  );

  it(
    "checks the skills listed in config.ts on a global-only install with no stack",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const fakeHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      await writeProjectConfig(fakeHome, {
        name: "global-only-install",
        source: source.sourceDir,
        skills: [
          { id: "web-framework-react", scope: "global", source: "eject" },
          { id: "web-testing-vitest", scope: "global", source: "eject" },
        ],
        agents: [{ name: "web-developer", scope: "global" }],
        selectedDomains: ["web"],
      });
      await createLocalSkill(fakeHome, "web-framework-react", {
        metadata: renderMetadataYaml({
          displayName: "web-framework-react",
          category: "web-framework",
          slug: "react",
          domain: "web",
          cliDescription: "React JavaScript framework",
          usageGuidance: "Use React for building component-based UIs",
          contentHash: "b2c3d4e",
        }),
      });
      await createLocalSkill(fakeHome, "web-testing-vitest", {
        metadata: renderMetadataYaml({
          displayName: "web-testing-vitest",
          category: "web-testing",
          slug: "vitest",
          domain: "web",
          cliDescription: "Vitest test runner",
          usageGuidance: "Use Vitest for fast unit and integration tests",
          contentHash: "c3d4e5f",
        }),
      });
      await writeAgentFile(fakeHome, "web-developer", { frontmatter: true });

      const config = await loadConfigOrFail(fakeHome);
      expect(
        config.skills.map((skill) => skill.id),
        "the install under test must declare skills for the check to be meaningful",
      ).toStrictEqual(["web-framework-react", "web-testing-vitest"]);

      const configBefore = await readTestFile(configTsPath(fakeHome));
      const skillsBefore = await listFiles(skillsPath(fakeHome));

      const { exitCode, stdout } = await runCLI(["doctor"], projectDir, {
        env: { HOME: fakeHome },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      expect(await readTestFile(configTsPath(fakeHome)), "doctor must not rewrite config.ts").toBe(
        configBefore,
      );
      expect(await listFiles(skillsPath(fakeHome))).toStrictEqual(skillsBefore);

      expect(
        stdout,
        "config.ts lists two skills, so the skills check must not claim there are none",
      ).not.toContain("No skills configured");
      expect(stdout).toContain("2/2 skills found");
    },
  );
});
