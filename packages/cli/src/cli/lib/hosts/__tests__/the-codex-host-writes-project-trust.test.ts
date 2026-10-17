import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { codexProjectTrustMessage, trustCodexProject } from "../codex-project-trust.js";

// Codex reads project roles only while its global `config.toml` trusts the exact path. The file is
// the user's: their lines survive and an answer they gave is never overwritten.

const CODEX_CONFIG_TOML = "config.toml";

const CODEX_HOME_VAR = "CODEX_HOME";

const THE_USERS_OWN_CONFIG = [
  "[marketplaces.their-own]",
  'source_type = "git"',
  'source = "https://example.invalid/their-own.git"',
  "",
  '[projects."/home/them/work"]',
  'trust_level = "trusted"',
  "",
].join("\n");

let tempDir: string;
let codexHome: string;
let projectDir: string;
let originalCodexHome: string | undefined;

beforeEach(async () => {
  tempDir = await createTempDir();
  codexHome = path.join(tempDir, ".codex");
  projectDir = path.join(tempDir, "project");
  originalCodexHome = process.env[CODEX_HOME_VAR];
  process.env[CODEX_HOME_VAR] = codexHome;
});

afterEach(async () => {
  if (originalCodexHome === undefined) delete process.env[CODEX_HOME_VAR];
  else process.env[CODEX_HOME_VAR] = originalCodexHome;
  await cleanupTempDir(tempDir);
});

async function theirConfigIs(content: string): Promise<void> {
  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, CODEX_CONFIG_TOML), content, "utf-8");
}

function theConfig(): Promise<string> {
  return readFile(path.join(codexHome, CODEX_CONFIG_TOML), "utf-8");
}

function trustedTable(dir: string): string {
  return `[projects."${dir}"]\ntrust_level = "trusted"`;
}

/** More than one table for a path is a file Codex refuses to load. */
function tablesFor(config: string, dir: string): number {
  return config.split(`[projects."${dir}"]`).length - 1;
}

describe("trusting a project for Codex", () => {
  it("creates the config with the one entry when the user has none", async () => {
    const trust = await trustCodexProject(projectDir);

    expect(trust.kind).toBe("trusted now");
    expect(await theConfig()).toBe(`${trustedTable(projectDir)}\n`);
  });

  it("keeps every line the user's own config had, and adds the entry after them", async () => {
    await theirConfigIs(THE_USERS_OWN_CONFIG);

    await trustCodexProject(projectDir);

    const written = await theConfig();
    expect(written.startsWith(THE_USERS_OWN_CONFIG.trimEnd())).toBe(true);
    expect(written).toContain(trustedTable(projectDir));
    expect(tablesFor(written, projectDir)).toBe(1);
  });

  it("adds the key inside the user's own table for this project rather than a second table", async () => {
    await theirConfigIs(`[projects."${projectDir}"]\nsome_setting_of_theirs = true\n`);

    await trustCodexProject(projectDir);

    const written = await theConfig();
    expect(tablesFor(written, projectDir)).toBe(1);
    expect(written).toContain(trustedTable(projectDir));
    expect(written).toContain("some_setting_of_theirs = true");
  });

  it("writes the path with no trailing separator, the one spelling Codex matches", async () => {
    await trustCodexProject(`${projectDir}${path.sep}`);

    expect(await theConfig()).toContain(trustedTable(projectDir));
    expect(await theConfig()).not.toContain(`${projectDir}${path.sep}"`);
  });

  it("changes nothing for a project already trusted, in either spelling", async () => {
    for (const trusted of [
      `[projects."${projectDir}"]\ntrust_level = "trusted"\n`,
      `projects."${projectDir}".trust_level = "trusted"\n`,
    ]) {
      await theirConfigIs(trusted);

      expect((await trustCodexProject(projectDir)).kind).toBe("already trusted");
      expect(await theConfig()).toBe(trusted);
    }
  });

  it("never overrides an answer the user gave, and reports it", async () => {
    const theirAnswer = `[projects."${projectDir}"]\ntrust_level = "untrusted"\n`;
    await theirConfigIs(theirAnswer);

    const trust = await trustCodexProject(projectDir);

    expect(trust).toStrictEqual({
      kind: "left as the user set it",
      configFile: path.join(codexHome, CODEX_CONFIG_TOML),
      level: "untrusted",
    });
    expect(await theConfig()).toBe(theirAnswer);
  });
});

describe("what the install says about it", () => {
  it("names the project, the file and the line it wrote", async () => {
    const said = codexProjectTrustMessage(projectDir, await trustCodexProject(projectDir));

    expect(said).toContain(`[projects."${projectDir}"]`);
    expect(said).toContain('trust_level = "trusted"');
    expect(said).toContain(path.join(codexHome, CODEX_CONFIG_TOML));
  });

  it("says the user's own answer was left, and how to change it", async () => {
    await theirConfigIs(`[projects."${projectDir}"]\ntrust_level = "untrusted"\n`);

    const said = codexProjectTrustMessage(projectDir, await trustCodexProject(projectDir));

    expect(said).toContain('trust_level = "untrusted"');
    expect(said).toContain("Left as you set it");
  });

  it("says nothing once the project is trusted, so it is a state rather than a banner", async () => {
    await theirConfigIs(`[projects."${projectDir}"]\ntrust_level = "trusted"\n`);

    expect(
      codexProjectTrustMessage(projectDir, await trustCodexProject(projectDir)),
    ).toBeUndefined();
  });
});
