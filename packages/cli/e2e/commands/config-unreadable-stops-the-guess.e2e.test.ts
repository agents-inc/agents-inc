import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  ensureBinaryExists,
  fileExists,
  getEjectedTemplatePath,
  readTreeSnapshot,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * A settings config that EXISTS and cannot be evaluated stops the commands that would otherwise
 * guess past it (owner ruling 2026-08-20).
 *
 * This is the SOURCE-config reader — `loadProjectSourceConfig` / `loadGlobalSourceConfig` in
 * `lib/configuration/config.ts` — and not the full-config reader the four `*-corrupt-config`
 * specs already cover. The distinction is the whole reason this file exists: `edit`, `init`,
 * `compile` and `uninstall` refuse an unreadable config at `BaseCommand.ensureConfigReadable`,
 * which reads `loadProjectConfigFromDir`. The commands here reach NEITHER of those guards, so
 * until the ruling landed they read a file they could not evaluate as a file that was not there
 * — and a `null` at that rung means "no marketplace named", which falls through to the public
 * catalogue. A config naming a private marketplace therefore produced answers out of a
 * marketplace nobody had chosen, with nothing anywhere saying so.
 *
 * **Each refusal is paired with the same command succeeding**, in this file rather than in a
 * neighbouring one. A refusal pinned alone cannot tell a correctly-scoped guard from one that
 * has swallowed its whole domain: both leave the tree byte-identical, and `search` refusing
 * EVERYTHING would satisfy every assertion under the refusal cases below.
 */

/** A genuine TypeScript syntax error — the loader throws while evaluating the file. */
const SYNTAX_ERROR = `export default {{{ not valid typescript`;

/** The skill the E2E source carries, used as the query so a served answer is recognisable. */
const QUERY = E2E_SKILL.react.slug;

describe("a settings config that exists and cannot be evaluated", () => {
  let source: E2ESource;
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
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

  /**
   * A project directory and a HOME beside it, each free to hold a config or not.
   *
   * The two are kept apart deliberately: at the home root the file this reader loads IS the
   * global config, so a fixture that let them collapse could not say which of the two a
   * refusal came from.
   */
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
      expect(flattened, "the refusal names the file it could not evaluate").toContain(
        configTsPath(projectDir),
      );
      expect(flattened, "and the loader's own reason for it").toContain(
        STEP_TEXT.CONFIG_LOAD_REASON,
      );
      expect(flattened, "with the one way out that works on a config nothing can read").toContain(
        STEP_TEXT.CONFIG_UNREADABLE_RECREATE,
      );

      // The discriminating negative, and the whole defect: the public catalogue carries a React
      // skill under this slug too, so a run that walked past the unreadable config would print a
      // perfectly ordinary answer. The display title is the fixture's own, which is what
      // separates "answered from the wrong marketplace" from "answered from no marketplace".
      expect(output).not.toContain(E2E_SKILL.react.display);
      expect(output).not.toContain(E2E_SKILL.react.id);

      // Surfaces 1, 3 and 4 in the negative form: a command that refuses to read a file must
      // not write one either, and `readTreeSnapshot` carries mtime beside content, so a rewrite
      // producing identical bytes is still visible here.
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
     * `eject` reaches this reader through `ensureMinimalConfig`, which invents a `config.ts` for
     * a project that has none so a later `compile` has something to read. The marketplace it
     * records comes from `resolveSource`, which — with no project config — is answering out of
     * the GLOBAL one. That is the reachable half of the eject ruling: the project has no config
     * to be unreadable, so the file the refusal is about is always the global one.
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

      // The templates are already on disk by the time this refusal fires, so the code says a
      // partial apply rather than a refusal: `ERROR` tells the caller nothing landed and the run
      // can be repeated, which is the wrong instruction for a tree that now holds an ejection.
      expect(exitCode, `eject output:\n${output}`).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
      const flattened = flattenCliOutput(output);
      expect(
        flattened,
        "the refusal names the GLOBAL file, not the project's absent one",
      ).toContain(configTsPath(home));
      expect(flattened).toContain(STEP_TEXT.CONFIG_LOAD_REASON);
      expect(flattened, "and the ending says what did not happen, once, at the end").toContain(
        STEP_TEXT.COMPLETED_WITH_FAILURES,
      );
      expect(
        flattened,
        "a completed-eject tick over a config that was never written is the claim being withdrawn",
      ).not.toContain(STEP_TEXT.EJECT_SUCCESS);

      // What the exit code is now about: the ejection this run was asked for DID land, which is
      // the whole difference between this ending and the refusal it used to be reported as.
      expect(
        await fileExists(getEjectedTemplatePath(projectDir)),
        "the template the command was asked for is on disk before the config step is reached",
      ).toBe(true);

      // The subject of the ruling: the invented config would have named a marketplace read from
      // nowhere, and it is exactly what must not appear.
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
