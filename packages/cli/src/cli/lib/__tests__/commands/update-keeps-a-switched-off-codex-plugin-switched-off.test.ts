import { chmodSync, readFileSync, writeFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { captureOutput } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { EXIT_CODES } from "../../exit-codes";
import {
  type FakeChildReply,
  fakeChildProcess,
} from "../../hosts/__tests__/helpers/fake-child-process.js";

/**
 * The real command over the real Codex host, with `codex` replaced by a fake that, like Codex,
 * switches a plugin on in `config.toml` whenever it adds it. The e2e twin covers a switch spelled
 * so update cannot find it; a file that cannot be written is only stageable here, because the
 * real Codex replaces config.toml (mode 600) on every add.
 */

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});

const { spawn } = await import("child_process");
const { default: Update } = await import("../../../commands/update.js");

const MARKETPLACE = "agents-inc";

/** Written out: a test building the reference with the product's own helper would move with it. */
const SWITCHED_OFF_PLUGIN = "web-framework-react@agents-inc";
const SWITCHED_ON_PLUGIN = "api-framework-hono@agents-inc";

const INSTALLED_PLUGINS = [
  { pluginId: SWITCHED_OFF_PLUGIN, name: "web-framework-react" },
  { pluginId: SWITCHED_ON_PLUGIN, name: "api-framework-hono" },
];

/** A literal: a test reading the folder off the product would move with it. */
const CODEX_FOLDER = ".agents-inc/codex";

/** What Codex says when a marketplace's new version dropped the plugin it is asked to add. */
const ADD_REFUSAL = "plugin source path is not a directory";

const READ_ONLY_FILE = 0o444;
const READ_ONLY_DIR = 0o555;
const WRITABLE_FILE = 0o644;
const WRITABLE_DIR = 0o755;

type MarketplaceKind = "git" | "local";

function switchTable(pluginRef: string, enabled: boolean): string {
  return `[plugins."${pluginRef}"]\nenabled = ${String(enabled)}\n`;
}

function configAsTheUserLeftIt(kind: MarketplaceKind): string {
  return [
    `[marketplaces.${MARKETPLACE}]\nsource_type = "${kind}"\nsource = "/a-marketplace"\n`,
    switchTable(SWITCHED_OFF_PLUGIN, false),
    switchTable(SWITCHED_ON_PLUGIN, true),
  ].join("\n");
}

type FakeCodex = {
  kind: MarketplaceKind;
  configDir: string;
  /** Leaves config.toml unwritable after each add, as a file the user's tooling locks would be. */
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
        name: MARKETPLACE,
        marketplaceSource: { sourceType: codex.kind, source: "/a-marketplace" },
      },
    ],
  });
}

/** Codex reads each switch out of config.toml, so the listing answers whatever the file holds. */
function pluginListing(codex: FakeCodex): string {
  const config = readFileSync(configFileOf(codex), "utf-8");
  return JSON.stringify({
    installed: INSTALLED_PLUGINS.map(({ pluginId, name }) => ({
      pluginId,
      name,
      marketplaceName: MARKETPLACE,
      version: "2.0.0",
      enabled: !config.includes(switchTable(pluginId, false)),
    })),
    available: [],
  });
}

function codexAdds(codex: FakeCodex, pluginRef: string): void {
  const configFile = configFileOf(codex);
  chmodSync(codex.configDir, WRITABLE_DIR);
  chmodSync(configFile, WRITABLE_FILE);
  const config = readFileSync(configFile, "utf-8");
  writeFileSync(
    configFile,
    config.replace(switchTable(pluginRef, false), switchTable(pluginRef, true)),
  );
  codex.added.push(pluginRef);
  if (codex.locksTheConfigAfterEachAdd) {
    chmodSync(configFile, READ_ONLY_FILE);
    chmodSync(codex.configDir, READ_ONLY_DIR);
  }
}

