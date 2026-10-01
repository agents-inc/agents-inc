import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { runCodex } from "../fixtures/codex.js";
import {
  codexGlobalSkillsDir,
  codexPluginCacheDir,
  codexProjectSkillsDir,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  flattenCliOutput,
  listFiles,
  renderSkillMd,
} from "../helpers/test-utils.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";

/**
 * Uninstall on Codex: it removes exactly what the install wrote, and it reports what it OBSERVED
 * rather than what it asked for.
 *
 * **The reporting half is not a nicety, because on Codex the host cannot tell you.** Re-derived on
 * the pinned 0.155.1, 2026-09-22, three runs in one `CODEX_HOME`:
 *
 * ```
 * $ codex plugin remove never-installed@<mkt> --json   # exit 0, {"pluginId":…,"name":…,"marketplaceName":…}
 * $ codex plugin remove probe-plugin@<mkt>    --json   # exit 0, the same three fields
 * $ codex plugin remove probe-plugin@<mkt>    --json   # exit 0, the same three fields again
 * ```
 *
 * A plugin that was never there, one that really went, and one removed twice are byte-identical on
 * both channels. So a count built from the list of plugins the plan NAMED is a count of intentions,
 * and it will say "Uninstalled 1 plugin" for a plugin the command did not touch. The only thing
 * that can answer is the listing taken BEFORE the removal — which is why `PluginRemovalOutcome`
 * exists on the host seam, and why this is the Claude-visible change D11(b) signs off.
 *
 * **Every claim about a removal is paired with one about a removal that happened**, in this file.
 * "0 plugins removed" is the same output a command that removed nothing at all would print, and a
 * project uninstall that swept the machine's global plugins and one that correctly swept nothing
 * differ only in what is left on the other side of the sweep.
 *
 * **`codex plugin remove` also clears caches its own `list` does not show**, so the filesystem is
 * read as well as the listing: a removal that emptied the cache but left the registration, or the
 * reverse, is a state only both reads together can see.
 *
 * Written before `codex-host.ts` and the `--provider` flag existed, and red on the unknown flag
 * until C4b built both. Green since 2026-09-22 against the pinned `@openai/codex` 0.155.1, which
 * `e2e/fixtures/codex-on-path.ts` puts on the spawned CLI's `PATH` — without that the product
 * resolves no `codex` at all and every assertion here becomes one about the developer's machine.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const PINNED_TO_PROJECT = { scope: "project" } as const;

/** A skill directory the CLI did not write, planted beside the ones it did. */
const FOREIGN_SKILL = "a-skill-this-cli-never-installed";

/** A role file the user wrote by hand beside the ones this CLI compiled — no provenance marker. */
const THEIR_OWN_ROLE = `their-own-role${FILES.CODEX_AGENT_EXTENSION}`;

/** The per-plugin line uninstall prints for each plugin it actually removed. */
function uninstalledPluginLine(ref: string): string {
  return `Uninstalled plugin '${ref}'`;
}

