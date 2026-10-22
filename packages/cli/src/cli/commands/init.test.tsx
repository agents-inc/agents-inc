import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { Config } from "@oclif/core";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Init, { Dashboard, formatDashboardText, type DashboardData } from "./init";
import { CLAUDE_DIR, DEFAULT_BRANDING, STANDARD_DIRS } from "../consts";
import { EXIT_CODES } from "../lib/exit-codes";
import { sourceFolderInUse } from "../lib/installation/install-layout";
import type { ProviderInstallation } from "../lib/plugins/plugin-info";
import { buildAgentConfigs, buildProjectConfig } from "../lib/__tests__/factories/config-factories";
import { CLI_ROOT, runCliCommand } from "../lib/__tests__/helpers/cli-runner";
import { writeTestTsConfig } from "../lib/__tests__/helpers/config-io";
import { setupIsolatedHome } from "../lib/__tests__/helpers/isolated-home";
import { buildSkillConfigs } from "../lib/__tests__/helpers/skill-config-builders";
import { standAtTerminal } from "../lib/__tests__/helpers/terminal-input";
import {
  ARROW_DOWN,
  CTRL_C,
  delay,
  ENTER,
  INPUT_DELAY_MS,
  RENDER_DELAY_MS,
} from "../lib/__tests__/test-constants";

/** The key Escape sends; Ink reads it as `key.escape`. */
const ESCAPE = "\u001B";
import { cleanupTempDir, createTempDir } from "../lib/__tests__/test-fs-utils";

const CLAUDE_WITH_MARKETPLACE: ProviderInstallation = {
  provider: "claude",
  skillCount: 12,
  agentCount: 3,
  mode: "plugin",
  marketplace: "github:agents-inc/skills",
};

const CODEX_WITHOUT_MARKETPLACE: ProviderInstallation = {
  provider: "codex",
  skillCount: 0,
  agentCount: 0,
  mode: "eject",
};

const WITH_MARKETPLACE: DashboardData = {
  name: DEFAULT_BRANDING.NAME,
  installations: [CLAUDE_WITH_MARKETPLACE],
};

const WITHOUT_MARKETPLACE: DashboardData = {
  name: DEFAULT_BRANDING.NAME,
  installations: [{ ...CODEX_WITHOUT_MARKETPLACE, provider: "claude" }],
};

const BOTH_PROVIDERS: DashboardData = {
  name: DEFAULT_BRANDING.NAME,
  installations: [CLAUDE_WITH_MARKETPLACE, CODEX_WITHOUT_MARKETPLACE],
};

/** The count lines both dashboards print, held once so the TTY and piped specs pin the same text. */
const WITH_MARKETPLACE_COUNTS = [
  "  Skills:       12 installed",
  "  Agents:       3 compiled",
  "  Mode:         Plugin",
  "  Marketplace:  github:agents-inc/skills",
];

const WITHOUT_MARKETPLACE_COUNTS = [
  "  Skills:       0 installed",
  "  Agents:       0 compiled",
  "  Mode:         Eject",
];

/** One block per provider, each named, a blank line apart. */
const BOTH_PROVIDERS_COUNTS = [
  "  Provider:     claude",
  ...WITH_MARKETPLACE_COUNTS,
  "",
  "  Provider:     codex",
  ...WITHOUT_MARKETPLACE_COUNTS,
];

