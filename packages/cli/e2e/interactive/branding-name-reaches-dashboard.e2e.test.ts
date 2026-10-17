import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { DashboardSession } from "../pages/dashboard-session.js";
import { BRANDING, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * The dashboard in a real PTY, the component branch a piped run never reaches. Both specs pair the
 * configured title with the default; the settle sentinel is {@link STEP_TEXT.DASHBOARD}, painted
 * the same in both states.
 */

/** The config's own `name`, not the branding. */
const PROJECT_NAME = "branding-dashboard-fixture";

/** `detectInstallation` answers null for a config declaring no content. */
const DASHBOARD_CONTENT = {
  skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project" }),
  agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
};

describe("the name the interactive dashboard titles itself with", () => {
  let dashboard: DashboardSession | undefined;
  let tempDir: string | undefined;

  afterEach(async () => {
    await dashboard?.destroy();
    dashboard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  /**
   * `TerminalSession` gives a fresh empty HOME, so no global config can answer for the project's
   * branding.
   */
  async function launchDashboardFor(brandingName?: string): Promise<DashboardSession> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    await writeProjectConfig(projectDir, {
      name: PROJECT_NAME,
      ...DASHBOARD_CONTENT,
      ...(brandingName !== undefined && { branding: { name: brandingName } }),
    });
    await createLocalSkill(projectDir, E2E_SKILL.react.id);
    await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });

    const session = await DashboardSession.launch({ projectDir });
    await session.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
    return session;
  }

  it("titles itself with the configured name, in place of the shipped logo", async () => {
    dashboard = await launchDashboardFor(BRANDING.WHITE_LABEL_NAME);

    const output = dashboard.getOutput();
    expect(output).toContain(BRANDING.WHITE_LABEL_NAME);
    expect(
      output,
      "the shipped logo spells the shipped name, so a white-labelled dashboard must not paint it",
    ).not.toContain(STEP_TEXT.LOGO_BANNER);

    await dashboard.escape();
    expect(await dashboard.waitForExit()).toBe(EXIT_CODES.SUCCESS);
  });

  it("keeps the shipped logo when no name is configured", async () => {
    dashboard = await launchDashboardFor();

    const output = dashboard.getOutput();
    expect(output).toContain(STEP_TEXT.LOGO_BANNER);
    expect(output).not.toContain(BRANDING.WHITE_LABEL_NAME);

    await dashboard.escape();
    expect(await dashboard.waitForExit()).toBe(EXIT_CODES.SUCCESS);
  });

  /**
   * Only a PTY shows whether the counts fit above the menu. One skill and one sub-agent, so the
   * counts are named exactly.
   */
  it("shows the counts, which only the piped output used to carry", async () => {
    dashboard = await launchDashboardFor();

    const output = dashboard.getOutput();

    expect(output, "the skills row").toMatch(/Skills:\s+1 installed/);
    expect(output, "the agents row").toMatch(/Agents:\s+1 compiled/);
    expect(output, "the install-mode row").toMatch(/Mode:\s+\S/);

    await dashboard.escape();
    expect(await dashboard.waitForExit()).toBe(EXIT_CODES.SUCCESS);
  });
});
