import path from "path";
import { readdir, rm } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";

import { runCliCommand } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeRawTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import {
  cleanupTestSource,
  createTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
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
        `  Tip: There is no automatic repair — recreate the configuration by running ${recreateRemedy(process.cwd(), " --provider claude")} with an id from http://localhost:5173/editor\n`,
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
        `  Tip: There is no automatic repair — recreate the configuration by running ${recreateRemedy(process.cwd(), "")} with an id from http://localhost:5173/editor\n`,
      );
    });
  });

  describe("opening a shared id in the editor", () => {
    const SHARED_ID = "Shared1";

    beforeEach(async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "installation" }),
        CLAUDE_FOLDER,
      );
    });

    it("edit --ui --from names the choice of installation in the edit --from it hands out", async () => {
      const { stdout, error } = await runCliCommand(["edit", "--ui", "--from", SHARED_ID]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        `To apply it here instead, run 'npx agents-inc edit --from ${SHARED_ID} --provider <claude|codex>'.\n`,
      );
    });

    it("init --ui --from names the same choice", async () => {
      const { stdout, error } = await runCliCommand(["init", "--ui", "--from", SHARED_ID]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        `To apply it here instead, run 'npx agents-inc edit --from ${SHARED_ID} --provider <claude|codex>'.\n`,
      );
    });

    it("init --ui names the choice in the edit --from <id> it hands out", async () => {
      const { stdout, error } = await runCliCommand(["init", "--ui"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        "Then apply what it gives you with 'npx agents-inc edit --from <id> --provider <claude|codex>'.\n",
      );
    });

    it("control: beside no other installation, edit --ui --from hands out the bare edit --from", async () => {
      await rm(path.join(projectDir, CODEX_FOLDER), { recursive: true });

      const { stdout } = await runCliCommand(["edit", "--ui", "--from", SHARED_ID]);

      expect(stdout).toContain(
        `To apply it here instead, run 'npx agents-inc edit --from ${SHARED_ID}'.\n`,
      );
    });
    it("edit --ui --from echoes the installation the run named, and offers no choice", async () => {
      const { stdout } = await runCliCommand([
        "edit",
        "--ui",
        "--from",
        SHARED_ID,
        "--provider",
        "codex",
      ]);

      expect(stdout).toContain(
        `To apply it here instead, run 'npx agents-inc edit --from ${SHARED_ID} --provider codex'.\n`,
      );
      expect(stdout).not.toContain("<claude|codex>");
    });
  });

  describe("applying a shared configuration", () => {
    const SHARED_ID = "Shared1";
    useMockWorker();

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
      const dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      try {
        await writeTestTsConfig(
          projectDir,
          buildProjectConfig({
            name: "installation",
            marketplace: dirs.sourceDir,
            skills: buildSkillConfigs([testMarketplaceSkillId("web-testing-vitest")], {
              scope: "global",
              origin: "eject",
            }),
            agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
          }),
          CLAUDE_FOLDER,
        );
        configMockServer.use(
          storedConfigHandlerFor(
            SHARED_ID,
            buildSeedPayload({
              marketplace: dirs.sourceDir,
              skills: {
                [testMarketplaceSkillId("api-framework-hono")]: buildSeedSkill({
                  install: "eject",
                  scope: "global",
                  assignments: { "api-developer": "lazy" },
                }),
              },
              agents: { "api-developer": { scope: "global" } },
            }),
          ),
        );

        const { error } = await runCliCommand([
          "edit",
          "--from",
          SHARED_ID,
          "--provider",
          "claude",
        ]);

        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(error?.message).toContain(
          `Run 'npx agents-inc edit --from ${SHARED_ID} --provider claude' from a terminal, or 'npx agents-inc init --from ${SHARED_ID} --provider claude' in a clean directory`,
        );
      } finally {
        await cleanupTestSource(dirs);
      }
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
