import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectNoDuplicates } from "../assertions/config-assertions.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * Re-edit / multiple edit cycle E2E tests.
 *
 * Verifies that running `edit --from` multiple times on the same installation
 * does not corrupt the config: no duplicate skills, agents, or domains
 * accumulate across edits.
 */

/**
 * Structurally loads a config.ts and returns its skill IDs, agent names, and
 * domains for duplicate detection and structural comparison.
 */
async function readConfigArrays(projectDir: string): Promise<{
  skillIds: string[];
  agentNames: string[];
  domains: string[];
}> {
  const config = await loadConfigOrFail(projectDir);
  return {
    skillIds: config.skills.map((sc) => sc.id),
    agentNames: config.agents.map((agent) => agent.name),
    domains: config.selectedDomains ?? [],
  };
}

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** React on a project web-developer, plus Vitest — what the second describe's first edit adds. */
const REACT_AND_VITEST = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      scope: "project",
      assignments: { [WEB_DEV]: "preloaded" },
    }),
    [E2E_SKILL.vitest.id]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
  },
  agents: { [WEB_DEV]: { scope: "project" } },
});

describe("re-edit cycles: config stability across multiple edits", () => {
  let store: SeedConfigStore;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  describe("idempotent no-change edits", () => {
    let tempDir: string | undefined;
    let sharedHome: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
      if (sharedHome) {
        await cleanupTempDir(sharedHome);
        sharedHome = undefined;
      }
    });

    it(
      "should preserve config across init -> edit -> edit without changes",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = tempDir;

        // Default-scope content is GLOBAL, so compiled agents land in HOME rather
        // than projectDir. Thread ONE shared HOME through all three runs so each
        // edit sees the init's global content; config.ts stays under projectDir.
        sharedHome = await createTempDir();
        const globalProject = { dir: sharedHome };
        const site = { dir: projectDir, home: sharedHome };
        const stack = e2eStackPayload();

        // ================================================================
        // Phase 1: Init
        // ================================================================

        await installFromSeed(store, "Stacked1", stack, site);

        // --- Phase 1 verification ---
        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          origin: "eject",
        });
        await expect(globalProject).toHaveCompiledAgent("web-developer");
        await expect(globalProject).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect(globalProject).toHaveAgentFrontmatter("web-developer", {
          skills: [E2E_SKILL.react.id],
        });

        const initArrays = await readConfigArrays(projectDir);
        expectNoDuplicates(initArrays.skillIds, "skills after init");
        expectNoDuplicates(initArrays.agentNames, "agents after init");
        expectNoDuplicates(initArrays.domains, "domains after init");

        // ================================================================
        // Phase 2: First edit -- navigate through without changes
        // ================================================================

        await applyFromSeed(store, "Stacked1", stack, site);

        // --- Phase 2 verification ---
        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          origin: "eject",
        });
        await expect(globalProject).toHaveCompiledAgent("web-developer");
        await expect(globalProject).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect(globalProject).toHaveAgentFrontmatter("web-developer", {
          skills: [E2E_SKILL.react.id],
        });

        const edit1Arrays = await readConfigArrays(projectDir);

        expectNoDuplicates(edit1Arrays.skillIds, "skills after first edit");
        expectNoDuplicates(edit1Arrays.agentNames, "agents after first edit");
        expectNoDuplicates(edit1Arrays.domains, "domains after first edit");

        expect(edit1Arrays.skillIds.sort()).toStrictEqual(initArrays.skillIds.sort());

        // ================================================================
        // Phase 3: Second edit -- navigate through without changes again
        // ================================================================

        await applyFromSeed(store, "Stacked1", stack, site);

        // --- Phase 3 verification ---
        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          origin: "eject",
        });
        await expect(globalProject).toHaveCompiledAgent("web-developer");
        await expect(globalProject).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect(globalProject).toHaveAgentFrontmatter("web-developer", {
          skills: [E2E_SKILL.react.id],
        });

        const edit2Arrays = await readConfigArrays(projectDir);

        expectNoDuplicates(edit2Arrays.skillIds, "skills after second edit");
        expectNoDuplicates(edit2Arrays.agentNames, "agents after second edit");
        expectNoDuplicates(edit2Arrays.domains, "domains after second edit");

        // CRITICAL: No accumulation between consecutive edits.
        expect(edit2Arrays.skillIds.sort()).toStrictEqual(edit1Arrays.skillIds.sort());
        expect(edit2Arrays.agentNames.sort()).toStrictEqual(edit1Arrays.agentNames.sort());
        expect(edit2Arrays.domains.sort()).toStrictEqual(edit1Arrays.domains.sort());

        // The three length comparisons that stood here are dropped: they follow the
        // `toStrictEqual`s above on the same sorted arrays, so they can only pass
        // when those already have — a length check adds no information after an
        // equality check on the same value.
      },
    );
  });

  describe("edit with skill addition persists across cycles", () => {
    let tempDir: string | undefined;
    let sharedHome: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
      if (sharedHome) {
        await cleanupTempDir(sharedHome);
        sharedHome = undefined;
      }
    });

    it(
      "should retain added skill across subsequent no-change edit",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Create project with limited skills (single domain, one skill)
        // ================================================================

        const project = await ProjectBuilder.editable({
          marketplace: E2E_SOURCE.sourceDir,
          skills: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          domains: ["web"],
          stack: {
            "web-developer": {
              "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
            },
          },
        });
        tempDir = path.dirname(project.dir);
        const projectDir = project.dir;

        await createPermissionsFile(projectDir);

        // This project is PROJECT-scoped (ProjectBuilder.editable), so its
        // compiled agents and config both stay under projectDir — every
        // assertion below reads projectDir. A shared HOME is still threaded
        // through both edits so they resolve HOME identically; it holds no
        // content here.
        sharedHome = await createTempDir();
        const site = { dir: projectDir, home: sharedHome };

        // Verify initial state via matcher and detailed parsing
        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          origin: "eject",
        });
        const beforeArrays = await readConfigArrays(projectDir);

        // ================================================================
        // Phase 2: First edit -- add a skill
        // ================================================================

        const edit1Result = await applyFromSeed(store, "AddVitest1", REACT_AND_VITEST, site);

        // --- Phase 2 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: edit1Result.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            agents: ["web-developer"],
            origin: "eject",
          },
        );
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: [E2E_SKILL.react.id],
        });

        const addArrays = await readConfigArrays(projectDir);

        // The set difference, not a floor: `>= beforeArrays.skillIds.length` was
        // satisfied by an edit that removed one skill and added two, and by one that
        // changed nothing at all.
        expect(
          beforeArrays.skillIds.filter((id) => !addArrays.skillIds.includes(id)),
          "an edit that adds a skill must remove none",
        ).toStrictEqual([]);
        expectNoDuplicates(addArrays.skillIds, "skills after adding");
        expectNoDuplicates(addArrays.agentNames, "agents after adding");

        expect(addArrays.skillIds).toContain(E2E_SKILL.react.id);

        const addedSkillIds = addArrays.skillIds.filter(
          (id) => !beforeArrays.skillIds.includes(id),
        );

        // ================================================================
        // Phase 3: Second edit -- navigate through without changes
        // ================================================================

        const edit2Result = await applyFromSeed(store, "AddVitest1", REACT_AND_VITEST, site);

        // --- Phase 3 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: edit2Result.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            agents: ["web-developer"],
            origin: "eject",
          },
        );
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: [E2E_SKILL.react.id],
        });

        const noChangeArrays = await readConfigArrays(projectDir);

        expectNoDuplicates(noChangeArrays.skillIds, "skills after no-change edit");
        expectNoDuplicates(noChangeArrays.agentNames, "agents after no-change edit");
        expectNoDuplicates(noChangeArrays.domains, "domains after no-change edit");

        // CRITICAL: No accumulation between consecutive edits.
        expect(noChangeArrays.skillIds.sort()).toStrictEqual(addArrays.skillIds.sort());

        for (const addedId of addedSkillIds) {
          expect(noChangeArrays.skillIds).toContain(addedId);
        }

        expect(noChangeArrays.skillIds).toContain(E2E_SKILL.react.id);
      },
    );
  });
});
