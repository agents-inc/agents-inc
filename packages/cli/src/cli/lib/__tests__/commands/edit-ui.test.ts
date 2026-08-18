import path from "path";
import { mkdir, writeFile } from "fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockOpenUrl } = vi.hoisted(() => ({ mockOpenUrl: vi.fn() }));

vi.mock("../../../utils/open-url.js", () => ({ openUrl: mockOpenUrl }));

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { renderConfigTs } from "../content-generators";
import { sa } from "../factories/skill-factories.js";
import { CLAUDE_SRC_DIR, EDITOR_URL, EJECT_SOURCE, STANDARD_FILES } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { STATUS_MESSAGES } from "../../../utils/messages";
import type { ProjectConfig } from "../../../types";

/**
 * `edit --ui` is the outbound half of the editor round trip: it mints an id for the
 * installation in this directory and opens it in the editor, instead of opening the wizard.
 *
 * The seam is `fetch`, stubbed globally, exactly as the `share` specs stub it: reading the
 * config, mapping it onto the wire contract and refusing what the contract cannot carry all
 * run for real, because that mapping is the whole of what this flag contributes over `share`.
 * The browser opener is the one module mocked — it is a process boundary, and a spec that
 * launched a real browser would be unrunnable in CI.
 */

const { default: Edit } = await import("../../../commands/edit.js");

const MINTED_ID = "Ab3xY9_Q";
const WEB_DEV = "web-developer";
const REACT_ID = "web-framework-react";
const REACT_CATEGORY = "web-framework";
const PRIVATE_MARKETPLACE = "acme-internal";
const OPENER_FAILURE = "Could not open your browser — 'xdg-open' exited 3.";

let fetchStub: ReturnType<typeof vi.fn>;

function stubStore(response: Response): void {
  fetchStub = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchStub);
}

function mintedResponse(id: string): Response {
  return new Response(JSON.stringify({ id }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

/** Runs the command, returning the oclif error it threw (or `undefined` on success). */
function runEditUi(): Promise<(Error & { oclif?: { exit?: number } }) | undefined> {
  return Edit.run(["--ui"], { root: CLI_ROOT }).then(
    () => undefined,
    (error: Error & { oclif?: { exit?: number } }) => error,
  );
}

describe("edit --ui", () => {
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
    // The config loader falls back to $HOME when the cwd carries no config, so an unstubbed
    // HOME would let the developer's own installation decide what these runs share.
    vi.stubEnv("HOME", tempDir);
    process.chdir(projectDir);

    stdoutChunks = [];
    // Saved to be assigned straight back onto the same object in afterEach, so it is called
    // with the receiver it came from. Binding would restore a wrapper rather than the original.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
    origWrite = process.stdout.write;
    process.stdout.write = function (str: unknown): boolean {
      stdoutChunks.push(String(str));
      return true;
    };

    origIsTTY = process.stdin.isTTY;
    // Whether a browser may be launched is a fact about the terminal this ran in, so every spec
    // states it rather than inheriting whatever the runner happened to be started from.
    process.stdin.isTTY = false;

    mockOpenUrl.mockResolvedValue({ ok: true });
    stubStore(mintedResponse(MINTED_ID));
  });

  afterEach(async () => {
    process.stdout.write = origWrite;
    process.stdin.isTTY = origIsTTY;
    process.chdir(originalCwd);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  /** Writes the `config.ts` this command reads the installation out of. */
  async function installConfig(overrides: Partial<ProjectConfig>): Promise<void> {
    const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);
    await mkdir(claudeSrcDir, { recursive: true });
    await writeFile(
      path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS),
      renderConfigTs(buildProjectConfig(overrides)),
    );
  }

  /** The one installed configuration these specs open, unless a spec varies it. */
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
      expect(output).toContain(MINTED_ID);
      expect(output).toContain(`${EDITOR_URL}/?fromId=${MINTED_ID}`);
      expect(output).toContain(`init --from ${MINTED_ID}`);
    });

    it("never loads the catalogue, because there is no wizard to open it for", async () => {
      await installConfig(installedOverrides());

      const error = await runEditUi();

      expect(error).toBeUndefined();
      expect(
        stdoutChunks.join(""),
        "a flag that replaces the wizard must not pay for the wizard's inputs",
      ).not.toContain(STATUS_MESSAGES.LOADING_SKILLS);
    });
  });

  describe("handing the link to a browser", () => {
    it("opens the printed link when there is a terminal to open one from", async () => {
      process.stdin.isTTY = true;
      await installConfig(installedOverrides());

      await runEditUi();

      expect(mockOpenUrl).toHaveBeenCalledWith(`${EDITOR_URL}/?fromId=${MINTED_ID}`);
    });

    it("opens nothing without a terminal, and prints the link instead", async () => {
      await installConfig(installedOverrides());

      await runEditUi();

      // Piped or in CI there is nobody whose browser this would be. The link is the whole of
      // what such a run can offer, and it is printed either way.
      expect(mockOpenUrl).not.toHaveBeenCalled();
      expect(stdoutChunks.join("")).toContain(`${EDITOR_URL}/?fromId=${MINTED_ID}`);
    });

    it("leaves the link standing when the browser could not be opened", async () => {
      process.stdin.isTTY = true;
      mockOpenUrl.mockResolvedValue({ ok: false, error: OPENER_FAILURE });
      await installConfig(installedOverrides());

      const error = await runEditUi();

      // The id was minted and printed; a machine with no browser has lost nothing.
      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain(`${EDITOR_URL}/?fromId=${MINTED_ID}`);
    });
  });

  describe("refusals", () => {
    it("refuses a directory with nothing installed, without spending a write", async () => {
      const error = await runEditUi();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(fetchStub).not.toHaveBeenCalled();
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
      expect(fetchStub, "a refusal must precede the write, not follow it").not.toHaveBeenCalled();
    });

    it("exits non-zero when the store refuses the write, and opens nothing", async () => {
      await installConfig(installedOverrides());
      stubStore(new Response("Could not store this config", { status: 503 }));

      const error = await runEditUi();

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(mockOpenUrl).not.toHaveBeenCalled();
      expect(
        stdoutChunks.join(""),
        "a link printed beside a failure points at a configuration that was never stored",
      ).not.toContain(MINTED_ID);
    });
  });
});
