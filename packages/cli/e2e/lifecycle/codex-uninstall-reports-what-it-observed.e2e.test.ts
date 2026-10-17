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
 * Uninstall on Codex removes exactly what the install wrote and reports what it OBSERVED: `codex
 * plugin remove` exits 0 with the same output whether or not anything was removed, so the count
 * comes from the listing taken before. Filesystem and listing are both read.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const PINNED_TO_PROJECT = { scope: "project" } as const;

const FOREIGN_SKILL = "a-skill-this-cli-never-installed";

/** Hand-written, with no provenance marker. */
const THEIR_OWN_ROLE = `their-own-role${FILES.CODEX_AGENT_EXTENSION}`;

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

      // Removed out of band with Codex's own binary, as a user might.
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
      // Both negatives, no positive: printing `Uninstalled 0 plugins` or nothing are both truthful.
      // The next test stops a command that never reports a removal from passing.
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

      // Subject guard: registered before, so the "0" above was an observation.
      expect(await pluginsCodexReports(env)).toContain(ref);

      // The cache nests `<marketplace>/<plugin>/<version>`, so the plugin is one level below.
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

      // Both reads: `plugin remove` clears caches the listing does not show.
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

      // Codex plugins are machine-wide; a project uninstall must not take them from every project.
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

      // Both skills roots are shared with the user: a sweep removes its entries, not the dir.
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

      expect(await listFiles(projectSkills)).toStrictEqual([FOREIGN_SKILL]);
      // A project uninstall leaves the global rows.
      expect((await listFiles(globalSkills)).sort()).toStrictEqual(
        [FOREIGN_SKILL, E2E_SKILL.react.id].sort(),
      );
    },
  );
  it(
    "removes the role files it compiled, and leaves one the user wrote beside them",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // On Codex the lister must find `.toml` roles, not Claude's `*.md`.
      env = await createTestEnvironment({ permissions: false });
      await installOneGlobalPlugin(env, "CdxUnRol");

      const roles = path.join(env.projectDir, DIRS.CODEX, DIRS.AGENTS);
      const compiledRole = `${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`;
      // Subject guard: the install really wrote the role.
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
