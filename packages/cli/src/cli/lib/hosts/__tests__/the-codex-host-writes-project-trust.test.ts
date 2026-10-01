import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { codexProjectTrustMessage, trustCodexProject } from "../codex-project-trust.js";

/**
 * A Codex project install trusts the project in the user's GLOBAL config, and says what it wrote.
 *
 * Owner, 2026-09-26: _"it should be automated on install"_ (CLI-893). A role under
 * `<project>/.codex/agents/` reaches the model only while `$CODEX_HOME/config.toml` holds
 * `[projects."<exact absolute path>"] trust_level = "trusted"`, and every way that is missing or
 * wrong is silent — so a project install Codex never reads looked exactly like one that worked.
 *
 * The file is the user's: every line of theirs is asserted to survive, and an answer they already
 * gave (`"untrusted"`) is never overwritten. A duplicate `[projects."<dir>"]` table is a file Codex
 * refuses to load at all, so the table is asserted to occur once; that Codex then READS the entry
 * is `e2e/lifecycle/codex-agent-roles-are-read-by-codex.e2e.test.ts`'s, against the pinned binary.
 */

/** Codex's own global configuration file, under `$CODEX_HOME`. A third party's filename. */
const CODEX_CONFIG_TOML = "config.toml";

/** The variable Codex (and this CLI) reads its home from. */
const CODEX_HOME_VAR = "CODEX_HOME";

/** A Codex user's own configuration, already in place: a marketplace, a plugin, another project. */
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

/** The table this project's trust lives in, header and key, as the install writes them. */
function trustedTable(dir: string): string {
  return `[projects."${dir}"]\ntrust_level = "trusted"`;
}

/** How many tables the file opens for `dir` — more than one is a file Codex refuses. */
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
    // One table, not two: a duplicate header is Codex refusing the whole file.
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
