import { chmod, mkdir, writeFile } from "fs/promises";
import path from "path";
import { captureOutput } from "@oclif/test";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { compactCliOutput } from "../helpers/flatten-cli-output.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { EXIT_CODES } from "../../exit-codes";
import { CODEX_HOME_VAR } from "../../installation/install-layout.js";
import {
  type FakeChildReply,
  fakeChildProcess,
} from "../../hosts/__tests__/helpers/fake-child-process.js";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});

const { spawn } = await import("child_process");
const { default: Init } = await import("../../../commands/init.js");

const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");

/** Written out: a test building the reference with the product's own helper would move with it. */
const HONO_PLUGIN = `${HONO}@${TEST_MARKETPLACE_NAME}`;

/** Literals: a test reading the folders off the product would move with them. */
const CODEX_FOLDER = ".agents-inc/codex";
const CODEX_STATE = ".codex";

const SAVE_REFUSED = "EACCES: permission denied, open";

const KEPT_THE_PLUGIN = `Kept the plugin "${HONO_PLUGIN}" it installed, since it could not tell whether the plugin was there before this run`;

/** What Codex 0.155.1 says on both listing verbs once any marketplace it records is unreadable. */
const UNREADABLE_MARKETPLACE =
  "Error: failed to load configured marketplace snapshot(s):\n- `other` at /gone/other: marketplace root does not contain a supported manifest";

const READ_ONLY_DIR = 0o555;
const WRITABLE_DIR = 0o755;

const SEED_ID = "KeepsCdx";

type FakeCodex = {
  sourceDir: string;
  marketplaceRegistered: boolean;
  held: string[];
  /** Both listing verbs fail until a plugin is added, as when the run itself mends the snapshot. */
  unreadableUntilAnAdd: boolean;
  calls: string[];
};

function marketplaceListing(codex: FakeCodex): string {
  const registered = {
    name: TEST_MARKETPLACE_NAME,
    marketplaceSource: { sourceType: "local", source: codex.sourceDir },
  };
  return JSON.stringify({ marketplaces: codex.marketplaceRegistered ? [registered] : [] });
}

function pluginListing(codex: FakeCodex): string {
  return JSON.stringify({
    installed: codex.held.map((pluginId) => ({
      pluginId,
      name: HONO,
      marketplaceName: TEST_MARKETPLACE_NAME,
      version: "1.0.0",
      enabled: true,
    })),
    available: [],
  });
}

function listing(codex: FakeCodex, listed: string): FakeChildReply {
  return codex.unreadableUntilAnAdd
    ? { exitCode: 1, stderr: UNREADABLE_MARKETPLACE }
    : { stdout: listed };
}

function codexAnswers(codex: FakeCodex, args: readonly string[]): FakeChildReply {
  codex.calls.push(args.join(" "));
  const [verb, noun, action] = args;
  if (verb === "--version") return { stdout: "codex-cli 0.155.1\n" };
  if (verb === "plugin" && noun === "marketplace") {
    if (action === "list") return listing(codex, marketplaceListing(codex));
    if (action === "add" || action === "remove") {
      codex.marketplaceRegistered = action === "add";
      return { stdout: "{}" };
    }
  }
  if (verb === "plugin" && noun === "list") return listing(codex, pluginListing(codex));
  if (verb === "plugin" && noun === "add" && action !== undefined) {
    if (!codex.held.includes(action)) codex.held.push(action);
    codex.unreadableUntilAnAdd = false;
    return { stdout: "{}" };
  }
  if (verb === "plugin" && noun === "remove" && action !== undefined) {
    codex.held = codex.held.filter((pluginId) => pluginId !== action);
    return { stdout: "{}" };
  }
  return { exitCode: 1, stderr: `unexpected codex ${args.join(" ")}` };
}

