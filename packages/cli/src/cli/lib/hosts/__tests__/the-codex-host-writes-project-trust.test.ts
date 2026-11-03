import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { overrideEnv, type RestoreEnv } from "../../__tests__/helpers/env-override.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import {
  codexProjectTrustMessage,
  codexProjectUntrustMessage,
  trustCodexProject,
  untrustCodexProject,
} from "../codex-project-trust.js";

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
let restoreCodexHome: RestoreEnv;

beforeEach(async () => {
  tempDir = await createTempDir();
  codexHome = path.join(tempDir, ".codex");
  projectDir = path.join(tempDir, "project");
  restoreCodexHome = overrideEnv(CODEX_HOME_VAR, codexHome);
});

afterEach(async () => {
  restoreCodexHome();
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

describe("trusting a project for Codex", () => {
  it("creates the config with the one entry when the user has none", async () => {
    const trust = await trustCodexProject(projectDir);

    expect(trust.kind).toBe("trusted now");
    expect(await theConfig()).toBe(`${trustedTable(projectDir)}\n`);
  });

  it("keeps every line the user's own config had, and adds the entry after them", async () => {
    await theirConfigIs(THE_USERS_OWN_CONFIG);

    await trustCodexProject(projectDir);

    expect(await theConfig()).toBe(
      `${THE_USERS_OWN_CONFIG.trimEnd()}\n\n${trustedTable(projectDir)}\n`,
    );
  });

  it("adds the key inside the user's own table for this project rather than a second table", async () => {
    await theirConfigIs(`[projects."${projectDir}"]\nsome_setting_of_theirs = true\n`);

    await trustCodexProject(projectDir);

    expect(await theConfig()).toBe(`${trustedTable(projectDir)}\nsome_setting_of_theirs = true\n`);
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

describe("reading the user's own spelling of an answer", () => {
  async function trustingWith(theirs: string) {
    await theirConfigIs(theirs);
    return { trust: await trustCodexProject(projectDir), written: await theConfig() };
  }

  function theirAnswerKept(level: string) {
    return {
      kind: "left as the user set it",
      configFile: path.join(codexHome, CODEX_CONFIG_TOML),
      level,
    };
  }

  it("reads an indented trust line under the project's table as trusted", async () => {
    const theirs = `[projects."${projectDir}"]\n  trust_level = "trusted"\n`;

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: { kind: "already trusted" },
      written: theirs,
    });
  });

  it("finds the project's table below the user's other top-level keys", async () => {
    const theirs = `model = "o3"\n${trustedTable(projectDir)}\n`;

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: { kind: "already trusted" },
      written: theirs,
    });
  });

  it("reads a trusted table that ends the file with no final newline", async () => {
    const theirs = trustedTable(projectDir);

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: { kind: "already trusted" },
      written: theirs,
    });
  });

  it("counts no trust_level outside the project's table as the project's", async () => {
    const theirs = 'trust_level = "trusted"\n\n[marketplaces.their-own]\nsource_type = "git"\n';

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: { kind: "trusted now", configFile: path.join(codexHome, CODEX_CONFIG_TOML) },
      written: `${theirs.trimEnd()}\n\n${trustedTable(projectDir)}\n`,
    });
  });

  it("reads the project's table only up to the next table", async () => {
    const theirs = [
      `[projects."${projectDir}"]`,
      "some_setting_of_theirs = true",
      trustedTable(path.join(tempDir, "elsewhere")),
      "",
    ].join("\n");

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: { kind: "trusted now", configFile: path.join(codexHome, CODEX_CONFIG_TOML) },
      written: [
        trustedTable(projectDir),
        "some_setting_of_theirs = true",
        trustedTable(path.join(tempDir, "elsewhere")),
        "",
      ].join("\n"),
    });
  });

  it("keeps an indented answer the user gave", async () => {
    const theirs = `[projects."${projectDir}"]\n  trust_level = "untrusted"\n`;

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: theirAnswerKept("untrusted"),
      written: theirs,
    });
  });

  it("keeps an answer the user gave below their other top-level keys", async () => {
    const theirs = `model = "o3"\n[projects."${projectDir}"]\ntrust_level = "untrusted"\n`;

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: theirAnswerKept("untrusted"),
      written: theirs,
    });
  });

  it("keeps an answer the user gave after the table's other settings", async () => {
    const theirs = `[projects."${projectDir}"]\nsome_setting_of_theirs = true\ntrust_level = "untrusted"\n`;

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: theirAnswerKept("untrusted"),
      written: theirs,
    });
  });

  it("keeps an answer the user gave as a dotted key", async () => {
    const theirs = `projects."${projectDir}".trust_level = "untrusted"\n`;

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: theirAnswerKept("untrusted"),
      written: theirs,
    });
  });

  it("reads a dotted answer only for the project's own path", async () => {
    const samePathLength = path.join(tempDir, "another");
    const theirs = `projects."${samePathLength}".trust_level = "untrusted"\n`;

    expect(await trustingWith(theirs)).toStrictEqual({
      trust: { kind: "trusted now", configFile: path.join(codexHome, CODEX_CONFIG_TOML) },
      written: `${theirs}\n${trustedTable(projectDir)}\n`,
    });
  });

  it("adds the key inside the user's indented table rather than a second table", async () => {
    const { written } = await trustingWith(
      `  [projects."${projectDir}"]\nsome_setting_of_theirs = true\n`,
    );

    expect(written).toBe(
      `  [projects."${projectDir}"]\ntrust_level = "trusted"\nsome_setting_of_theirs = true\n`,
    );
  });

  it("separates the entry from the user's own lines by one blank line", async () => {
    const { written } = await trustingWith(THE_USERS_OWN_CONFIG);

    expect(written).toBe(`${THE_USERS_OWN_CONFIG.trimEnd()}\n\n${trustedTable(projectDir)}\n`);
  });
});

