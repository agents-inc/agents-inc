import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  fileExists,
  getEjectedTemplatePath,
  readTreeSnapshot,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * An unevaluable source config stops commands that would otherwise fall through to the public
 * catalogue. This is the source-config reader, not the full-config reader the `*-corrupt-config`
 * specs cover. Each refusal is paired with the same command succeeding.
 */

const SYNTAX_ERROR = `export default {{{ not valid typescript`;

/** Used as the query so a served answer is recognisable. */
const QUERY = E2E_SKILL.react.slug;

describe("a settings config that exists and cannot be evaluated", () => {
  let source: E2ESource;
  let tempDir: string | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
  });

  afterAll(async () => {
    await cleanupFixture(source);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  /** Kept apart: at the home root this reader's file IS the global config. */
  async function makeProjectAndHome(): Promise<{ projectDir: string; home: string }> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await mkdir(home, { recursive: true });

    return { projectDir, home };
  }

  describe("search", () => {
    it("refuses rather than answering out of a marketplace nobody named", async () => {
      const { projectDir, home } = await makeProjectAndHome();
      await writeCorruptConfig(projectDir, SYNTAX_ERROR);
      const before = await readTreeSnapshot(projectDir);

      const { exitCode, output } = await CLI.run(
        ["search", QUERY],
        { dir: projectDir },
        {
          env: { HOME: home },
        },
      );

      expect(exitCode, `search output:\n${output}`).toBe(EXIT_CODES.ERROR);
      const flattened = flattenCliOutput(output);
      // Compacted: oclif breaks a long path mid-word.
      expect(
        compactCliOutput(output),
        "the refusal names the file it could not evaluate",
      ).toContain(compactCliOutput(configTsPath(projectDir)));
      expect(flattened, "and the loader's own reason for it").toContain(
        STEP_TEXT.CONFIG_LOAD_REASON,
      );
      expect(flattened, "with the one way out that works on a config nothing can read").toContain(
        STEP_TEXT.CONFIG_UNREADABLE_RECREATE,
      );

      // The public catalogue has a React skill under this slug too; the fixture's display title
      // tells which marketplace answered.
      expect(output).not.toContain(E2E_SKILL.react.display);
      expect(output).not.toContain(E2E_SKILL.react.id);

      // `readTreeSnapshot` carries mtimes, so a same-bytes rewrite still shows.
      expect(await readTreeSnapshot(projectDir)).toStrictEqual(before);
    });

    it("answers when the same config loads, so the refusal is not unconditional", async () => {
      const { projectDir, home } = await makeProjectAndHome();
      await writeProjectConfig(projectDir, {
        name: "config-unreadable-control",
        marketplace: source.sourceDir,
      });

      const { exitCode, stdout } = await CLI.run(
        ["search", QUERY],
        { dir: projectDir },
        {
          env: { HOME: home },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, "the control must reach the marketplace the config names").toContain(
        E2E_SKILL.react.display,
      );
    });
  });

  describe("eject", () => {
    /**
     * `eject` reaches this reader through `ensureMinimalConfig`; with no project config the
     * unreadable file is always the global one, and the refusal lands before anything is ejected.
     */
    it("invents no configuration over a global one it cannot read", async () => {
      const { projectDir, home } = await makeProjectAndHome();
      await writeCorruptConfig(home, SYNTAX_ERROR);
      const globalBefore = await readTreeSnapshot(home);

      const { exitCode, output } = await CLI.run(
        ["eject", "templates"],
        { dir: projectDir },
        {
          env: { HOME: home },
        },
      );

      expect(exitCode, `eject output:\n${output}`).toBe(EXIT_CODES.ERROR);
      const flattened = flattenCliOutput(output);
      expect(
        compactCliOutput(output),
        "the refusal names the GLOBAL file, not the project's absent one",
      ).toContain(compactCliOutput(configTsPath(home)));
      expect(flattened).toContain(STEP_TEXT.CONFIG_LOAD_REASON);
      expect(
        flattened,
        "nothing landed, so there is no partial apply for the ending to account for",
      ).not.toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);
      expect(
        flattened,
        "a completed-eject tick over a run that wrote nothing is the claim being withdrawn",
      ).not.toContain(STEP_TEXT.EJECT_SUCCESS);

      expect(
        await fileExists(getEjectedTemplatePath(projectDir)),
        "the refusal lands before the ejection, so no template is on disk",
      ).toBe(false);

      // The invented config would have named a marketplace read from nowhere.
      expect(
        await fileExists(configTsPath(projectDir)),
        "a config invented over an unreadable one records a marketplace nobody chose",
      ).toBe(false);
      expect(
        await readTreeSnapshot(home),
        "and the unreadable global config is not rewritten on the way past",
      ).toStrictEqual(globalBefore);
    });

    it("invents one when the same global config loads, so the refusal is not unconditional", async () => {
      const { projectDir, home } = await makeProjectAndHome();
      await writeProjectConfig(home, {
        name: "config-unreadable-global-control",
        marketplace: source.sourceDir,
      });

      const { exitCode, output } = await CLI.run(
        ["eject", "templates"],
        { dir: projectDir },
        {
          env: { HOME: home },
        },
      );

      expect(exitCode, `eject output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      expect(
        await fileExists(configTsPath(projectDir)),
        "the control must reach the write the case above refuses",
      ).toBe(true);
    });
  });
});