// Root writes through the mode bits, so a refused save cannot happen there.
describe.skipIf(process.getuid?.() === 0)(
  "init --from on Codex: a refused save and the plugin it installed",
  () => {
    useMockWorker();
    let projectDir: string;
    let fakeHome: string;
    let cleanup: () => Promise<void>;
    let dirs: TestDirs;
    let codex: FakeCodex;
    let configFolder: string;

    beforeEach(async () => {
      ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-codex-kept-plugin-"));
      dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      const codexHome = path.join(fakeHome, CODEX_STATE);
      await mkdir(codexHome, { recursive: true });
      await writeFile(path.join(codexHome, "config.toml"), "");
      vi.stubEnv(CODEX_HOME_VAR, codexHome);
      codex = {
        sourceDir: dirs.sourceDir,
        marketplaceRegistered: false,
        held: [],
        unreadableUntilAnAdd: false,
        calls: [],
      };
      vi.mocked(spawn).mockImplementation((_command, args) =>
        fakeChildProcess(codexAnswers(codex, args)),
      );
      configMockServer.use(
        storedConfigHandlerFor(
          SEED_ID,
          buildSeedPayload({
            marketplace: dirs.sourceDir,
            skills: {
              [REACT]: buildSeedSkill({
                install: "eject",
                scope: "project",
                assignments: { "web-developer": "lazy" },
              }),
              [HONO]: buildSeedSkill({
                install: "plugin",
                scope: "global",
                assignments: { "api-developer": "lazy" },
              }),
            },
            agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
          }),
        ),
      );
      configFolder = path.join(projectDir, CODEX_FOLDER);
      await mkdir(configFolder, { recursive: true });
      await chmod(configFolder, READ_ONLY_DIR);
    });

    afterEach(async () => {
      await chmod(configFolder, WRITABLE_DIR);
      vi.unstubAllEnvs();
      await cleanupTestSource(dirs);
      await cleanup();
    });

    async function refusedInitFrom() {
      const run = await captureOutput(
        () =>
          Init.run(["--from", SEED_ID, "--marketplace", dirs.sourceDir, "--provider", "codex"], {
            root: CLI_ROOT,
          }),
        { print: false },
      );
      expect(run.error?.oclif?.exit, run.stdout + run.stderr).toBe(EXIT_CODES.ERROR);
      expect(
        compactCliOutput(`${run.stdout}\n${run.stderr}`),
        "precondition: the save is what was refused",
      ).toContain(compactCliOutput(`${SAVE_REFUSED} '${path.join(configFolder, "config.ts")}'`));
      expect(codex.calls, "precondition: the run installed the plugin").toContain(
        `plugin add ${HONO_PLUGIN} --json`,
      );
      return run;
    }

    const removals = () => codex.calls.filter((call) => call.startsWith("plugin remove "));

    it("keeps the plugin it installed, and says so, when Codex could not list its plugins before the run though it can by the take-back", async () => {
      codex.marketplaceRegistered = true;
      codex.held = [HONO_PLUGIN];
      codex.unreadableUntilAnAdd = true;

      const { stdout } = await refusedInitFrom();

      expect(
        removals(),
        "a plugin the run cannot tell was new may be the user's, so it is never uninstalled",
      ).toStrictEqual([]);
      expect(codex.held, "Codex still holds the plugin").toStrictEqual([HONO_PLUGIN]);
      expect(compactCliOutput(stdout)).toContain(compactCliOutput(KEPT_THE_PLUGIN));
    });

    it("keeps a plugin Codex listed before the run, and says nothing of keeping it", async () => {
      codex.marketplaceRegistered = true;
      codex.held = [HONO_PLUGIN];

      const { stdout } = await refusedInitFrom();

      expect(removals(), "a plugin held before the run is not this run's").toStrictEqual([]);
      expect(compactCliOutput(stdout)).not.toContain(compactCliOutput(KEPT_THE_PLUGIN));
    });

    it("uninstalls the plugin it installed, and says nothing of keeping it, when Codex listed it absent before the run", async () => {
      const { stdout } = await refusedInitFrom();

      expect(removals(), "a plugin this run newly installed is taken back").toStrictEqual([
        `plugin remove ${HONO_PLUGIN} --json`,
      ]);
      expect(codex.held).toStrictEqual([]);
      expect(compactCliOutput(stdout)).not.toContain(compactCliOutput(KEPT_THE_PLUGIN));
    });
  },
);