describe("what the install says, word for word", () => {
  it("names the table, the line and the file it wrote", async () => {
    const said = codexProjectTrustMessage(projectDir, await trustCodexProject(projectDir));

    expect(said).toBe(
      `Trusted this project in your Codex configuration, so Codex reads its sub-agents: added [projects."${projectDir}"] with trust_level = "trusted" to ${path.join(codexHome, CODEX_CONFIG_TOML)}.`,
    );
  });

  it("names the user's own answer, where it is, and what would make Codex read the sub-agents", async () => {
    await theirConfigIs(`[projects."${projectDir}"]\ntrust_level = "untrusted"\n`);

    const said = codexProjectTrustMessage(projectDir, await trustCodexProject(projectDir));

    expect(said).toBe(
      `Codex reads this project's sub-agents only once it is trusted, and ${path.join(codexHome, CODEX_CONFIG_TOML)} sets trust_level = "untrusted" under [projects."${projectDir}"]. Left as you set it — change it to "trusted" for Codex to read them.`,
    );
  });
});

describe("taking the trust out on uninstall", () => {
  async function untrustingFrom(theirs: string) {
    await theirConfigIs(theirs);
    return { removal: await untrustCodexProject(projectDir), written: await theConfig() };
  }

  function trustRemoved() {
    return { kind: "trust removed", configFile: path.join(codexHome, CODEX_CONFIG_TOML) };
  }

  it("gives back the user's own config as it was before the install trusted the project", async () => {
    await theirConfigIs(THE_USERS_OWN_CONFIG);
    await trustCodexProject(projectDir);

    expect(await untrustCodexProject(projectDir)).toStrictEqual(trustRemoved());
    expect(await theConfig()).toBe(THE_USERS_OWN_CONFIG);
  });

  it("keeps the user's other settings under the project's table, and the table with them", async () => {
    expect(
      await untrustingFrom(
        `[projects."${projectDir}"]\ntrust_level = "trusted"\nsome_setting_of_theirs = true\n`,
      ),
    ).toStrictEqual({
      removal: trustRemoved(),
      written: `[projects."${projectDir}"]\nsome_setting_of_theirs = true\n`,
    });
  });

  it("keeps a blank line between what came before the table and the table after it", async () => {
    const before = 'model = "o3"\n\n';
    const after = '[marketplaces.their-own]\nsource_type = "git"\n';

    expect(await untrustingFrom(`${before}${trustedTable(projectDir)}\n\n${after}`)).toStrictEqual({
      removal: trustRemoved(),
      written: `${before}${after}`,
    });
  });

  it("leaves another project's trust where it is", async () => {
    const elsewhere = `${trustedTable(path.join(tempDir, "elsewhere"))}\n`;

    expect(await untrustingFrom(`${elsewhere}\n${trustedTable(projectDir)}\n`)).toStrictEqual({
      removal: trustRemoved(),
      written: elsewhere,
    });
  });

  it("takes out a trust line spelled with other spacing", async () => {
    expect(
      await untrustingFrom(`[projects."${projectDir}"]\n  trust_level="trusted"\n`),
    ).toStrictEqual({ removal: trustRemoved(), written: "" });
  });

  it("leaves the file in place, empty, when the trust was all it held", async () => {
    expect(await untrustingFrom(`${trustedTable(projectDir)}\n`)).toStrictEqual({
      removal: trustRemoved(),
      written: "",
    });
  });

  it("changes nothing where the user set another level", async () => {
    const theirs = `[projects."${projectDir}"]\ntrust_level = "untrusted"\n`;

    expect(await untrustingFrom(theirs)).toStrictEqual({
      removal: { kind: "not trusted" },
      written: theirs,
    });
  });

  it("writes no config where there was none", async () => {
    expect(await untrustCodexProject(projectDir)).toStrictEqual({ kind: "not trusted" });
    await expect(theConfig()).rejects.toThrow();
  });
});

describe("what the uninstall says, word for word", () => {
  it("names the line, the table and the file it took it out of", async () => {
    await theirConfigIs(`${trustedTable(projectDir)}\n`);

    const said = codexProjectUntrustMessage(projectDir, await untrustCodexProject(projectDir));

    expect(said).toBe(
      `Removed this project's trust from your Codex configuration: deleted trust_level = "trusted" under [projects."${projectDir}"] in ${path.join(codexHome, CODEX_CONFIG_TOML)}.`,
    );
  });

  it("says nothing when there was no trust to take out", async () => {
    expect(
      codexProjectUntrustMessage(projectDir, await untrustCodexProject(projectDir)),
    ).toBeUndefined();
  });
});
