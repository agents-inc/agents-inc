import { captureOutput } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockOpenUrl } = vi.hoisted(() => ({ mockOpenUrl: vi.fn() }));

vi.mock("../../../utils/open-url.js", () => ({ openUrl: mockOpenUrl }));

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { buildProjectConfig } from "../factories/config-factories.js";

/**
 * Imported from source so the opener, a process boundary, can be mocked: `init`'s editor routes and
 * `edit --ui --from` print the link, then open it only where a person is at a terminal.
 */
const { default: Init } = await import("../../../commands/init.js");
const { default: Edit } = await import("../../../commands/edit.js");

const EDITOR = "https://agentsinc.sh/editor";
const SHARED_ID = "Abc123";
const OPENER_FAILURE = "Could not open your browser — 'xdg-open' exited 3.";

describe("opening the editor in a browser", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-opening-the-editor-test-"));
    mockOpenUrl.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("at a terminal", () => {
    standAtTerminal();

    it("opens the editor a bare init points at, where nothing is installed", async () => {
      const { error } = await captureOutput(() => Init.run([], { root: CLI_ROOT }));

      expect(error).toBeUndefined();
      expect(mockOpenUrl.mock.calls).toStrictEqual([[EDITOR]]);
    });

    it("opens the shared configuration init --ui --from names", async () => {
      await captureOutput(() => Init.run(["--ui", "--from", SHARED_ID], { root: CLI_ROOT }));

      expect(mockOpenUrl.mock.calls).toStrictEqual([[`${EDITOR}/?fromId=${SHARED_ID}`]]);
    });

    it("opens the shared configuration edit --ui --from names", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig());

      await captureOutput(() => Edit.run(["--ui", "--from", SHARED_ID], { root: CLI_ROOT }));

      expect(mockOpenUrl.mock.calls).toStrictEqual([[`${EDITOR}/?fromId=${SHARED_ID}`]]);
    });

    it("warns that the browser would not open, and leaves the printed link standing", async () => {
      mockOpenUrl.mockResolvedValue({ ok: false, error: OPENER_FAILURE });

      const { stdout, stderr, error } = await captureOutput(() =>
        Edit.run(["--ui", "--from", SHARED_ID], { root: CLI_ROOT }),
      );

      expect(error).toBeUndefined();
      expect(stdout).toContain(`Open it at ${EDITOR}/?fromId=${SHARED_ID}`);
      expect(flattenCliOutput(stderr)).toBe(`Warning: ${OPENER_FAILURE}`);
    });

    it("warns, for init too, that the browser would not open", async () => {
      mockOpenUrl.mockResolvedValue({ ok: false, error: OPENER_FAILURE });

      const { stdout, stderr } = await captureOutput(() => Init.run([], { root: CLI_ROOT }));

      expect(stdout).toContain(`Build it at ${EDITOR}`);
      expect(flattenCliOutput(stderr)).toBe(`Warning: ${OPENER_FAILURE}`);
    });
  });

  describe("without a terminal", () => {
    it("prints the link a bare init points at, and opens nothing", async () => {
      const { stdout } = await captureOutput(() => Init.run([], { root: CLI_ROOT }));

      expect(stdout).toContain(`Build it at ${EDITOR}`);
      expect(mockOpenUrl.mock.calls).toStrictEqual([]);
    });

    it("prints the link edit --ui --from names, and opens nothing", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig());

      const { stdout } = await captureOutput(() =>
        Edit.run(["--ui", "--from", SHARED_ID], { root: CLI_ROOT }),
      );

      expect(stdout).toContain(`Open it at ${EDITOR}/?fromId=${SHARED_ID}`);
      expect(mockOpenUrl.mock.calls).toStrictEqual([]);
    });
  });
});
