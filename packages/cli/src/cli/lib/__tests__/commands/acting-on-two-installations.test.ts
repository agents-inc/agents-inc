import path from "path";
import { readdir, rm } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { EXIT_CODES } from "../../exit-codes";

/** Literals: a test reading the folders off the product would move with them. */
const CLAUDE_FOLDER = ".agents-inc/claude";
const CODEX_FOLDER = ".agents-inc/codex";

/** The refusal word for word, naming the command that refused. */
function refusalFor(command: string, scopeRoot: string): string {
  return (
    `${scopeRoot} holds 2 installations — claude and codex — so ${command} cannot tell which ` +
    `one you mean. Name it with --provider <claude|codex>. Nothing has been changed.`
  );
}

/**
 * A project holding both providers' installations: every command that acts on one refuses before
 * it reads or writes anything, names itself in the refusal, and exits as a usage error.
 */
describe("a command acting on a project that holds two installations", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-two-installations-test-"));
    for (const folder of [CLAUDE_FOLDER, CODEX_FOLDER]) {
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "installation" }), folder);
    }
  });

  afterEach(async () => {
    await cleanup();
  });

  it.each([
    ["update", ["update"]],
    ["share", ["share"]],
    ["compile", ["compile"]],
    ["eject", ["eject", "skills"]],
    ["edit", ["edit"]],
    ["uninstall", ["uninstall", "--yes"]],
  ])("%s refuses by name and leaves the project as it was", async (command, argv) => {
    const before = await readdir(projectDir, { recursive: true });

    const { error } = await runCliCommand(argv);

    expect(error?.message).toBe(refusalFor(command, process.cwd()));
    expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    expect(await readdir(projectDir, { recursive: true })).toStrictEqual(before);
  });

  it("acts on a project holding one installation", async () => {
    await rm(path.join(projectDir, CODEX_FOLDER), { recursive: true });

    const { stdout, error } = await runCliCommand(["update"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain("No plugin marketplaces are configured — nothing to refresh.");
  });
});