function codexAnswers(codex: FakeCodex, args: readonly string[]): FakeChildReply {
  const [verb, noun, action] = args;
  if (verb === "--version") return { stdout: "codex-cli 0.155.1\n" };
  if (verb !== "plugin") return { exitCode: 1, stderr: `unexpected codex ${args.join(" ")}` };
  if (noun === "marketplace" && action === "list") return { stdout: marketplaceListing(codex) };
  if (noun === "marketplace" && action === "upgrade") return { stdout: "{}" };
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

describe.skipIf(process.getuid?.() === 0)(
  "update over a Codex plugin the user switched off",
  () => {
    let tempDir: string;
    let projectDir: string;
    let originalCwd: string;
    let codex: FakeCodex;

    async function runUpdateOver(kind: MarketplaceKind, behaviour: Partial<CodexBehaviour> = {}) {
      codex = {
        kind,
        configDir: codex.configDir,
        locksTheConfigAfterEachAdd: false,
        refusesToAdd: undefined,
        ...behaviour,
        added: [],
      };
      await writeFile(configFileOf(codex), configAsTheUserLeftIt(kind));
      vi.mocked(spawn).mockImplementation((_command, args) =>
        fakeChildProcess(codexAnswers(codex, args)),
      );
      return captureOutput(() => Update.run([], { root: CLI_ROOT }));
    }

    beforeEach(async () => {
      originalCwd = process.cwd();
      tempDir = await createTempDir("cc-update-codex-switch-");
      projectDir = path.join(tempDir, "project");
      const configDir = path.join(tempDir, "codex-state");
      await mkdir(projectDir, { recursive: true });
      await mkdir(configDir, { recursive: true });
      vi.stubEnv("HOME", tempDir);
      vi.stubEnv("CODEX_HOME", configDir);
      codex = {
        kind: "local",
        configDir,
        locksTheConfigAfterEachAdd: false,
        refusesToAdd: undefined,
        added: [],
      };
      await writeFile(configFileOf(codex), configAsTheUserLeftIt(codex.kind));
      process.chdir(projectDir);

      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          skills: [
            buildSkillConfig("web-framework-react", { origin: MARKETPLACE, scope: "global" }),
            buildSkillConfig("api-framework-hono", { origin: MARKETPLACE, scope: "global" }),
          ],
        }),
        CODEX_FOLDER,
      );
    });

    afterEach(async () => {
      chmodSync(codex.configDir, WRITABLE_DIR);
      chmodSync(configFileOf(codex), WRITABLE_FILE);
      process.chdir(originalCwd);
      vi.unstubAllEnvs();
      await cleanupTempDir(tempDir);
    });

    describe.each<MarketplaceKind>(["git", "local"])("from a %s marketplace", (kind) => {
      it("switches it off again after the add switched it on, leaving config.toml as the user left it", async () => {
        const { error } = await runUpdateOver(kind);

        expect(error).toBeUndefined();
        expect(
          codex.added,
          "the add is what switches the plugin on, so without it nothing here was at risk",
        ).toContain(SWITCHED_OFF_PLUGIN);
        expect(
          await readFile(configFileOf(codex), "utf-8"),
          "the user switched this plugin off; updating it must not leave it switched on",
        ).toBe(configAsTheUserLeftIt(kind));
      });

      it("warns naming the plugin and the line to set when config.toml cannot be written, updates the rest, and exits with an error", async () => {
        const { stdout, stderr, error } = await runUpdateOver(kind, {
          locksTheConfigAfterEachAdd: true,
        });
        const warnings = flattenCliOutput(stderr);

        expect(
          error?.oclif?.exit,
          "a plugin the user switched off is running again, so a script must see the run fail",
        ).toBe(EXIT_CODES.ERROR);
        expect(warnings, "the warning names the plugin that is now switched on").toContain(
          SWITCHED_OFF_PLUGIN,
        );
        expect(warnings, "the warning names the line to set by hand").toContain("enabled = false");
        expect(warnings, "the warning names the file that line goes in").toContain("config.toml");
        expect(warnings, "a plugin left switched on was never at risk").not.toContain(
          SWITCHED_ON_PLUGIN,
        );
        expect(
          stdout,
          "one plugin whose switch could not be restored must not stop the others updating",
        ).toContain(`Updated plugin ${SWITCHED_ON_PLUGIN}`);
      });

      it("switches back off the plugins it added before Codex refused one, and still exits with the refusal", async () => {
        const { stderr, error } = await runUpdateOver(kind, { refusesToAdd: SWITCHED_ON_PLUGIN });

        expect(error?.oclif?.exit, "a plugin could not be updated").toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(stderr), "the refusal itself is still reported").toContain(
          ADD_REFUSAL,
        );
        expect(
          codex.added,
          "the add is what switches the plugin on, so without it nothing here was at risk",
        ).toContain(SWITCHED_OFF_PLUGIN);
        expect(
          await readFile(configFileOf(codex), "utf-8"),
          "a later plugin's refusal must not leave the one the user switched off switched on",
        ).toBe(configAsTheUserLeftIt(kind));
      });

      it("names the plugin and the line to set when Codex refused one add and the switch cannot be restored either", async () => {
        const { stderr, error } = await runUpdateOver(kind, {
          locksTheConfigAfterEachAdd: true,
          refusesToAdd: SWITCHED_ON_PLUGIN,
        });
        const warnings = flattenCliOutput(stderr);

        expect(error?.oclif?.exit, "a plugin could not be updated").toBe(EXIT_CODES.ERROR);
        expect(warnings, "the refusal itself is still reported").toContain(ADD_REFUSAL);
        expect(warnings, "the warning names the plugin that is now switched on").toContain(
          SWITCHED_OFF_PLUGIN,
        );
        expect(warnings, "the warning names the line to set by hand").toContain("enabled = false");
        expect(
          error?.message,
          "the run's last word names the plugin left switched on, not only the refusal",
        ).toContain(SWITCHED_OFF_PLUGIN);
      });
    });
  },
);
