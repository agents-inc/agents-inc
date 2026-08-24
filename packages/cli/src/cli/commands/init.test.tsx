import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";

import { Dashboard, dashboardCountLines, formatDashboardText, type DashboardData } from "./init";
import { DEFAULT_BRANDING } from "../consts";
import { delay, RENDER_DELAY_MS } from "../lib/__tests__/test-constants";

/**
 * The interactive dashboard against the piped one, on the counts block they are meant to share.
 *
 * `showDashboard` branches on `process.stdin.isTTY`: a pipe gets `formatDashboardText`, a terminal
 * gets this component. The two rendered different things — the text path printed skill count,
 * agent count, install mode and marketplace, and the component printed the title and the four menu
 * rows and nothing else — so the screen a person actually sits in front of was **less informative
 * than the output they got by piping it**, with every assertion on the subject green throughout
 * because each path was only ever checked against itself.
 *
 * These read the expected lines out of {@link dashboardCountLines} rather than restating them, so
 * the pair cannot drift again: a line added to the text path and not to the component fails here.
 */

/** An installation naming a marketplace — the widest count block, four lines. */
const WITH_MARKETPLACE: DashboardData = {
  name: DEFAULT_BRANDING.NAME,
  skillCount: 12,
  agentCount: 3,
  mode: "plugin",
  source: "github:agents-inc/skills",
};

/** The narrower one: no marketplace, so `dashboardCountLines` yields three lines rather than four. */
const WITHOUT_MARKETPLACE: DashboardData = {
  name: DEFAULT_BRANDING.NAME,
  skillCount: 0,
  agentCount: 0,
  mode: "eject",
};

async function frameFor(data: DashboardData): Promise<string> {
  const { lastFrame } = render(
    <Dashboard
      data={data}
      onSelect={() => {
        /* not exercised here */
      }}
      onCancel={() => {
        /* not exercised here */
      }}
    />,
  );
  await delay(RENDER_DELAY_MS);
  return lastFrame() ?? "";
}

describe("the dashboard a person sits in front of", () => {
  it("carries every count line the piped dashboard prints", async () => {
    const frame = await frameFor(WITH_MARKETPLACE);

    const missing = dashboardCountLines(WITH_MARKETPLACE).filter((line) => !frame.includes(line));

    expect(
      missing,
      "the interactive dashboard must not show less than the same data printed through a pipe",
    ).toStrictEqual([]);
  });

  it("carries them for an installation that names no marketplace", async () => {
    const frame = await frameFor(WITHOUT_MARKETPLACE);

    const missing = dashboardCountLines(WITHOUT_MARKETPLACE).filter(
      (line) => !frame.includes(line),
    );

    expect(missing).toStrictEqual([]);
  });

  /**
   * The control for the pair above: without it, a `dashboardCountLines` that answered `[]` would
   * satisfy both of them for free, and an empty counts block is the defect they exist to catch.
   */
  it("draws a marketplace line only for an installation that names one", () => {
    expect(dashboardCountLines(WITH_MARKETPLACE)).toHaveLength(
      dashboardCountLines(WITHOUT_MARKETPLACE).length + 1,
    );
    expect(formatDashboardText(WITH_MARKETPLACE)).toContain("github:agents-inc/skills");
    expect(formatDashboardText(WITHOUT_MARKETPLACE)).not.toContain("Marketplace:");
  });

  /** The menu the component owns and the text path only imitates, still painted below the counts. */
  it("still offers the four commands", async () => {
    const frame = await frameFor(WITH_MARKETPLACE);

    expect(frame).toContain("Edit");
    expect(frame).toContain("Compile");
    expect(frame).toContain("Doctor");
    expect(frame).toContain("List");
  });
});
