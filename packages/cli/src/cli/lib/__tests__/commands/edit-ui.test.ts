import path from "path";
import { mkdir } from "fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockOpenUrl } = vi.hoisted(() => ({ mockOpenUrl: vi.fn() }));

vi.mock("../../../utils/open-url.js", () => ({ openUrl: mockOpenUrl }));

import { STORED_ID, storeRefusedHandler } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { sa } from "../factories/skill-factories.js";
import { EDITOR_URL, EJECT_SOURCE } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { STATUS_MESSAGES } from "../../../utils/messages";
import type { ProjectConfig } from "../../../types";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { standAtTerminal } from "../helpers/terminal-input.js";

/**
 * The network is answered by `@workspace/api-mocks`, so the config-to-wire mapping runs for real.
 * Only the browser opener is mocked: it is a process boundary.
 */

const { default: Edit } = await import("../../../commands/edit.js");

const WEB_DEV = "web-developer";
const REACT_ID = "web-framework-react";
const REACT_CATEGORY = "web-framework";
const PRIVATE_MARKETPLACE = "acme-internal";
const OPENER_FAILURE = "Could not open your browser — 'xdg-open' exited 3.";

function runEditUi(): Promise<(Error & { oclif?: { exit?: number } }) | undefined> {
  return Edit.run(["--ui"], { root: CLI_ROOT }).then(
    () => undefined,
    (error: Error & { oclif?: { exit?: number } }) => error,
  );
}

describe("edit --ui", () => {
  const worker = useMockWorker();
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let stdoutChunks: string[] = [];
  let origWrite: typeof process.stdout.write;
  let origIsTTY: boolean;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-ui-test-");
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

    origIsTTY = process.stdin.isTTY;
    // Every spec states whether a browser may launch rather than inheriting the runner's terminal.
    process.stdin.isTTY = false;

    mockOpenUrl.mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    process.stdout.write = origWrite;
    process.stdin.isTTY = origIsTTY;
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  async function installConfig(overrides: Partial<ProjectConfig>): Promise<void> {
    await writeTestTsConfig(projectDir, buildProjectConfig(overrides));
  }

  function installedOverrides(overrides?: Partial<ProjectConfig>): Partial<ProjectConfig> {
    return {
      skills: [buildSkillConfig(REACT_ID, { scope: "global", origin: EJECT_SOURCE })],
      agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID)] } },
      ...overrides,
    };
  }

  describe("minting an id for the editor", () => {
    it("posts this installation and names both ways to use the id it got back", async () => {
      await installConfig(installedOverrides());

      const error = await runEditUi();
      const output = stdoutChunks.join("");

      expect(error).toBeUndefined();
      expect(output).toContain(STORED_ID);
      expect(output).toContain(`${EDITOR_URL}/?fromId=${STORED_ID}`);
      expect(output).toContain(`init --from ${STORED_ID}`);
    });

    it("never loads the catalogue, because there is no wizard to open it for", async () => {
      await installConfig(installedOverrides());

      const error = await runEditUi();

      expect(error).toBeUndefined();
      expect(
        stdoutChunks.join(""),
        "opening the editor on an installation must not pay for a catalogue load",
      ).not.toContain(STATUS_MESSAGES.LOADING_SKILLS);
    });
  });

  describe("handing the link to a browser", () => {
    describe("at a terminal", () => {
      standAtTerminal();

      it("opens the printed link when there is a terminal to open one from", async () => {
        await installConfig(installedOverrides());

        await runEditUi();

        expect(mockOpenUrl).toHaveBeenCalledWith(`${EDITOR_URL}/?fromId=${STORED_ID}`);
      });

      it("leaves the link standing when the browser could not be opened", async () => {
        mockOpenUrl.mockResolvedValue({ ok: false, error: OPENER_FAILURE });
        await installConfig(installedOverrides());

        const error = await runEditUi();

        // The id was minted and printed; a machine with no browser has lost nothing.
        expect(error).toBeUndefined();
        expect(stdoutChunks.join("")).toContain(`${EDITOR_URL}/?fromId=${STORED_ID}`);
      });
    });

    it("opens nothing without a terminal, and prints the link instead", async () => {
      await installConfig(installedOverrides());

      await runEditUi();

      // Piped or in CI there is no browser to open; the link is printed either way.
      expect(mockOpenUrl).not.toHaveBeenCalled();
      expect(stdoutChunks.join("")).toContain(`${EDITOR_URL}/?fromId=${STORED_ID}`);
    });
  });

  describe("refusals", () => {
    it("refuses a directory with nothing installed, without spending a write", async () => {
      const error = await runEditUi();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(worker.requests).toStrictEqual([]);
      expect(mockOpenUrl).not.toHaveBeenCalled();
    });

    it("refuses an installation the contract cannot carry, naming what it cannot say", async () => {
      await installConfig(
        installedOverrides({
          skills: [buildSkillConfig(REACT_ID, { scope: "global", origin: PRIVATE_MARKETPLACE })],
        }),
      );

      const error = await runEditUi();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(PRIVATE_MARKETPLACE);
      expect(worker.requests, "a refusal must precede the write, not follow it").toStrictEqual([]);
    });

    it("exits non-zero when the store refuses the write, and opens nothing", async () => {
      await installConfig(installedOverrides());
      configMockServer.use(storeRefusedHandler);

      const error = await runEditUi();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(mockOpenUrl).not.toHaveBeenCalled();
      expect(
        stdoutChunks.join(""),
        "a link printed beside a failure points at a configuration that was never stored",
      ).not.toContain(STORED_ID);
    });
  });
});
