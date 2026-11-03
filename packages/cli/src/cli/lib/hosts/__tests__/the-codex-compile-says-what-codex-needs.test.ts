import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  agentsLeftOutOfCodexMessage,
  unexpressibleOnCodexMessage,
} from "@workspace/compile/agent-source";

import { overrideEnv, type RestoreEnv } from "../../__tests__/helpers/env-override.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { fileExists } from "../../../utils/fs.js";
import { codexCompileNotices } from "../codex-compile-notices.js";
import { hostCompileNotices } from "../host-compile-notices.js";

// The two roster notices are worded, and pinned, by the compile package; what is asserted here is
// which notices a compile says and in what order. The trust notice is this package's own text.

const CODEX_HOME_VAR = "CODEX_HOME";
const CODEX_CONFIG_TOML = "config.toml";
const CODEX_DIR = ".codex";
const PROJECT_ROLES_DIR = path.join(CODEX_DIR, "agents");

let tempDir: string;
let codexHome: string;
let projectDir: string;
let restoreCodexHome: RestoreEnv;

beforeEach(async () => {
  tempDir = await createTempDir();
  codexHome = path.join(tempDir, ".codex-home");
  projectDir = path.join(tempDir, "project");
  await mkdir(projectDir, { recursive: true });
  restoreCodexHome = overrideEnv(CODEX_HOME_VAR, codexHome);
});

afterEach(async () => {
  restoreCodexHome();
  await cleanupTempDir(tempDir);
});

async function holdsARole(dir: string): Promise<void> {
  await mkdir(path.join(dir, PROJECT_ROLES_DIR), { recursive: true });
  await writeFile(path.join(dir, PROJECT_ROLES_DIR, "pm.toml"), 'name = "pm"\n');
}

async function projectHoldsARole(): Promise<void> {
  await holdsARole(projectDir);
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

// At home, `<home>/.codex/agents` is Codex's global roles folder, which Codex reads without trust.
describe("what a compile says about Codex from the home folder", () => {
  const THEIR_OWN_CODEX_CONFIG = 'model_reasoning_effort = "high"\n';

  let home: string;
  let homeCodexConfig: string;
  let restoreEnv: RestoreEnv[] = [];

  beforeEach(async () => {
    home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });
    homeCodexConfig = path.join(home, CODEX_DIR, CODEX_CONFIG_TOML);
    restoreEnv = [
      overrideEnv("HOME", home),
      overrideEnv(CODEX_HOME_VAR, path.join(home, CODEX_DIR)),
    ];
  });

  afterEach(() => {
    for (const restore of restoreEnv) restore();
    restoreEnv = [];
  });

  async function theirCodexConfigIs(content: string): Promise<void> {
    await mkdir(path.dirname(homeCodexConfig), { recursive: true });
    await writeFile(homeCodexConfig, content);
  }

  it("says what Codex leaves out and nothing about trust, though the home folder holds the global roles", async () => {
    await holdsARole(home);

    expect(await codexCompileNotices("codex", home)).toStrictEqual(rosterNotices());
  });

  it("writes no Codex configuration where the user had none", async () => {
    await holdsARole(home);

    await codexCompileNotices("codex", home);

    expect(await fileExists(homeCodexConfig)).toBe(false);
  });

  it("leaves the user's own Codex configuration as they wrote it", async () => {
    await holdsARole(home);
    await theirCodexConfigIs(THEIR_OWN_CODEX_CONFIG);

    await codexCompileNotices("codex", home);

    expect(await readFile(homeCodexConfig, "utf-8")).toBe(THEIR_OWN_CODEX_CONFIG);
  });

  it("says nothing about trust where the user's configuration marks the home folder untrusted", async () => {
    await holdsARole(home);
    await theirCodexConfigIs(`[projects."${home}"]\ntrust_level = "untrusted"\n`);

    expect(await codexCompileNotices("codex", home)).toStrictEqual(rosterNotices());
  });

  it("says nothing about trust from the home folder reached through a symlink", async () => {
    const linkedHome = path.join(tempDir, "linked-home");
    await symlink(home, linkedHome);
    await holdsARole(home);

    expect(await codexCompileNotices("codex", linkedHome)).toStrictEqual(rosterNotices());
  });

  it("still trusts a project folder inside the home folder, and says so", async () => {
    const project = path.join(home, "project");
    await holdsARole(project);

    expect(await codexCompileNotices("codex", project)).toStrictEqual([
      ...rosterNotices(),
      `Trusted this project in your Codex configuration, so Codex reads its sub-agents: added [projects."${project}"] with trust_level = "trusted" to ${homeCodexConfig}.`,
    ]);
    expect(await readFile(homeCodexConfig, "utf-8")).toBe(
      `[projects."${project}"]\ntrust_level = "trusted"\n`,
    );
  });
});

describe("what a compile says, whichever host", () => {
  it("passes Codex's notices on for a Codex installation", async () => {
    expect(await hostCompileNotices("codex", projectDir)).toStrictEqual(rosterNotices());
  });
});
