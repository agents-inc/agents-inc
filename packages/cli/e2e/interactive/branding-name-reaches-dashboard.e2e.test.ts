import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { DashboardSession } from "../pages/dashboard-session.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { BRANDING, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

/**
 * The dashboard a person actually sees, driven through a real PTY — its title, and the counts
 * block that for a while only the piped output carried.
 *
 * Its sibling `commands/branding-name-reaches-headings` drives the same screen through a pipe,
 * and a pipe is non-TTY by construction: `showDashboard` prints `formatDashboardText(data)` on
 * that branch and renders the `Dashboard` component on the other one. Only the component branch
 * is a dashboard anyone reads, and no piped spec can reach it — which is why the branded title
 * could be absent from it for as long as it was while every assertion on the subject stayed green.
 *
 * **Both `it`s here are one assertion split in two, and neither means anything alone.** The
 * configured half on its own passes on a title hardcoded to the fixture name; the default half on
 * its own passes on a logo that never learned to give way. Together they say the title follows the
 * configuration.
 *
 * The settle sentinel is deliberately {@link STEP_TEXT.DASHBOARD} — a menu row, painted the same
 * in both states. Waiting on the title itself would make each test wait for its own subject and
 * report a real absence as a timeout rather than as a failed assertion.
 */

/** The `name` field both fixture configs carry — the config's own name, not the branding. */
const PROJECT_NAME = "branding-dashboard-fixture";

/**
 * The one skill and one sub-agent the dashboard needs before it will render at all.
 * `detectInstallation` answers `null` for a configuration declaring no content, and a bare
 * invocation then falls through to oclif's help with no dashboard on screen to assert about.
 */
const DASHBOARD_CONTENT = {
  skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project" }),
  agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
};

describe("the name the interactive dashboard titles itself with", () => {
  let dashboard: DashboardSession | undefined;
  let tempDir: string | undefined;
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    // Built once: the dashboard never reads this marketplace, but `launchForDashboard` always
    // passes `--marketplace`, and rebuilding a source per test costs seconds for nothing.
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await dashboard?.destroy();
    dashboard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  /**
   * An installed project whose config carries `branding.name` when one is given, and no
   * `branding` key at all when it is not — the two states this file is about.
   *
   * HOME is left to `TerminalSession`, which allocates a fresh empty directory distinct from the
   * project and removes it on destroy. That isolation is load-bearing rather than incidental:
   * branding resolves through the project config and falls back to the GLOBAL one, so a HOME
   * holding any config of its own could answer for the project's and make the default half
   * unfalsifiable.
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

    const session = await InitWizard.launchForDashboard({
      projectDir,
      source: { sourceDir, tempDir: sourceTempDir },
    });
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
   * The counts, in a real terminal — the half no unit test can answer.
   *
   * `commands/init.test.tsx` compares the component's frame against `dashboardCountLines` and is
   * the gate on the two paths agreeing. What it renders into is ink-testing-library's own
   * viewport, so it cannot say whether four more rows still fit above the menu on a screen a
   * person has. This one paints into a PTY at the fixture's geometry and reads what came back.
   *
   * The fixture installs exactly one skill and one sub-agent — {@link DASHBOARD_CONTENT}, which
   * the dashboard needs before it will render at all — so the counts are named rather than
   * matched loosely: a row reading "0 installed" would mean the screen painted a block about an
   * installation it could not see.
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