describe("uninstalling a Codex installation", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** Installs one globally-scoped plugin skill onto Codex and answers its marketplace ref. */
  async function installOneGlobalPlugin(target: TestEnvironment, id: string): Promise<string> {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "plugin",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode, output } = await runInitFromOnCodex(
      store,
      id,
      { dir: target.projectDir, globalHome: target.fakeHome },
      fixture.sourceDir,
    );
    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

    return buildMarketplacePluginRef(E2E_SKILL.react.id, fixture.marketplaceName);
  }

  /** What the pinned binary says is installed in this HOME, as one JSON string to search. */
  async function pluginsCodexReports(target: TestEnvironment): Promise<string> {
    const listed = await runCodex(target.fakeHome, ["plugin", "list"], target.projectDir);
    expect(listed.exitCode, listed.stderr).toBe(EXIT_CODES.SUCCESS);
    return JSON.stringify(listed.json);
  }

  it(
    "counts a plugin it really removed, and does not count one that had already gone",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const ref = await installOneGlobalPlugin(env, "CdxUnObs");

      // Out of band, with Codex's own binary: the registration goes, the CLI's config still names
      // it, and nothing about the next command's inputs changes. This is the ordinary case — a
      // user who ran `codex plugin remove` themselves — not a contrived one.
      const removedOutOfBand = await runCodex(
        env.fakeHome,
        ["plugin", "remove", ref],
        env.fakeHome,
      );
      expect(removedOutOfBand.exitCode, removedOutOfBand.stderr).toBe(EXIT_CODES.SUCCESS);
      expect(await pluginsCodexReports(env)).not.toContain(ref);

      const uninstalled = await CLI.run(["uninstall", "--yes"], {
        dir: env.fakeHome,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(uninstalled.output);

      expect(uninstalled.exitCode, said).toBe(EXIT_CODES.SUCCESS);
      // It must not claim a removal it did not make. `codex plugin remove` exits 0 and prints the
      // same document either way, so a command that believes its own request says the opposite.
      //
      // Both negatives and no positive, deliberately: whether a run that observed nothing prints
      // `Uninstalled 0 plugins` or skips the section entirely is the implementer's call, and both
      // are truthful. What is not truthful is either line below. The test beside this one is what
      // stops the pair being satisfied by a command that reports no removal ever.
      expect(said).not.toContain(uninstalledPluginLine(ref));
      expect(said).not.toContain("Uninstalled 1 plugin");
    },
  );

  it(
    "counts the same plugin when it is the one doing the removing",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const ref = await installOneGlobalPlugin(env, "CdxUnCnt");

      // Subject guard for the test above as much as for this one: the plugin really was
      // registered before the uninstall, so "0" there was an observation and not the only answer
      // this path can produce.
      expect(await pluginsCodexReports(env)).toContain(ref);

      // The staged copy, before the removal. Measured on 0.155.1: the cache is nested
      // `<CODEX_HOME>/plugins/cache/<marketplace>/<plugin>/<version>`, so the plugin's own name
      // is one level BELOW the directory the cache root lists — a listing of the root can never
      // carry it, installed or not, and asserting its absence there says nothing at all.
      const stagedByMarketplace = path.join(
        codexPluginCacheDir(env.fakeHome),
        fixture.marketplaceName,
      );
      expect(await listFiles(stagedByMarketplace)).toContain(E2E_SKILL.react.id);

      const uninstalled = await CLI.run(["uninstall", "--yes"], {
        dir: env.fakeHome,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(uninstalled.output);

      expect(uninstalled.exitCode, said).toBe(EXIT_CODES.SUCCESS);
      expect(said).toContain(uninstalledPluginLine(ref));
      expect(said).toContain("Uninstalled 1 plugin");

      // Both reads, because `plugin remove` clears caches the listing does not show: a run that
      // dropped the registration and left the staged files, or the reverse, satisfies one alone.
      expect(await pluginsCodexReports(env)).not.toContain(ref);
      expect(await directoryExists(codexPluginCacheDir(env.fakeHome))).toBe(true);
      expect(await listFiles(stagedByMarketplace)).not.toContain(E2E_SKILL.react.id);
    },
  );

  it(
    "removes no plugin on a PROJECT uninstall, and removes it on a global one",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      const ref = await installOneGlobalPlugin(env, "CdxUnPrj");

      // Codex installs plugins for a machine, never for one project. A project uninstall that
      // asked Codex's user-wide list would take every global plugin away from every project on
      // the machine — the one operation in this step that can destroy work nobody asked about.
      const project = await CLI.run(["uninstall", "--yes"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });
      const saidByProject = flattenCliOutput(project.output);
      expect(project.exitCode, saidByProject).toBe(EXIT_CODES.SUCCESS);
      expect(saidByProject).not.toContain(uninstalledPluginLine(ref));
      expect(await pluginsCodexReports(env)).toContain(ref);

      const global = await CLI.run(["uninstall", "--yes"], {
        dir: env.fakeHome,
        globalHome: env.fakeHome,
      });
      const saidByGlobal = flattenCliOutput(global.output);
      expect(global.exitCode, saidByGlobal).toBe(EXIT_CODES.SUCCESS);
      expect(saidByGlobal).toContain(uninstalledPluginLine(ref));
      expect(await pluginsCodexReports(env)).not.toContain(ref);
    },
  );

  it(
    "removes exactly the ejected skills it wrote, at both Codex roots, and leaves a stranger alone",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish(
        "CdxUnEjc",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [E2E_SKILL.vitest.id]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: PINNED_TO_PROJECT },
        }),
      );

      const installed = await runInitFromOnCodex(
        store,
        "CdxUnEjc",
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

      // A skill the CLI never installed, in each root it is about to sweep. `$CODEX_HOME/skills`
      // is shared with whatever the user put there and with Codex's own `.system` bundle, and
      // `<repo>/.agents/skills` is a committed directory of the user's repository — a sweep that
      // removes the directory rather than its own entries destroys both.
      const globalSkills = codexGlobalSkillsDir(env.fakeHome);
      const projectSkills = codexProjectSkillsDir(env.projectDir);
      for (const root of [globalSkills, projectSkills]) {
        await mkdir(path.join(root, FOREIGN_SKILL), { recursive: true });
        await writeFile(
          path.join(root, FOREIGN_SKILL, FILES.SKILL_MD),
          renderSkillMd(FOREIGN_SKILL, "A skill its author wrote by hand"),
        );
      }

      const uninstalled = await CLI.run(["uninstall", "--yes"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });
      expect(uninstalled.exitCode, flattenCliOutput(uninstalled.output)).toBe(EXIT_CODES.SUCCESS);

      // The project's own skill goes; the stranger beside it stays.
      expect(await listFiles(projectSkills)).toStrictEqual([FOREIGN_SKILL]);
      // A PROJECT uninstall leaves the global scope's rows where they are — members, not a count,
      // because a count cannot tell a removal from a swap.
      expect((await listFiles(globalSkills)).sort()).toStrictEqual(
        [FOREIGN_SKILL, E2E_SKILL.react.id].sort(),
      );
    },
  );
  it(
    "removes the role files it compiled, and leaves one the user wrote beside them",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // CLI-896: the lister globbed `*.md` and read Claude's marker, so on Codex it found no
      // compiled agent at all — the roles survived while the output said they were removed.
      env = await createTestEnvironment({ permissions: false });
      await installOneGlobalPlugin(env, "CdxUnRol");

      const roles = path.join(env.projectDir, DIRS.CODEX, DIRS.AGENTS);
      const compiledRole = `${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`;
      // Subject guard: the install really wrote the role, so its absence below is a removal.
      expect(await listFiles(roles)).toContain(compiledRole);
      await writeFile(path.join(roles, THEIR_OWN_ROLE), 'name = "their-own-role"\n');

      const uninstalled = await CLI.run(["uninstall", "--yes"], {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });
      expect(uninstalled.exitCode, flattenCliOutput(uninstalled.output)).toBe(EXIT_CODES.SUCCESS);

      expect(await listFiles(roles)).toStrictEqual([THEIR_OWN_ROLE]);
    },
  );
});
