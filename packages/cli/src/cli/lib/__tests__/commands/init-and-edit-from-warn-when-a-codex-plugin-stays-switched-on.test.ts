import { chmodSync, readFileSync, writeFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import ansis from "ansis";
import { Errors } from "@oclif/core";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { workOwedEntry } from "../helpers/work-owed-entry.js";
import { readTestTsConfig } from "../helpers/config-io.js";
import type { FixtureProjectConfig } from "../helpers/skill-config-builders.js";
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
import { fileExists } from "../test-fs-utils";
import { delay, KEY_Y } from "../test-constants";
import { EXIT_CODES } from "../../exit-codes";
import { CODEX_HOME_VAR } from "../../installation/install-layout.js";
import {
  type FakeChildReply,
  fakeChildProcess,
} from "../../hosts/__tests__/helpers/fake-child-process.js";

/**
 * A config.toml that cannot be written is only stageable here, as the real Codex replaces it on
 * every add.
 */

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});

const { spawn } = await import("child_process");
const { default: Init } = await import("../../../commands/init.js");
const { default: Edit } = await import("../../../commands/edit.js");

const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");
const VITEST = testMarketplaceSkillId("web-testing-vitest");
const ZUSTAND = testMarketplaceSkillId("web-state-zustand");

/** Written out: a test building the reference with the product's own helper would move with it. */
const SWITCHED_OFF_PLUGIN = `${REACT}@${TEST_MARKETPLACE_NAME}`;
const ALSO_SWITCHED_OFF_PLUGIN = `${ZUSTAND}@${TEST_MARKETPLACE_NAME}`;
const SWITCHED_ON_PLUGIN = `${HONO}@${TEST_MARKETPLACE_NAME}`;
const PLUGIN_THE_RUN_ADDS = `${VITEST}@${TEST_MARKETPLACE_NAME}`;

/** Literals: a test reading the folders off the product would move with them. */
const CODEX_FOLDER = ".agents-inc/codex";
const CODEX_STATE = ".codex";

const CONTINUING_WITH_CACHED = "Could not update marketplace — continuing with cached version";

/** What Codex says when a marketplace's new version dropped a plugin it is asked to add. */
const ADD_REFUSAL = "plugin source path is not a directory";

const READ_ONLY_FILE = 0o444;
const WRITABLE_FILE = 0o644;

const PROMPT_READY_MS = 600;

const INSTALL_ID = "Installed";
const SEED_ID = "Next";

type Spelling = "double" | "single";

function switchTable(pluginRef: string, enabled: boolean, spelling: Spelling = "double"): string {
  const header = spelling === "double" ? `[plugins."${pluginRef}"]` : `[plugins.'${pluginRef}']`;
  return `${header}\nenabled = ${String(enabled)}\n`;
}

type FakeCodex = {
  configDir: string;
  sourceDir: string;
  held: string[];
  /** The folder stays writable: `init` still creates the sub-agent folder beside it. */
  locksTheConfigAfterEachAdd: boolean;
  refusesToAdd: string | undefined;
  added: string[];
};

type CodexBehaviour = Pick<FakeCodex, "locksTheConfigAfterEachAdd" | "refusesToAdd">;

function configFileOf(codex: FakeCodex): string {
  return path.join(codex.configDir, "config.toml");
}

function marketplaceListing(codex: FakeCodex): string {
  return JSON.stringify({
    marketplaces: [
      {
        name: TEST_MARKETPLACE_NAME,
        marketplaceSource: { sourceType: "local", source: codex.sourceDir },
      },
    ],
  });
}

/** Codex reads each switch out of config.toml, so the listing answers whatever the file holds. */
function pluginListing(codex: FakeCodex): string {
  const config = readFileSync(configFileOf(codex), "utf-8");
  const switchedOff = (pluginId: string) =>
    config.includes(switchTable(pluginId, false)) ||
    config.includes(switchTable(pluginId, false, "single"));
  return JSON.stringify({
    installed: codex.held.map((pluginId) => ({
      pluginId,
      name: pluginId.split("@")[0],
      marketplaceName: TEST_MARKETPLACE_NAME,
      version: "2.0.0",
      enabled: !switchedOff(pluginId),
    })),
    available: [],
  });
}

function codexAdds(codex: FakeCodex, pluginRef: string): void {
  const configFile = configFileOf(codex);
  chmodSync(configFile, WRITABLE_FILE);
  const config = readFileSync(configFile, "utf-8");
  const switchedOn = codex.held.includes(pluginRef)
    ? config
        .replace(switchTable(pluginRef, false), switchTable(pluginRef, true))
        .replace(switchTable(pluginRef, false, "single"), switchTable(pluginRef, true, "single"))
    : `${config}\n${switchTable(pluginRef, true)}`;
  writeFileSync(configFile, switchedOn);
  if (!codex.held.includes(pluginRef)) codex.held.push(pluginRef);
  codex.added.push(pluginRef);
  if (codex.locksTheConfigAfterEachAdd) chmodSync(configFile, READ_ONLY_FILE);
}

