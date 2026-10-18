import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  agentsLeftOutOfCodexMessage,
  unexpressibleOnCodexMessage,
} from "@workspace/compile/agent-source";

import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { codexCompileNotices } from "../codex-compile-notices.js";
import { hostCompileNotices } from "../host-compile-notices.js";

// The two roster notices are worded, and pinned, by the compile package; what is asserted here is
// which notices a compile says and in what order. The trust notice is this package's own text.

const CODEX_HOME_VAR = "CODEX_HOME";
const CODEX_CONFIG_TOML = "config.toml";
const PROJECT_ROLES_DIR = path.join(".codex", "agents");

let tempDir: string;
let codexHome: string;
let projectDir: string;
let originalCodexHome: string | undefined;

beforeEach(async () => {
  tempDir = await createTempDir();
  codexHome = path.join(tempDir, ".codex-home");
  projectDir = path.join(tempDir, "project");
  await mkdir(projectDir, { recursive: true });
  originalCodexHome = process.env[CODEX_HOME_VAR];
  process.env[CODEX_HOME_VAR] = codexHome;
});

afterEach(async () => {
  if (originalCodexHome === undefined) delete process.env[CODEX_HOME_VAR];
  else process.env[CODEX_HOME_VAR] = originalCodexHome;
  await cleanupTempDir(tempDir);
});

async function projectHoldsARole(): Promise<void> {
  await mkdir(path.join(projectDir, PROJECT_ROLES_DIR), { recursive: true });
  await writeFile(path.join(projectDir, PROJECT_ROLES_DIR, "pm.toml"), 'name = "pm"\n');
}

const rosterNotices = () => [agentsLeftOutOfCodexMessage(), unexpressibleOnCodexMessage()];

describe("what a compile says about Codex", () => {
  it("says nothing for a Claude installation", async () => {
    await projectHoldsARole();

    expect(await codexCompileNotices("claude", projectDir)).toStrictEqual([]);
  });

  it("says what Codex leaves out, and nothing about trust while the project holds no roles", async () => {
    expect(await codexCompileNotices("codex", projectDir)).toStrictEqual(rosterNotices());
  });

  it("trusts a project that holds roles and says so, after the roster notices", async () => {
    await projectHoldsARole();

    expect(await codexCompileNotices("codex", projectDir)).toStrictEqual([
      ...rosterNotices(),
      `Trusted this project in your Codex configuration, so Codex reads its sub-agents: added [projects."${projectDir}"] with trust_level = "trusted" to ${path.join(codexHome, CODEX_CONFIG_TOML)}.`,
    ]);
  });

  it("says nothing about trust for a project Codex already trusts", async () => {
    await projectHoldsARole();
    await mkdir(codexHome, { recursive: true });
    await writeFile(
      path.join(codexHome, CODEX_CONFIG_TOML),
      `[projects."${projectDir}"]\ntrust_level = "trusted"\n`,
    );

    expect(await codexCompileNotices("codex", projectDir)).toStrictEqual(rosterNotices());
  });
});

describe("what a compile says, whichever host", () => {
  it("passes Codex's notices on for a Codex installation", async () => {
    expect(await hostCompileNotices("codex", projectDir)).toStrictEqual(rosterNotices());
  });
});
