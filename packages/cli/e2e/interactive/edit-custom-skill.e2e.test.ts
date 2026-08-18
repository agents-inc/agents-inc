import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createLocalSkill,
  ensureBinaryExists,
  loadConfigOrFail,
  renderMetadataYaml,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_CUSTOM_SKILL, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * A skill the user wrote in their own project, taken through the edit wizard.
 *
 * Nothing in any marketplace carries it, so the only install it can have is the copy
 * already on disk — and the wizard must reach that conclusion on its own, without the
 * user first correcting a marketplace default. The install then completes, and the skill
 * reaches the sub-agents its category's domain names.
 *
 * The Sources step is walked but NOT set: `setAllLocal` would establish by hand exactly
 * the state under test, so this spec advances past the step untouched.
 */

describe("edit wizard — a skill the user wrote", () => {
  let sourceFixture: E2ESource;
  let wizard: EditWizard | undefined;
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    sourceFixture = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(sourceFixture);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "installs it as the project's own copy and compiles it into its agent",
    { timeout: TIMEOUTS.PLUGIN_INSTALL },
    async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      await createLocalSkill(project.dir, E2E_CUSTOM_SKILL.id, {
        description: "A skill this project wrote for itself",
        body: `# ${E2E_CUSTOM_SKILL.display}\n\nHouse conventions for tooling.`,
        metadata: renderMetadataYaml({
          custom: true,
          domain: E2E_CUSTOM_SKILL.domain,
          category: E2E_CUSTOM_SKILL.category,
          slug: E2E_CUSTOM_SKILL.slug,
          displayName: E2E_CUSTOM_SKILL.display,
          cliDescription: "House tooling conventions",
          usageGuidance: "Use when wiring this project's build",
          contentHash: "c0ffee1",
        }),
      });

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: sourceFixture,
        ...TERMINAL_SIZE.TALL,
        env: { HOME: project.dir },
      });

      await wizard.build.selectSkill(E2E_CUSTOM_SKILL.display);

      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      expect(
        await result.exitCode,
        "a skill no marketplace carries must install, not abort the edit",
      ).toBe(EXIT_CODES.SUCCESS);

      const config = await loadConfigOrFail(project.dir);
      expect(
        config.skills.find((skill) => skill.id === E2E_CUSTOM_SKILL.id)?.origin,
        "the saved entry names the project's own copy, not a marketplace",
      ).toBe(E2E_CUSTOM_SKILL.origin);

      await expect(result.project).toHaveCompiledAgentContent("web-developer", {
        contains: [E2E_CUSTOM_SKILL.id],
      });

      await expect(result.project).toHaveSkillCopied(E2E_CUSTOM_SKILL.id);
    },
  );
});
