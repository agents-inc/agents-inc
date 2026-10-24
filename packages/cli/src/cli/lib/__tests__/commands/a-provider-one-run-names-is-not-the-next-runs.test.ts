import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildProjectConfig } from "../factories/config-factories.js";

/**
 * CLI-968: `--provider` is committed for the run that names it, and no later one. Through `dist/`,
 * where oclif loads every command and the `init` hook, one module holds that choice for the
 * process, so the run after a `--provider codex` run is where a choice outliving its run shows: in
 * what the command reads, and in the old-folder line the hook prints before the command starts. The
 * run naming codex goes first in each row, so neither row needs a place in the file or a retry
 * setting: every attempt names codex before the run under test reads.
 */

/** Literals, as the product writes them: read off the product, they would move with it. */
const OLD_SOURCE_FOLDER = ".claude-src";
const CLAUDE_FOLDER = ".agents-inc/claude";
const CODEX_FOLDER = ".agents-inc/codex";

/** How the line names the home directory; a project is named by its absolute path. */
const HOME_SHORTHAND = "~";

const NO_INSTALLATION = "No installation found.\nRun 'npx agents-inc init' to create one.\n";

/** One root's line, written out whole, as `old-claude-src-folder.test.ts` writes it. */
function ignoredLine(root: string, readFrom: typeof CLAUDE_FOLDER | typeof CODEX_FOLDER): string {
  return `${root}/.claude-src/ is ignored; agents-inc reads ${root}/${readFrom}/. Delete the old folder once you have kept anything you need from it.\n`;
}

async function installClaudeIn(roots: readonly string[]): Promise<void> {
  await Promise.all(
    roots.map((root) =>
      writeTestTsConfig(root, buildProjectConfig({ name: "installation" }), CLAUDE_FOLDER),
    ),
  );
}

async function listNamingCodexThenNone() {
  const namingCodex = await runCliCommand(["list", "--provider", "codex"]);
  const namingNone = await runCliCommand(["list"]);
  return { namingCodex, namingNone };
}

describe("a run after one that named --provider", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-provider-one-run-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  it("reads the Claude installation on disk, after a list that named codex", async () => {
    await installClaudeIn([projectDir]);

    const { namingCodex, namingNone } = await listNamingCodexThenNone();

    expect(namingCodex.error).toBeUndefined();
    expect(
      namingCodex.stdout,
      "subject guard: the run naming codex read Codex's folder, which holds no installation",
    ).toBe(NO_INSTALLATION);
    expect(namingNone.error).toBeUndefined();
    expect(namingNone.stdout, "the run naming none read the Claude installation on disk").toContain(
      `  Config:  ${path.join(projectDir, CLAUDE_FOLDER, "config.ts")}\n`,
    );
  });

  it("names in each root's old-folder line the Claude folder on disk there, HOME's first, after a list that named codex", async () => {
    await installClaudeIn([projectDir, fakeHome]);
    await Promise.all(
      [projectDir, fakeHome].map((root) => mkdir(path.join(root, OLD_SOURCE_FOLDER))),
    );

    const { namingCodex, namingNone } = await listNamingCodexThenNone();

    expect(namingCodex.error).toBeUndefined();
    expect(
      namingCodex.stderr,
      "subject guard: the run naming codex named Codex's folder in each root, HOME's first",
    ).toBe(
      [ignoredLine(HOME_SHORTHAND, CODEX_FOLDER), ignoredLine(projectDir, CODEX_FOLDER)].join(""),
    );
    expect(namingNone.error).toBeUndefined();
    expect(
      namingNone.stderr,
      "the run naming none names, in each root, the Claude folder on disk there, HOME's line first",
    ).toBe(
      [ignoredLine(HOME_SHORTHAND, CLAUDE_FOLDER), ignoredLine(projectDir, CLAUDE_FOLDER)].join(""),
    );
  });
});
