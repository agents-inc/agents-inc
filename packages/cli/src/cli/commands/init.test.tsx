import path from "path";
import { mkdir } from "fs/promises";
import { Config } from "@oclif/core";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Init, {
  Dashboard,
  dashboardCountLines,
  formatDashboardText,
  type DashboardData,
} from "./init";
import { DEFAULT_BRANDING } from "../consts";
import { buildProjectConfig } from "../lib/__tests__/factories/config-factories";
import { CLI_ROOT } from "../lib/__tests__/helpers/cli-runner";
import { writeTestTsConfig } from "../lib/__tests__/helpers/config-io";
import { standAtTerminal } from "../lib/__tests__/helpers/terminal-input";
import {
  ARROW_DOWN,
  delay,
  ENTER,
  INPUT_DELAY_MS,
  RENDER_DELAY_MS,
} from "../lib/__tests__/test-constants";
import { cleanupTempDir, createTempDir } from "../lib/__tests__/test-fs-utils";

/** Expected lines come from {@link dashboardCountLines}, so the TTY and piped paths cannot drift. */

const WITH_MARKETPLACE: DashboardData = {
  name: DEFAULT_BRANDING.NAME,
  skillCount: 12,
  agentCount: 3,
  mode: "plugin",
  source: "github:agents-inc/skills",
};

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

  // Control for the pair above, which an empty `dashboardCountLines` would satisfy for free.
  it("draws a marketplace line only for an installation that names one", () => {
    expect(dashboardCountLines(WITH_MARKETPLACE)).toHaveLength(
      dashboardCountLines(WITHOUT_MARKETPLACE).length + 1,
    );
    expect(formatDashboardText(WITH_MARKETPLACE)).toContain("github:agents-inc/skills");
    expect(formatDashboardText(WITHOUT_MARKETPLACE)).not.toContain("Marketplace:");
  });

  it("still offers the four commands", async () => {
    const frame = await frameFor(WITH_MARKETPLACE);

    expect(frame).toContain("Edit in the web editor");
    expect(frame).toContain("Compile");
    expect(frame).toContain("Doctor");
    expect(frame).toContain("List");
    expect(formatDashboardText(WITH_MARKETPLACE)).toContain(
      "  [Edit in the web editor]  [Compile]  [Doctor]  [List]",
    );
  });
});

/** The run is real up to the command it chooses, which is recorded rather than run. */
describe("choosing Edit in the web editor", () => {
  const terminal = standAtTerminal();
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-init-dashboard-edit-");
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    // An unstubbed HOME would let the developer's own installation answer for the global scope.
    vi.stubEnv("HOME", tempDir);
    process.chdir(projectDir);
    await writeTestTsConfig(projectDir, buildProjectConfig());
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  it("runs edit --ui", async () => {
    const painted = vi.spyOn(process.stdout, "write").mockImplementation((_chunk, ...rest) => {
      const onWritten = rest.find((argument) => typeof argument === "function");
      if (onWritten !== undefined) queueMicrotask(() => onWritten());
      return true;
    });
    const runCommand = vi.spyOn(Config.prototype, "runCommand").mockResolvedValue(undefined);

    try {
      const run = Init.run([], { root: CLI_ROOT });
      terminal.input.push(ENTER);
      await run;

      expect(runCommand).toHaveBeenCalledWith("edit", ["--ui"]);
    } finally {
      painted.mockRestore();
      runCommand.mockRestore();
    }
  });
});

/**
 * A burst of keys arrives with no frame between them, so a handler reading rendered focus acts on
 * a stale option. The paced twin is the control.
 */
describe("the dashboard's keys", () => {
  function dashboardChoosing(): {
    stdin: { write: (data: string) => void };
    chosen: () => unknown;
  } {
    const onSelect = vi.fn();
    const { stdin } = render(
      <Dashboard
        data={WITH_MARKETPLACE}
        onSelect={onSelect}
        onCancel={() => {
          /* not exercised here */
        }}
      />,
    );
    return { stdin, chosen: () => onSelect.mock.lastCall?.[0] };
  }

  it("runs the option Down, Down, Enter lands on when the keys arrive in one burst", async () => {
    const { stdin, chosen } = dashboardChoosing();
    await delay(RENDER_DELAY_MS);

    stdin.write(ARROW_DOWN + ARROW_DOWN + ENTER);
    await delay(RENDER_DELAY_MS);

    expect(chosen(), "two moves down from Edit is Doctor, however fast they came").toBe("doctor");
  });

  it("runs the same option when the keys arrive a frame apart", async () => {
    const { stdin, chosen } = dashboardChoosing();
    await delay(RENDER_DELAY_MS);

    for (const key of [ARROW_DOWN, ARROW_DOWN, ENTER]) {
      stdin.write(key);
      await delay(INPUT_DELAY_MS);
    }

    expect(chosen()).toBe("doctor");
  });
});
