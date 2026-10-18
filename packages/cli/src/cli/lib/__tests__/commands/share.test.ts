import path from "path";
import { Socket } from "node:net";
import { mkdir } from "fs/promises";
import { STORED_ID, storeRefusedHandler } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { MATRIX_VERSION } from "@workspace/matrix";
import { SEED_VERSION } from "@workspace/matrix/seed";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { firstElement } from "../helpers/element-at.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { sa } from "../factories/skill-factories.js";
import { DEFAULT_PUBLIC_SOURCE_NAME, EDITOR_URL, EJECT_SOURCE } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import type { ProjectConfig } from "../../../types";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import { standAtTerminal } from "../helpers/terminal-input.js";

/**
 * The network is answered by `@workspace/api-mocks`, so the config-to-wire mapping and its refusals
 * run for real; mocking the publish module would leave them untested.
 */

const { default: Share } = await import("../../../commands/share.js");

const WEB_DEV = "web-developer";
const REACT_ID = "web-framework-react";
const HONO_ID = "api-framework-hono";
const REACT_CATEGORY = "web-framework";
const PRIVATE_MARKETPLACE = "acme-internal";

/**
 * Standard input on a pipe: not a terminal, and ended once the body is read. `setRawMode` only
 * satisfies the stream's type; nothing on the piped path calls it.
 */
class PipedInput extends Socket {
  readonly fd = 0;
  isTTY = false;
  isRaw = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

function runShare(): Promise<(Error & { oclif?: { exit?: number } }) | undefined> {
  return Share.run([], { root: CLI_ROOT }).then(
    () => undefined,
    (error: Error & { oclif?: { exit?: number } }) => error,
  );
}

describe("share command", () => {
  const worker = useMockWorker();
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let stdoutChunks: string[] = [];
  let origWrite: typeof process.stdout.write;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-share-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    // The config loader falls back to $HOME, so HOME must not be the developer's.
    vi.stubEnv("HOME", tempDir);
    process.chdir(projectDir);

    stdoutChunks = [];
    // Restored onto the same object in afterEach; binding would restore a wrapper instead.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
    origWrite = process.stdout.write;
    process.stdout.write = function (str: unknown): boolean {
      stdoutChunks.push(String(str));
      return true;
    };
  });

