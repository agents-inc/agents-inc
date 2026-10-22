import path from "path";
import { readdir, rm } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeRawTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import { EXIT_CODES } from "../../exit-codes";

/** Literals: a test reading the folders off the product would move with them. */
const CLAUDE_FOLDER = ".agents-inc/claude";
const CODEX_FOLDER = ".agents-inc/codex";

/** The two commands of the recreate remedy, each as the spec expects it handed out. */
function recreateRemedy(scopeRoot: string, providerArgument: string): string {
  return `'npx agents-inc uninstall${providerArgument}' from '${scopeRoot}', which still works on a config it cannot read, then 'npx agents-inc init --from <id>${providerArgument}'`;
}

/**
 * Where a scope holds two installations, a bare acting command refuses until told which, so a
 * remedy handed out there names the installation; beside none it stays bare. Each refusal sits
 * beside the run it must still allow.
 */
describe("a remedy handed out over a project holding two installations", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-remedy-beside-another-test-"));
    await writeTestTsConfig(projectDir, buildProjectConfig({ name: "installation" }), CODEX_FOLDER);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("recreating a config that will not load", () => {
    beforeEach(async () => {
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs(), CLAUDE_FOLDER);
    });

    it("doctor names the installation in both commands of its tip", async () => {
      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(
        `  Tip: There is no automatic repair — recreate the configuration by running ${recreateRemedy(process.cwd(), " --provider claude")} with an id from https://agentsinc.sh/editor\n`,
      );
    });

    it("a command refusing the config names the installation in both commands", async () => {
      const { error } = await runCliCommand(["compile", "--provider", "claude"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(recreateRemedy(process.cwd(), " --provider claude"));
    });

    it("the uninstall it names removes that installation and leaves the other", async () => {
      const { error } = await runCliCommand(["uninstall", "--yes", "--provider", "claude"]);

      expect(error).toBeUndefined();
      expect(await readdir(path.join(projectDir, ".agents-inc"))).toStrictEqual(["codex"]);
    });

    it("control: beside no other installation, doctor's tip stays bare", async () => {
      await rm(path.join(projectDir, CODEX_FOLDER), { recursive: true });

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        `  Tip: There is no automatic repair — recreate the configuration by running ${recreateRemedy(process.cwd(), "")} with an id from https://agentsinc.sh/editor\n`,
      );
    });
  });

  describe("applying a shared configuration", () => {
    const SHARED_ID = "Shared1";

    beforeEach(async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "installation" }),
        CLAUDE_FOLDER,
      );
    });

    it("init --from refuses over the installation the run named, naming it in both commands", async () => {
      const { error } = await runCliCommand(["init", "--from", SHARED_ID, "--provider", "claude"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(
        `Run 'npx agents-inc uninstall --provider claude' first — installing a shared configuration is a fresh setup, not a merge. To apply it here instead, run 'npx agents-inc edit --from ${SHARED_ID} --provider claude'.`,
      );
    });

    it("control: beside no other installation, init --from's refusal hands out the bare commands", async () => {
      await rm(path.join(projectDir, CODEX_FOLDER), { recursive: true });

      const { error } = await runCliCommand(["init", "--from", SHARED_ID]);

      expect(error?.message).toContain(
        `Run 'npx agents-inc uninstall' first — installing a shared configuration is a fresh setup, not a merge. To apply it here instead, run 'npx agents-inc edit --from ${SHARED_ID}'.`,
      );
    });

    it("edit --from with no terminal names the installation the run named in both commands", async () => {
      const { error } = await runCliCommand(["edit", "--from", SHARED_ID, "--provider", "claude"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(
        `Run 'npx agents-inc edit --from ${SHARED_ID} --provider claude' from a terminal, or 'npx agents-inc init --from ${SHARED_ID} --provider claude' in a clean directory`,
      );
    });

    it("edit --from with nothing installed sends the run to install the installation it named", async () => {
      await rm(path.join(projectDir, ".agents-inc"), { recursive: true });

      const { error } = await runCliCommand(["edit", "--from", SHARED_ID, "--provider", "codex"]);

      expect(error?.message).toBe(
        `No installation found. Run 'npx agents-inc init --from ${SHARED_ID} --provider codex' to install configuration '${SHARED_ID}' here.`,
      );
    });
  });

  describe("uninstalling with no terminal to confirm at", () => {
    beforeEach(async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "installation" }),
        CLAUDE_FOLDER,
      );
    });

    it("names the installation the run named in both commands, and removes nothing", async () => {
      const before = await readdir(projectDir, { recursive: true });

      const { error } = await runCliCommand(["uninstall", "--provider", "claude"]);

      expect(error?.message).toBe(
        "Uninstalling removes files, so it has to be confirmed — and there is no terminal here to confirm it at.\nRun 'npx agents-inc uninstall --provider claude' from a terminal, or 'npx agents-inc uninstall --yes --provider claude' to remove it without being asked.",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(await readdir(projectDir, { recursive: true })).toStrictEqual(before);
    });

    it("control: a run that named none, beside no other installation, hands out the bare commands", async () => {
      await rm(path.join(projectDir, CODEX_FOLDER), { recursive: true });

      const { error } = await runCliCommand(["uninstall"]);

      expect(error?.message).toBe(
        "Uninstalling removes files, so it has to be confirmed — and there is no terminal here to confirm it at.\nRun 'npx agents-inc uninstall' from a terminal, or 'npx agents-inc uninstall --yes' to remove it without being asked.",
      );
    });
  });
});
