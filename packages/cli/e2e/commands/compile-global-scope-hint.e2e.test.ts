import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  ensureBinaryExists,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";

/**
 * Project-context compile hint.
 *
 * When the project pass resolves zero project agents but the config still
 * declares global-scope agents, `cc compile` must tell the user where those
 * agents recompile instead of printing a silent "No agents to recompile".
 */
describe("compile project-context global-scope hint", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  async function seedGlobalInstall(globalHome: string): Promise<void> {
    await writeProjectConfig(globalHome, {
      name: "global-test",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
      },
    });
    await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
      description: "Global skill for hint test",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("web-testing-cypress-e2e"),
        contentHash: "hash-hint-g",
      }),
    });
  }

  it("hints where global-scoped agents recompile when the project pass has none", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    await seedGlobalInstall(globalHome);

    // Project install declares ONLY a global-scoped agent plus a project skill
    // (so the project pass discovers skills and reaches the compile step).
    await writeProjectConfig(projectDir, {
      name: "project-test",
      skills: [{ id: "web-testing-playwright-e2e", scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
    });
    await createLocalSkill(projectDir, "web-testing-playwright-e2e", {
      description: "Project skill for hint test",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("web-testing-playwright-e2e"),
        contentHash: "hash-hint-p",
      }),
    });

    const { exitCode, output } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.NO_AGENTS_TO_RECOMPILE);
    expect(output).toContain(STEP_TEXT.COMPILE_GLOBAL_SCOPE_HINT);
  });

  it("does not hint when the project has project-scope agents to recompile", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    await seedGlobalInstall(globalHome);

    // Project install has a project-scoped agent that DOES compile in the project pass
    await writeProjectConfig(projectDir, {
      name: "project-test",
      skills: [{ id: "web-testing-playwright-e2e", scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-testing": [{ id: "web-testing-playwright-e2e", preloaded: true }],
        },
      },
    });
    await createLocalSkill(projectDir, "web-testing-playwright-e2e", {
      description: "Project skill for guard test",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("web-testing-playwright-e2e"),
        contentHash: "hash-guard-p",
      }),
    });

    const { exitCode, output } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).not.toContain(STEP_TEXT.COMPILE_GLOBAL_SCOPE_HINT);
  });
});