  afterEach(async () => {
    process.stdout.write = origWrite;
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  async function installConfig(overrides: Partial<ProjectConfig>): Promise<void> {
    await writeTestTsConfig(projectDir, buildProjectConfig(overrides));
  }

  /** A public-catalogue plugin: a share carries plugins only and refuses an ejected skill. */
  function installedOverrides(overrides?: Partial<ProjectConfig>): Partial<ProjectConfig> {
    return {
      skills: [buildSkillConfig(REACT_ID, { scope: "global", origin: DEFAULT_PUBLIC_SOURCE_NAME })],
      agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID)] } },
      ...overrides,
    };
  }

  describe("minting an id", () => {
    it("posts this installation and names both ways to use the id it got back", async () => {
      await installConfig(installedOverrides());

      const error = await runShare();
      const output = stdoutChunks.join("");

      expect(error).toBeUndefined();
      expect(output).toContain(STORED_ID);
      // Both destinations are named: the CLI and the editor are the two readers of an id.
      expect(output).toContain(`init --from ${STORED_ID}`);
      expect(output).toContain(EDITOR_URL);
    });

    it("sends the installed selection, not an empty envelope", async () => {
      await installConfig(installedOverrides());

      await runShare();

      const posted: unknown = JSON.parse(await firstElement(worker.requests).text());
      // The whole envelope: `toContain` can't see scope or holder, and a subset would allow extras.
      expect(posted).toStrictEqual({
        v: SEED_VERSION,
        matrixVersion: MATRIX_VERSION,
        stackId: null,
        skills: {
          [REACT_ID]: { install: "plugin", scope: "global", assignments: { [WEB_DEV]: "lazy" } },
        },
        agents: { [WEB_DEV]: { on: true, scope: "global" } },
      });
    });
  });

  describe("refusals", () => {
    it("refuses when there is no installation here to share", async () => {
      const error = await runShare();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(
        worker.requests,
        "nothing may be posted for a directory with no installation",
      ).toStrictEqual([]);
    });

    it("refuses a configuration whose every entry is a tombstone", async () => {
      await installConfig({
        skills: [
          buildSkillConfig(REACT_ID, { scope: "global", origin: EJECT_SOURCE, excluded: true }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global", excluded: true }),
      });

      const error = await runShare();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      // An id for a config that installs nothing spends a scarce store write on a dead link.
      expect(worker.requests).toStrictEqual([]);
    });

    it("refuses an installation the contract cannot carry, naming what it cannot say", async () => {
      await installConfig(
        installedOverrides({
          skills: [buildSkillConfig(REACT_ID, { scope: "global", origin: PRIVATE_MARKETPLACE })],
        }),
      );

      const error = await runShare();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(PRIVATE_MARKETPLACE);
      expect(worker.requests, "a refusal must precede the write, not follow it").toStrictEqual([]);
    });

    it("exits non-zero when the store refuses the write", async () => {
      await installConfig(installedOverrides());
      configMockServer.use(storeRefusedHandler);

      const error = await runShare();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain("503");
      expect(
        stdoutChunks.join(""),
        "an id line printed beside a failure is a message about work that never happened",
      ).not.toContain(STORED_ID);
    });
  });

  describe("what share says", () => {
    const ID_LINES = [
      `✓ Shared as ${STORED_ID}`,
      `  Install it:  npx agents-inc init --from ${STORED_ID}`,
      `  Open it:     https://agentsinc.sh/editor/?fromId=${STORED_ID}`,
    ];

    it("counts what it shares, then names the id and both ways to use it", async () => {
      await installConfig(installedOverrides());

      const error = await runShare();

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toBe(
        ["Sharing 1 skill(s) across 1 sub-agent(s)...", ...ID_LINES, ""].join("\n"),
      );
    });

    it("refuses an ejected skill by name, before anything is posted", async () => {
      await installConfig(
        installedOverrides({
          skills: [buildSkillConfig(REACT_ID, { scope: "global", origin: EJECT_SOURCE })],
        }),
      );

      const error = await runShare();

      expect(error?.message).toBe(
        [
          "This installation holds ejected skills, and ejected skills cannot be shared:",
          `  ${REACT_ID}`,
          "Only plugins can be shared.",
        ].join("\n"),
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(worker.requests).toStrictEqual([]);
    });

    it("warns after the id that a folder marketplace installs only where the folder exists, and which skills another marketplace serves", async () => {
      const marketplaceFolder = path.join(tempDir, "acme-marketplace");
      await mkdir(marketplaceFolder, { recursive: true });
      await installConfig(
        installedOverrides({
          marketplace: marketplaceFolder,
          marketplaceName: PRIVATE_MARKETPLACE,
          skills: [
            buildSkillConfig(REACT_ID, { scope: "global", origin: PRIVATE_MARKETPLACE }),
            buildSkillConfig(HONO_ID, { scope: "global", origin: DEFAULT_PUBLIC_SOURCE_NAME }),
          ],
        }),
      );
      const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const error = await runShare();

      expect(error).toBeUndefined();
      expect(warned.mock.calls).toStrictEqual([
        [
          `  Warning: This id names the marketplace folder ${marketplaceFolder}, so it installs only where that folder exists.`,
        ],
        [
          `  Warning: A shared id names one marketplace, and these skill(s) come from another, so they will not install elsewhere: ${HONO_ID}`,
        ],
      ]);
    });

    it("warns nothing for a public-catalogue installation", async () => {
      await installConfig(installedOverrides());
      const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await runShare();

      expect(warned).not.toHaveBeenCalled();
    });
  });

  describe("sharing a configuration piped in with --stdin", () => {
    const PIPED = buildSeedPayload({
      skills: {
        [REACT_ID]: buildSeedSkill({
          install: "plugin",
          scope: "global",
          assignments: { [WEB_DEV]: "lazy" },
        }),
      },
      agents: { [WEB_DEV]: { on: true, scope: "global" } },
    });

    function runPipedShare(): Promise<(Error & { oclif?: { exit?: number } }) | undefined> {
      return Share.run(["--stdin"], { root: CLI_ROOT }).then(
        () => undefined,
        (error: Error & { oclif?: { exit?: number } }) => error,
      );
    }

    describe("from a pipe", () => {
      let stdin: MockInstance | undefined;

      function pipeIn(body: string): void {
        const input = new PipedInput();
        input.push(body);
        input.push(null);
        stdin = vi.spyOn(process, "stdin", "get").mockReturnValue(input);
      }

      afterEach(() => {
        stdin?.mockRestore();
      });

      it("posts what was piped as it is, reading nothing of this directory, and warns nothing", async () => {
        // Two installations here would refuse any share that read this directory.
        for (const folder of [".agents-inc/claude", ".agents-inc/codex"]) {
          await writeTestTsConfig(projectDir, buildProjectConfig(installedOverrides()), folder);
        }
        pipeIn(JSON.stringify(PIPED));
        const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const error = await runPipedShare();

        expect(error).toBeUndefined();
        expect(JSON.parse(await firstElement(worker.requests).text())).toStrictEqual(PIPED);
        expect(stdoutChunks.join("")).toBe(
          [
            `✓ Shared as ${STORED_ID}`,
            `  Install it:  npx agents-inc init --from ${STORED_ID}`,
            `  Open it:     https://agentsinc.sh/editor/?fromId=${STORED_ID}`,
            "",
          ].join("\n"),
        );
        expect(warned).not.toHaveBeenCalled();
      });

      it("refuses a body that is not JSON, quoting its opening, before anything is posted", async () => {
        pipeIn("not a configuration");

        const error = await runPipedShare();

        expect(error?.message).toBe(
          `What arrived on standard input is not JSON: Unexpected token 'o', "not a configuration" is not valid JSON. It began: not a configuration`,
        );
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(worker.requests).toStrictEqual([]);
      });
    });

    describe("at a terminal", () => {
      standAtTerminal();

      it("refuses to read a configuration typed in, before anything is posted", async () => {
        const error = await runPipedShare();

        expect(error?.message).toBe(
          "--stdin expects a configuration on standard input, but standard input is a terminal. Pipe one in rather than typing it.",
        );
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(worker.requests).toStrictEqual([]);
      });
    });
  });
});