function codexAnswers(codex: FakeCodex, args: readonly string[]): FakeChildReply {
  const [verb, noun, action] = args;
  if (verb === "--version") return { stdout: "codex-cli 0.155.1\n" };
  if (verb !== "plugin") return { exitCode: 1, stderr: `unexpected codex ${args.join(" ")}` };
  if (noun === "marketplace" && action === "list") return { stdout: marketplaceListing(codex) };
  if (noun === "list") return { stdout: pluginListing(codex) };
  if (noun === "add" && action === codex.refusesToAdd) {
    return { exitCode: 1, stderr: `Error: ${ADD_REFUSAL}` };
  }
  if (noun === "add" && action !== undefined) {
    codexAdds(codex, action);
    return { stdout: "{}" };
  }
  return { exitCode: 1, stderr: `unexpected codex ${args.join(" ")}` };
}

/** Codex installs plugins only per machine, so every plugin here is global. */
const globalPlugin = () =>
  buildSeedSkill({ install: "plugin", scope: "global", assignments: { "web-developer": "lazy" } });

describe.skipIf(process.getuid?.() === 0)(
  "init --from and edit --from over a Codex plugin the user switched off",
  () => {
    useMockWorker();
    const terminal = standAtTerminal();
    let fakeHome: string;
    let cleanup: () => Promise<void>;
    let dirs: TestDirs;
    let codex: FakeCodex;

    beforeEach(async () => {
      ({ fakeHome, cleanup } = await setupIsolatedHome("cc-from-codex-switch-"));
      dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      const configDir = path.join(fakeHome, CODEX_STATE);
      await mkdir(configDir, { recursive: true });
      vi.stubEnv(CODEX_HOME_VAR, configDir);
      codex = {
        configDir,
        sourceDir: dirs.sourceDir,
        held: [],
        locksTheConfigAfterEachAdd: false,
        refusesToAdd: undefined,
        added: [],
      };
      await writeFile(configFileOf(codex), "");
      vi.mocked(spawn).mockImplementation((_command, args) =>
        fakeChildProcess(codexAnswers(codex, args)),
      );
    });

    afterEach(async () => {
      chmodSync(configFileOf(codex), WRITABLE_FILE);
      vi.unstubAllEnvs();
      await cleanupTestSource(dirs);
      await cleanup();
    });

    function serve(id: string, payload: SeedPayload): void {
      configMockServer.use(storedConfigHandlerFor(id, payload));
    }

    async function codexHoldsTheMarketplace(
      spelling: Spelling,
      switchedOff: readonly string[] = [SWITCHED_OFF_PLUGIN],
    ): Promise<void> {
      codex.held = [...switchedOff, SWITCHED_ON_PLUGIN];
      await writeFile(
        configFileOf(codex),
        [
          `[marketplaces.${TEST_MARKETPLACE_NAME}]\nsource_type = "local"\nsource = "${dirs.sourceDir}"\n`,
          ...switchedOff.map((pluginRef) => switchTable(pluginRef, false, spelling)),
          switchTable(SWITCHED_ON_PLUGIN, true),
        ].join("\n"),
      );
    }

    function behaveAs(behaviour: Partial<CodexBehaviour>): void {
      Object.assign(codex, behaviour, { added: [] });
    }

    /**
     * Global throughout: a project sub-agent has init write its trust into the same config.toml,
     * which fails on its own when the file cannot be written.
     */
    function onWebDeveloper(skillIds: string[]): SeedPayload {
      return buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: Object.fromEntries(skillIds.map((id) => [id, globalPlugin()])),
        agents: { "web-developer": { scope: "global" } },
      });
    }

    const configAt = (root: string) => path.join(root, CODEX_FOLDER, "config.ts");

    async function configuredSkillIds(root: string): Promise<string[]> {
      const { skills } = await readTestTsConfig<FixtureProjectConfig>(configAt(root));
      return skills.map(({ id }) => id);
    }

    type RunOutcome = {
      stdout: string;
      stderr: string;
      error: (Error & { oclif?: { exit?: number } }) | undefined;
    };

    /** Answers the write callbacks Ink waits on, which `captureOutput` drops. */
    async function answered(run: () => Promise<unknown>): Promise<RunOutcome> {
      const printed = { stdout: [] as string[], stderr: [] as string[] };
      const capture = (stream: keyof typeof printed) =>
        vi.spyOn(process[stream], "write").mockImplementation((chunk, ...rest) => {
          printed[stream].push(String(chunk));
          const onWritten = rest.find((argument) => typeof argument === "function");
          if (onWritten !== undefined) queueMicrotask(() => onWritten());
          return true;
        });
      const captures = [capture("stdout"), capture("stderr")];
      try {
        const ran = run().then(
          () => undefined,
          (error: RunOutcome["error"]) => error,
        );
        await delay(PROMPT_READY_MS);
        terminal.input.push(KEY_Y);
        const error = await ran;
        return {
          stdout: ansis.strip(printed.stdout.join("")),
          stderr: ansis.strip(printed.stderr.join("")),
          error,
        };
      } finally {
        captures.forEach((spy) => spy.mockRestore());
      }
    }

    const initFrom = (id: string) => () =>
      Init.run(["--from", id, "--marketplace", dirs.sourceDir, "--provider", "codex"], {
        root: CLI_ROOT,
      });

    const agentFile = () => path.join(codex.configDir, "agents", "web-developer.toml");

    /**
     * `edit` keeps the sub-agent file `init` wrote, so only `init`'s proves a step after the refresh
     * ran.
     */
    const RUNS = {
      "init --from": {
        succeeded: "Agents Inc. initialized successfully!",
        setUp(): Promise<void> {
          serve(SEED_ID, onWebDeveloper([VITEST]));
          return Promise.resolve();
        },
        run: () => answered(initFrom(SEED_ID)),
        async expectItsOwnStepsRan(): Promise<void> {
          expect(await fileExists(agentFile()), "the sub-agent is still compiled").toBe(true);
        },
      },
      "edit --from": {
        succeeded: "✓ Done",
        async setUp(): Promise<void> {
          serve(INSTALL_ID, onWebDeveloper([HONO]));
          const { error } = await answered(initFrom(INSTALL_ID));
          expect(error, "the installation edit --from applies over").toBeUndefined();
          process.chdir(fakeHome);
          serve(SEED_ID, onWebDeveloper([HONO, VITEST]));
        },
        run: () =>
          answered(() => Edit.run(["--from", SEED_ID, "--provider", "codex"], { root: CLI_ROOT })),
        expectItsOwnStepsRan: (): Promise<void> => Promise.resolve(),
      },
    } as const;

    describe.each(Object.keys(RUNS) as (keyof typeof RUNS)[])("%s", (command) => {
      const subject = RUNS[command];

      async function runOver(
        spelling: Spelling,
        behaviour: Partial<CodexBehaviour> = {},
        switchedOff?: readonly string[],
      ) {
        await codexHoldsTheMarketplace("double");
        await subject.setUp();
        await codexHoldsTheMarketplace(spelling, switchedOff);
        behaveAs(behaviour);
        return subject.run();
      }

      async function expectTheRestRan(): Promise<void> {
        expect(
          codex.added,
          "the plugin the run asked for is still added, after the refresh",
        ).toContain(PLUGIN_THE_RUN_ADDS);
        expect(
          await configuredSkillIds(fakeHome),
          "the config still records the plugin the run installed",
        ).toContain(VITEST);
        await subject.expectItsOwnStepsRan();
      }

      it("switches the plugin back off after the refresh switched it on, and warns of nothing", async () => {
        const { stderr, error } = await runOver("double");

        expect(error).toBeUndefined();
        expect(
          codex.added,
          "the refresh adds the plugin again, which is what switches it on",
        ).toContain(SWITCHED_OFF_PLUGIN);
        expect(
          await readFile(configFileOf(codex), "utf-8"),
          "the user switched this plugin off; the refresh must not leave it switched on",
        ).toContain(switchTable(SWITCHED_OFF_PLUGIN, false));
        expect(flattenCliOutput(stderr)).not.toContain(SWITCHED_OFF_PLUGIN);
        expect(flattenCliOutput(stderr)).not.toContain(CONTINUING_WITH_CACHED);
        await expectTheRestRan();
      });

      it("says the run succeeded when the switch is restored", async () => {
        const { stdout, error } = await runOver("double");

        expect(error).toBeUndefined();
        expect(stdout).toContain(subject.succeeded);
      });

      describe.each<{ cause: string; spelling: Spelling; behaviour: Partial<CodexBehaviour> }>([
        {
          cause: "config.toml cannot be written",
          spelling: "double",
          behaviour: { locksTheConfigAfterEachAdd: true },
        },
        {
          cause: "its table is spelled in single quotes",
          spelling: "single",
          behaviour: {},
        },
      ])("when $cause", ({ spelling, behaviour }) => {
        it("warns naming the plugin and the line to set, still installs, and exits 5 listing the plugin as what did not land", async () => {
          const { stdout, stderr, error } = await runOver(spelling, behaviour);
          const warnings = flattenCliOutput(stderr);

          expect(
            codex.added,
            "the refresh adds the plugin again, which is what switches it on",
          ).toContain(SWITCHED_OFF_PLUGIN);
          expect(
            error?.oclif?.exit,
            "everything else landed, so a script must see a run that completed with failures",
          ).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
          expect(
            error,
            "oclif frames every error but an exit as one, and nothing here was refused",
          ).toBeInstanceOf(Errors.ExitError);
          expect(warnings, "the warning names the plugin that is now switched on").toContain(
            SWITCHED_OFF_PLUGIN,
          );
          expect(warnings, "the warning names the line to set by hand").toContain(
            "enabled = false",
          );
          expect(
            compactCliOutput(stderr),
            "the warning names the file that line goes in",
          ).toContain("config.toml");
          expect(warnings, "a plugin left switched on was never at risk").not.toContain(
            SWITCHED_ON_PLUGIN,
          );
          expect(
            flattenCliOutput(`${stdout}\n${stderr}`),
            "the refresh did update the plugins, so saying it kept the cached version is untrue",
          ).not.toContain(CONTINUING_WITH_CACHED);
          expect(
            stdout,
            "the run's last word lists the plugin left switched on, with the line that switches it off",
          ).toMatch(workOwedEntry(1, SWITCHED_OFF_PLUGIN, "enabled = false"));
          await expectTheRestRan();
        });

        it("does not say the run succeeded", async () => {
          const { stdout, error } = await runOver(spelling, behaviour);

          expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
          expect(stdout, "a run that owes work must not claim success").not.toContain(
            subject.succeeded,
          );
        });
      });

      it("lists each plugin left switched on as its own entry, under a heading counting them all", async () => {
        const { stdout, error } = await runOver("double", { locksTheConfigAfterEachAdd: true }, [
          SWITCHED_OFF_PLUGIN,
          ALSO_SWITCHED_OFF_PLUGIN,
        ]);

        expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
        expect(stdout).toMatch(workOwedEntry(2, SWITCHED_OFF_PLUGIN, "enabled = false"));
        expect(stdout).toMatch(workOwedEntry(2, ALSO_SWITCHED_OFF_PLUGIN, "enabled = false"));
        await expectTheRestRan();
      });

      it("keeps today's warning and exits 0 when Codex refuses an add during the refresh, and the switch is restored", async () => {
        const { stderr, error } = await runOver("double", { refusesToAdd: SWITCHED_ON_PLUGIN });

        expect(
          error,
          "a refresh that really failed leaves the run's exit as it was",
        ).toBeUndefined();
        expect(flattenCliOutput(stderr)).toContain(CONTINUING_WITH_CACHED);
        expect(
          await readFile(configFileOf(codex), "utf-8"),
          "the plugin added before the refusal is switched back off",
        ).toContain(switchTable(SWITCHED_OFF_PLUGIN, false));
        expect(flattenCliOutput(stderr)).not.toContain(SWITCHED_OFF_PLUGIN);
        await expectTheRestRan();
      });

      it("keeps today's warning, names the plugin and the line to set, and exits 5 listing the plugin when Codex refuses an add and the switch cannot be restored either", async () => {
        const { stdout, stderr, error } = await runOver("double", {
          locksTheConfigAfterEachAdd: true,
          refusesToAdd: SWITCHED_ON_PLUGIN,
        });
        const warnings = flattenCliOutput(stderr);

        expect(
          codex.added,
          "the plugin is added again before the refusal, which is what switches it on",
        ).toContain(SWITCHED_OFF_PLUGIN);
        expect(
          error?.oclif?.exit,
          "a refresh that kept the cached version is no failure, so only the plugin left on is owed",
        ).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
        expect(error).toBeInstanceOf(Errors.ExitError);
        expect(
          flattenCliOutput(`${stdout}\n${stderr}`),
          "the refresh really failed, so the warning it has always given stays",
        ).toContain(CONTINUING_WITH_CACHED);
        expect(warnings, "the warning names the plugin that is now switched on").toContain(
          SWITCHED_OFF_PLUGIN,
        );
        expect(warnings, "the warning names the line to set by hand").toContain("enabled = false");
        expect(
          stdout,
          "the run's last word lists the plugin left switched on, with the line that switches it off",
        ).toMatch(workOwedEntry(1, SWITCHED_OFF_PLUGIN, "enabled = false"));
        await expectTheRestRan();
      });
    });
  },
);
