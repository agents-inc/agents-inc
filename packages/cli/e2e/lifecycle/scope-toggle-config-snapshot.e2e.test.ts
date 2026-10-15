import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { TIMEOUTS, FILES } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  DUAL_SCOPE,
  applyFromSeed,
  e2eStackPayload,
  installE2EStackDualScope,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  fileExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readSkillEntries } from "../fixtures/dual-scope-helpers.js";

/**
 * Scope toggle config snapshot E2E test.
 *
 * Verifies exact config state before and after scope changes, ensuring that
 * changing a skill's or agent's scope correctly updates the config files at
 * both global and project scopes.
 */

const API_DEV = E2E_AGENT["api-developer"].name;
const WEB_DEV = E2E_AGENT["web-developer"].name;

describe("scope toggle config snapshot", () => {
  let store: SeedConfigStore;
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await installE2EStackDualScope(store, { fakeHome, projectDir });
  }, TIMEOUTS.LIFECYCLE);

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  /** Applies `payload` from the project. */
  function editFromProject(id: string, payload: ReturnType<typeof e2eStackPayload>) {
    return applyFromSeed(store, id, payload, { dir: projectDir, home: fakeHome });
  }

  it(
    "G->P skill scope change should add skill to project config and preserve global config",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      // ACTION: web-framework-react G->P. A project skill never reaches the global
      // web-developer, so the project's React is assigned to no sub-agent.
      await editFromProject(
        "ReactProject1",
        e2eStackPayload({
          ...DUAL_SCOPE,
          projectSkills: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
          unassigned: [E2E_SKILL.react.id],
        }),
      );

      // AFTER assertions

      // Proof of execution: the G->P change must have rewritten the project config.
      const projectConfigAfter = await readTestFile(configTsPath(projectDir));
      expect(projectConfigAfter, "project config.ts must record the G->P change").not.toBe(
        projectConfigBefore,
      );

      // The three grep-style `lines.length > 0` presence checks that stood here are
      // replaced by structural reads. A line count says a matching line exists
      // SOMEWHERE; `toStrictEqual` on the entry list says which entries exist and
      // that no fourth one joined them — the shape the rest of this file uses.
      expect(await readSkillEntries(projectDir, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
      ]);
      expect(await readSkillEntries(projectDir, E2E_SKILL.hono.id)).toStrictEqual([
        { id: E2E_SKILL.hono.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.hono.id, scope: "project", origin: "eject" },
      ]);
      expect(await readSkillEntries(fakeHome, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
      ]);

      // Global config must be byte-identical (G->P should not modify global config).
      // Byte equality subsumes the id-by-id comparison a line scan over the same text
      // used to make here, and it is a claim about the config rather than about how
      // the writer happened to break its lines.
      expect(
        await readTestFile(configTsPath(fakeHome)),
        "a G->P change is a project-scope edit and may not rewrite the global config",
      ).toBe(globalConfigBefore);

      // Project .claude/skills/web-framework-react/SKILL.md exists
      const projectSkillMdPath = path.join(
        skillsPath(projectDir),
        E2E_SKILL.react.id,
        FILES.SKILL_MD,
      );
      expect(
        await fileExists(projectSkillMdPath),
        "SKILL.md must exist in project skills/web-framework-react/",
      ).toBe(true);

      // Global .claude/skills/web-framework-react/SKILL.md still exists (G->P is additive)
      const globalSkillMdPath = path.join(skillsPath(fakeHome), E2E_SKILL.react.id, FILES.SKILL_MD);
      expect(
        await fileExists(globalSkillMdPath),
        "SKILL.md must still exist in global skills/web-framework-react/ (G->P is additive)",
      ).toBe(true);
    },
  );

  it(
    "collapsing a persisted dual-scope skill to its global half changes only the project config",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // api-framework-hono is a persisted dual-scope [P][G] pair carried by the project
      // api-developer: naming it at global scope only collapses the pair to its global half.
      // Only the PROJECT config may change — the global config is not a project-scope
      // edit's to rewrite.

      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      await editFromProject("HonoGlobal1", e2eStackPayload({ projectAgents: [API_DEV] }));

      // AFTER assertions — the project config lost the pair, the global one is untouched

      const projectConfigAfter = await readTestFile(configTsPath(projectDir));
      expect(projectConfigAfter, "project config.ts must record the collapsed pair").not.toBe(
        projectConfigBefore,
      );
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the collapse must leave the inherited-global entry alone — no project entry, no tombstone",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "global", origin: "eject" }]);

      const globalConfigAfter = await readTestFile(configTsPath(fakeHome));
      expect(globalConfigAfter, "global config.ts must be unchanged by a project-scope edit").toBe(
        globalConfigBefore,
      );

      // The project override is gone; the global install survives.
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must be removed from project scope after the collapse",
      ).toBe(false);

      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.hono.id);
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope (P→G leaves the global install intact)",
      ).toBe(true);
    },
  );

  it(
    "G->P agent scope change should compile agent at project scope and preserve global",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      // ACTION: web-developer G->P
      await editFromProject(
        "WebDevProject1",
        e2eStackPayload({ ...DUAL_SCOPE, projectAgents: [API_DEV, WEB_DEV] }),
      );

      // AFTER assertions

      // web-developer.md exists at project .claude/agents/
      const projectAgentPath = path.join(agentsPath(projectDir), "web-developer.md");
      expect(
        await fileExists(projectAgentPath),
        "web-developer.md must exist in project agents dir after G->P",
      ).toBe(true);

      // web-developer.md STILL exists at global .claude/agents/ (G->P additive)
      const globalAgentPath = path.join(agentsPath(fakeHome), "web-developer.md");
      expect(
        await fileExists(globalAgentPath),
        "web-developer.md must still exist in global agents dir (G->P is additive)",
      ).toBe(true);

      // Proof of execution: the G->P change must have rewritten the project config.
      // Without this the `toContain` below passes on the pre-change config, which
      // already named web-developer as a global-scoped agent.
      const projectConfigAfter = await readTestFile(configTsPath(projectDir));
      expect(projectConfigAfter, "project config.ts must record the G->P change").not.toBe(
        projectConfigBefore,
      );

      // Project config contains web-developer agent
      expect(projectConfigAfter).toContain("web-developer");

      // Global config STILL contains web-developer agent (immutable) — a
      // project-scope edit is no licence to rewrite global config.
      const globalConfigAfter = await readTestFile(configTsPath(fakeHome));
      expect(globalConfigAfter, "global config.ts must be unchanged by a project-scope edit").toBe(
        globalConfigBefore,
      );
      expect(globalConfigAfter).toContain("web-developer");
    },
  );
});