const DASHBOARD_COMMANDS_LINE = "  [Edit in the web editor]  [Compile]  [Doctor]  [List]";

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

    const missing = WITH_MARKETPLACE_COUNTS.filter((line) => !frame.includes(line));

    expect(
      missing,
      "the interactive dashboard must not show less than the same data printed through a pipe",
    ).toStrictEqual([]);
  });

  it("carries them, and no marketplace line, for an installation that names no marketplace", async () => {
    const frame = await frameFor(WITHOUT_MARKETPLACE);

    const missing = WITHOUT_MARKETPLACE_COUNTS.filter((line) => !frame.includes(line));

    expect(missing).toStrictEqual([]);
    expect(frame).not.toContain("Marketplace:");
  });

  it("shows one block per provider over a scope holding two installations, each named", async () => {
    const frame = await frameFor(BOTH_PROVIDERS);

    expect(frame).toContain([...BOTH_PROVIDERS_COUNTS, "", ""].join("\n"));
  });

  it("still offers the four commands", async () => {
    const frame = await frameFor(WITH_MARKETPLACE);

    expect(frame).toContain("Edit in the web editor");
    expect(frame).toContain("Compile");
    expect(frame).toContain("Doctor");
    expect(frame).toContain("List");
    expect(formatDashboardText(WITH_MARKETPLACE)).toContain(DASHBOARD_COMMANDS_LINE);
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

describe("the dashboard's title", () => {
  it("is the shipped logo for the shipped name", async () => {
    const frame = await frameFor(WITH_MARKETPLACE);

    expect(frame).toContain("█████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗");
  });

  it("is the configured name, in place of the logo, for a white-labelled installation", async () => {
    const frame = await frameFor({ ...WITH_MARKETPLACE, name: "Northwind" });

    expect(frame).toContain("Northwind");
    expect(frame).not.toContain("█████╗");
  });
});

describe("the dashboard printed without a terminal", () => {
  it.each([
    ["names a marketplace", WITH_MARKETPLACE, WITH_MARKETPLACE_COUNTS],
    ["names none", WITHOUT_MARKETPLACE, WITHOUT_MARKETPLACE_COUNTS],
    ["sits beside another provider's, one block each", BOTH_PROVIDERS, BOTH_PROVIDERS_COUNTS],
  ])(
    "is the name, the counts and the commands, each block a blank line apart, for an installation that %s",
    (_installation, data, counts) => {
      expect(formatDashboardText(data)).toBe(
        ["Agents Inc.", "", ...counts, "", DASHBOARD_COMMANDS_LINE].join("\n"),
      );
    },
  );
});

/** Read off disk: each provider's own config, and its own agents folders in its own format. */
describe("the dashboard over a scope holding a Claude and a Codex installation", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-init-dashboard-providers-"));
    // Empty reads as unset: Codex's global folder is then the fake home's.
    vi.stubEnv("CODEX_HOME", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanup();
  });

  async function installClaude(): Promise<void> {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
          scope: "project",
          origin: "eject",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      }),
    );
    await compiledAgents(path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS), [
      "web-developer.md",
    ]);
  }

  async function installCodex(): Promise<void> {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs(["web-developer", "pm"], { scope: "project" }),
      }),
      sourceFolderInUse(projectDir, "codex").relName,
    );
    await compiledAgents(path.join(projectDir, ".codex", STANDARD_DIRS.AGENTS), [
      "web-developer.toml",
      "pm.toml",
    ]);
  }

  async function compiledAgents(dir: string, files: string[]): Promise<void> {
    await mkdir(dir, { recursive: true });
    await Promise.all(files.map((file) => writeFile(path.join(dir, file), "compiled\n")));
  }

  it("prints one block per provider, each counting its own skills and compiled sub-agents", async () => {
    await installClaude();
    await installCodex();

    const { stdout, error } = await runCliCommand(["init"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        "Agents Inc.",
        "",
        "  Provider:     claude",
        "  Skills:       2 installed",
        "  Agents:       1 compiled",
        "  Mode:         Eject",
        "",
        "  Provider:     codex",
        "  Skills:       1 installed",
        "  Agents:       2 compiled",
        "  Mode:         Eject",
        "",
        DASHBOARD_COMMANDS_LINE,
        "",
      ].join("\n"),
    );
  });

  it("prints the one block, naming no provider, over a scope holding one installation", async () => {
    await installCodex();

    const { stdout, error } = await runCliCommand(["init"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        "Agents Inc.",
        "",
        "  Skills:       1 installed",
        "  Agents:       2 compiled",
        "  Mode:         Eject",
        "",
        DASHBOARD_COMMANDS_LINE,
        "",
      ].join("\n"),
    );
  });
});

/** The run is real up to the command it chooses, which is recorded rather than run. */
describe("leaving the dashboard", () => {
  const terminal = standAtTerminal();
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-init-dashboard-leave-");
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    vi.stubEnv("HOME", tempDir);
    process.chdir(projectDir);
    await writeTestTsConfig(projectDir, buildProjectConfig());
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  async function leaveWith(keys: string[]): Promise<{
    painted: string;
    ran: unknown[][];
    error: (Error & { oclif?: { exit?: number } }) | undefined;
  }> {
    const chunks: string[] = [];
    const painted = vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest) => {
      chunks.push(String(chunk));
      const onWritten = rest.find((argument) => typeof argument === "function");
      if (onWritten !== undefined) queueMicrotask(() => onWritten());
      return true;
    });
    const runCommand = vi.spyOn(Config.prototype, "runCommand").mockResolvedValue(undefined);
    try {
      const run = Init.run([], { root: CLI_ROOT }).then(
        () => undefined,
        (error: Error & { oclif?: { exit?: number } }) => error,
      );
      await delay(RENDER_DELAY_MS);
      for (const key of keys) {
        terminal.input.push(key);
        await delay(INPUT_DELAY_MS);
      }
      const error = await run;
      return { painted: chunks.join(""), ran: runCommand.mock.calls, error };
    } finally {
      painted.mockRestore();
      runCommand.mockRestore();
    }
  }

  it("runs compile with no arguments, and clears the screen it filled", async () => {
    const { painted, ran } = await leaveWith([ARROW_DOWN, ENTER]);

    expect(ran).toStrictEqual([["compile", []]]);
    expect(painted.endsWith("\x1b[H\x1b[2J\x1b[3J")).toBe(true);
  });

  it("runs nothing and ends quietly on Escape", async () => {
    const { ran, error } = await leaveWith([ESCAPE]);

    expect(ran).toStrictEqual([]);
    expect(error).toBeUndefined();
  });

  it("cancels the run on Ctrl+C", async () => {
    const { ran, error } = await leaveWith([CTRL_C]);

    expect(ran).toStrictEqual([]);
    expect(error?.message).toBe("Cancelled");
    expect(error?.oclif?.exit).toBe(EXIT_CODES.CANCELLED);
  });
});
