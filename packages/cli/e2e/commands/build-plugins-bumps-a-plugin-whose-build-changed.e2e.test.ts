import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  createE2ESource,
  fileExists,
  readPluginVersions,
  type E2ESource,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";

/**
 * A plugin's version follows what its build ships, not only its source. Phases run in order over
 * one source directory, whose source no phase changes: a rebuild that ships other files than the
 * build before it takes a new version, and only that plugin moves.
 */

const INITIAL_VERSION = "1.0.0";
const BUMPED_VERSION = "2.0.0";

/** Its earlier build shipped an example no build produces now, as builds did before they pruned. */
const ORPHANED_SKILL_ID = E2E_SKILL.react.id;
/** Its earlier build shipped a SKILL.md the build no longer reproduces. */
const ALTERED_SKILL_ID = E2E_SKILL.hono.id;

const SHIPPED_BY_AN_EARLIER_BUILD = "# Shipped by an earlier build";

const ALL_AT_INITIAL_VERSION: Record<string, string> = Object.fromEntries(
  E2E_SKILL_IDS.map((id) => [id, INITIAL_VERSION]),
);

const AFTER_THE_BUILD_CHANGED: Record<string, string> = {
  ...ALL_AT_INITIAL_VERSION,
  [ORPHANED_SKILL_ID]: BUMPED_VERSION,
  [ALTERED_SKILL_ID]: BUMPED_VERSION,
};

describe("build plugins over earlier builds that shipped other files than this build does", () => {
  let source: E2ESource;
  let pluginsDir: string;
  let orphanPath: string;
  let alteredSkillMdPath: string;
  let builtSkillMd: string;

  beforeAll(async () => {
    source = await createE2ESource({ unbuilt: true });
    pluginsDir = path.join(source.sourceDir, SOURCE_PATHS.PLUGINS_DIST);
    orphanPath = path.join(
      pluginsDir,
      ORPHANED_SKILL_ID,
      DIRS.SKILLS,
      ORPHANED_SKILL_ID,
      DIRS.EXAMPLES,
      "orphan.md",
    );
    alteredSkillMdPath = path.join(
      pluginsDir,
      ALTERED_SKILL_ID,
      DIRS.SKILLS,
      ALTERED_SKILL_ID,
      FILES.SKILL_MD,
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  describe("first build", () => {
    let result: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      result = await CLI.run(["build", "plugins"], { dir: source.sourceDir });
      builtSkillMd = await readFile(alteredSkillMdPath, "utf-8");
    }, TIMEOUTS.SETUP);

    it("writes every plugin at the initial version", async () => {
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(await readPluginVersions(pluginsDir, E2E_SKILL_IDS)).toStrictEqual(
        ALL_AT_INITIAL_VERSION,
      );
    });
  });

  describe("rebuild over two earlier builds that shipped other files", () => {
    let result: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      await mkdir(path.dirname(orphanPath), { recursive: true });
      await writeFile(orphanPath, SHIPPED_BY_AN_EARLIER_BUILD);
      await writeFile(alteredSkillMdPath, `${builtSkillMd}\n${SHIPPED_BY_AN_EARLIER_BUILD}\n`);
      result = await CLI.run(["build", "plugins"], { dir: source.sourceDir });
    }, TIMEOUTS.SETUP);

    it("ships what the source builds now", async () => {
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(await fileExists(orphanPath), "the earlier build's orphan must be gone").toBe(false);
      expect(await readFile(alteredSkillMdPath, "utf-8")).toBe(builtSkillMd);
    });

    it("bumps exactly the two plugins whose shipped files changed", async () => {
      expect(
        await readPluginVersions(pluginsDir, E2E_SKILL_IDS),
        "a plugin that ships other files than its earlier build must take a new version",
      ).toStrictEqual(AFTER_THE_BUILD_CHANGED);
    });

    it("reports the bumped versions in the compilation summary", () => {
      expect(result.output).toContain(`${ORPHANED_SKILL_ID} (v${BUMPED_VERSION})`);
      expect(result.output).toContain(`${ALTERED_SKILL_ID} (v${BUMPED_VERSION})`);
    });
  });

  describe("rebuild with nothing changed since", () => {
    let result: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      result = await CLI.run(["build", "plugins"], { dir: source.sourceDir });
    }, TIMEOUTS.SETUP);

    it("keeps every version, the bumped ones included", async () => {
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(
        await readPluginVersions(pluginsDir, E2E_SKILL_IDS),
        "a rebuild that ships what the build before it shipped must not bump anything",
      ).toStrictEqual(AFTER_THE_BUILD_CHANGED);
    });
  });
});
