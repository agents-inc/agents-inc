import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  configTsPath,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  readTestFile,
} from "../helpers/test-utils.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * D-220 — Agent-skill removal regression.
 *
 * Verifies that user-authored curation of a per-agent stack survives `cc edit`.
 * When a user hand-edits `config.ts` to remove a skill from ONE agent's stack
 * (keeping the skill in top-level `skills[]` and on other agents), subsequent
 * edits must respect the removal — the skill must not be re-derived onto the
 * curated agent from ownership/scope rules.
 *
 * Scenarios covered:
 *   A. Skill curation preserved across edits (removal from one agent's stack).
 *   B. Newly-added skill lands on its own domain's agents alone — the shared
 *      resolver's relevance rule — loaded the way the preload mapping says,
 *      while existing entries (cross-domain ones included) retain their flag.
 *   C. New agent added this session seeds from the relevance rule while
 *      existing curated agents' stacks stay byte-identical.
 *
 * Every scenario asserts BOTH the parsed `config.ts` stack AND the compiled
 * agent `.md` files under `.claude/agents/`.
 */

type StackSkillAssignment = string | { id: string; preloaded?: boolean };

/**
 * A category value is the bare assignment when the category is exclusive (it can
 * hold at most one skill, so the array wrapper carries nothing) and an array
 * otherwise — see `compactCategoryAssignments` in config-writer.ts.
 */
type Stack = Record<string, Record<string, StackSkillAssignment | StackSkillAssignment[]>>;

/**
 * Extracts the stack JSON from a CLI-written `config.ts` by finding the
 * `const stack` declaration and parsing its value. Returns the parsed stack.
 *
 * Deliberately NOT `loadConfigOrFail`: this file asserts on the writer's
 * compaction contract, which the structural loader undoes. `compactAssignment`
 * (config-writer.ts) writes `{ id, preloaded: false }` as a bare string, and
 * `normalizeAgentConfig` (stacks-loader.ts) expands it back to
 * `{ id, preloaded: false }` on load — and re-wraps an exclusive category's bare
 * value in an array. The bare assertions below (e.g.
 * `toStrictEqual("api-framework-hono")`) are therefore only observable in the
 * config.ts text as written — a structural read cannot express them.
 */
function extractStack(configContent: string): Stack {
  const marker = "const stack";
  const startIdx = configContent.indexOf(marker);
  expect(
    startIdx,
    "Expected config.ts to contain a `const stack` variable declaration after CLI edit",
  ).not.toBe(-1);

  const eqIdx = configContent.indexOf("=", startIdx);
  const braceIdx = configContent.indexOf("{", eqIdx);

  let depth = 0;
  let endIdx = braceIdx;
  for (let i = braceIdx; i < configContent.length; i++) {
    if (configContent[i] === "{") depth++;
    if (configContent[i] === "}") depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }

  const stackJson = configContent.slice(braceIdx, endIdx);
  // Boundary: JSON embedded inside a TypeScript file, parsed as data.
  return JSON.parse(stackJson) as Stack;
}

describe("stack per-agent curation survives edit", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  describe("hand-edited per-agent removal", () => {
    let tempDir: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    it(
      "preserves curated removal AND lands newly-added skill on its own domain alone",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Seed a project with two agents and a hand-curated stack.
        // `web-developer` has NO `api-api` category (user removed it) while
        // `api-developer` keeps `api-api: [api-framework-hono]`.
        // `api-framework-hono` stays in top-level `skills[]`.
        // ================================================================

        const seededStack = {
          "web-developer": {
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
            "web-testing": [{ id: E2E_SKILL.vitest.id }],
            // api-api intentionally omitted — the user hand-removed it.
          },
          "api-developer": {
            "web-framework": [{ id: E2E_SKILL.react.id }],
            "web-testing": [{ id: E2E_SKILL.vitest.id }],
            "api-api": [{ id: E2E_SKILL.hono.id, preloaded: true }],
          },
        } satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.hono.id],
          agents: ["web-developer", "api-developer"],
          domains: ["web", "api"],
          stack: seededStack,
        });
        tempDir = path.dirname(project.dir);
        const projectDir = project.dir;
        await createPermissionsFile(projectDir);

        const configPath = configTsPath(projectDir);

        // ================================================================
        // Phase 2: Run `cc edit` and add `web-state-zustand` as a new skill.
        // Navigate down to the `web-client-state` category and toggle the
        // Zustand skill on (it is present in the E2E source but not in the
        // seeded project skills).
        // ================================================================

        const wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          ...TERMINAL_SIZE.TALL,
        });

        await wizard.build.selectSkill(E2E_SKILL.zustand.display);

        // Two-domain project: use the dynamic helper (fixed-3-Enter variant
        // would overshoot and skip the Sources step).
        const sources = await wizard.build.passThroughAllDomainsGeneric();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();

        // ================================================================
        // Phase 3: Parse post-edit config.ts stack and assert behaviour.
        // ================================================================

        const configAfterEdit = await readTestFile(configPath);
        const stackAfterEdit = extractStack(configAfterEdit);

        // --- Scenario A: curated removal is preserved ---
        expect(
          stackAfterEdit["web-developer"]?.["api-api"],
          "web-developer.api-api must stay removed (user curated it out before edit)",
        ).toBeUndefined();

        // Other agent still has the skill on that category, byte-for-byte.
        // api-api is exclusive, so the preloaded entry stands alone.
        expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual({
          id: E2E_SKILL.hono.id,
          preloaded: true,
        });

        // --- Scenario B: newly-added skill lands per the relevance rule ---
        // The pair is new, so there is no saved flag to keep and the shared
        // defaults answer — in two voices, on purpose. REACH is derived from
        // the skill's taxonomy, so the web skill is placed on its own domain's
        // developer and never on the api agent. EAGERNESS is authored per
        // catalogue skill id and nothing derives it, so this marketplace's
        // namespaced id matches no row and arrives lazy by rule. A lazy entry
        // is written as the bare id, and web-client-state is exclusive, so that
        // bare id is the whole category value.
        expect(
          stackAfterEdit["web-developer"]?.["web-client-state"],
          "Newly-added web-state-zustand must appear on web-developer.web-client-state",
        ).toStrictEqual(E2E_SKILL.zustand.id);

        expect(
          stackAfterEdit["api-developer"]?.["web-client-state"],
          "Newly-added web-state-zustand must NOT cross domains to api-developer",
        ).toBeUndefined();

        // --- Scenario B (continued): a saved preloaded: true survives ---
        // The contrast that makes the lazy default above readable: eagerness has
        // a tier above the defaults, and it is the user's saved config per
        // `(skill, agent)`. These two entries were written eager before the
        // edit and stay eager through it, which is why a lazy default is
        // recoverable rather than final.
        expect(stackAfterEdit["web-developer"]?.["web-framework"]).toStrictEqual({
          id: E2E_SKILL.react.id,
          preloaded: true,
        });
        expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual({
          id: E2E_SKILL.hono.id,
          preloaded: true,
        });

        // ================================================================
        // Phase 4: Filesystem assertions — compiled agent .md files reflect
        // the per-agent stack (not a globally-regenerated version).
        // ================================================================

        // web-developer was curated to NOT have api-api. Its compiled markdown
        // must not embed the api-framework-hono skill content.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
          notContains: [E2E_SKILL.hono.id],
        });

        // api-developer keeps api-framework-hono on its stack, so its compiled
        // markdown MUST still reference the skill.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: [E2E_SKILL.hono.id],
        });

        // The newly-added web skill lands on its own domain's compiled agent
        // and stays out of the other domain's.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
          contains: [E2E_SKILL.zustand.id],
        });
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          notContains: [E2E_SKILL.zustand.id],
        });

        // Both tiers on the surface a user actually reads. The frontmatter list
        // IS the preload list, so one exact assertion carries the whole
        // distinction on one agent: the saved eager entry is in it, and the
        // zustand the line above just proved reached this agent is not.
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          exactSkills: [E2E_SKILL.react.id],
        });
      },
    );
  });

  describe("a saved entry whose skill has since changed category", () => {
    let tempDir: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    it(
      "keeps the curated entry, re-keyed to the skill's live category",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Seed a project saved before a category move. Every
        // `web-developer` entry is the user's curation; the vitest one is
        // stored under `web-tooling`, the category it sat in when the config
        // was written, while the catalog now answers `web-testing`.
        // ================================================================

        const seededStack = {
          "web-developer": {
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
            "web-tooling": [{ id: E2E_SKILL.vitest.id, preloaded: true }],
          },
          "api-developer": {
            "api-api": [{ id: E2E_SKILL.hono.id, preloaded: true }],
          },
        } satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.hono.id],
          agents: ["web-developer", "api-developer"],
          domains: ["web", "api"],
          stack: seededStack,
        });
        tempDir = path.dirname(project.dir);
        const projectDir = project.dir;
        await createPermissionsFile(projectDir);

        const configPath = configTsPath(projectDir);

        // ================================================================
        // Phase 2: An ordinary `cc edit` that adds one unrelated skill —
        // the save that used to discard the moved skill's placement.
        // ================================================================

        const wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          ...TERMINAL_SIZE.TALL,
        });

        await wizard.build.selectSkill(E2E_SKILL.zustand.display);

        const sources = await wizard.build.passThroughAllDomainsGeneric();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();

        // ================================================================
        // Phase 3: The entry survives the save, under the live category, with
        // the load the user curated.
        // ================================================================

        const configAfterEdit = await readTestFile(configPath);
        const stackAfterEdit = extractStack(configAfterEdit);

        expect(
          stackAfterEdit["web-developer"]?.["web-testing"],
          "a skill that changed category keeps its per-agent placement — the key moves, the curation does not",
        ).toStrictEqual([{ id: E2E_SKILL.vitest.id, preloaded: true }]);

        expect(
          stackAfterEdit["web-developer"]?.["web-tooling"],
          "the stale key must not survive alongside the live one",
        ).toBeUndefined();

        // Untouched entries stay exactly as they were.
        expect(stackAfterEdit["web-developer"]?.["web-framework"]).toStrictEqual({
          id: E2E_SKILL.react.id,
          preloaded: true,
        });
        expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual({
          id: E2E_SKILL.hono.id,
          preloaded: true,
        });

        // ================================================================
        // Phase 4: Filesystem assertions — the compiled agent still carries
        // the skill whose category moved.
        // ================================================================

        await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
          contains: [E2E_SKILL.vitest.id, E2E_SKILL.react.id],
        });
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: [E2E_SKILL.hono.id],
          notContains: [E2E_SKILL.vitest.id],
        });
      },
    );
  });

  describe("new agent added this session seeds from the relevance rule", () => {
    let tempDir: string | undefined;
    let globalHomeDir: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
      if (globalHomeDir) {
        await cleanupTempDir(globalHomeDir);
        globalHomeDir = undefined;
      }
    });

    it(
      "preserves curated agent byte-identical while seeding newly-selected agent",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Seed a project where only `web-developer` has a stack
        // entry. `api-developer` is present as an available agent in the
        // source but NOT yet in the project's `selectedAgents` — it will be
        // toggled on during `cc edit`.
        // ================================================================

        const curatedWebDeveloperStack = {
          "web-developer": {
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
            "web-testing": [{ id: E2E_SKILL.vitest.id }],
            // Intentionally no api-api category on web-developer.
          },
        } satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.hono.id],
          agents: ["web-developer"],
          domains: ["web", "api"],
          stack: curatedWebDeveloperStack,
        });
        tempDir = path.dirname(project.dir);
        const projectDir = project.dir;
        await createPermissionsFile(projectDir);

        const configPath = configTsPath(projectDir);

        // ================================================================
        // Phase 2: Run `cc edit` and toggle `api-developer` ON in the agents
        // step. No other changes.
        //
        // HOME must be a directory DISTINCT from projectDir. Otherwise
        // GLOBAL_INSTALL_ROOT = os.homedir() collapses onto projectDir,
        // edit.tsx sets isEditingFromGlobalScope = true, and the `s` scope
        // toggle is rejected with toast "Scope toggle unavailable in global
        // context". Pattern from e2e/commands/dual-scope.e2e.test.ts:37.
        // ================================================================

        globalHomeDir = await createTempDir();

        const wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          ...TERMINAL_SIZE.TALL,
          env: { HOME: globalHomeDir },
        });

        // Two-domain project: use the dynamic helper (fixed-3-Enter variant
        // would overshoot and skip the Sources step).
        const sources = await wizard.build.passThroughAllDomainsGeneric();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();

        // The agents step shows display names from the source ("API Developer").
        await agents.toggleAgent(E2E_AGENT_DISPLAY["api-developer"]);

        // Agents default to scope: "global" when toggled ON. A global agent
        // does not appear in the project's config.ts stack — it lives in the
        // global scope config instead. Toggle scope to project so the newly
        // selected agent is seeded into the project stack being asserted
        // below. `toggleAgent` ends with the cursor on the just-toggled agent
        // (pressSpace does not move the cursor), so the focused-agent scope
        // hotkey targets "API Developer" without an extra navigate step.
        await agents.toggleScopeOnFocusedAgent();

        const confirm = await agents.advance("edit");
        const result = await confirm.confirm();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();

        // ================================================================
        // Phase 3: Parse post-edit stack and assert.
        // ================================================================

        const configAfterEdit = await readTestFile(configPath);
        const stackAfterEdit = extractStack(configAfterEdit);

        // --- web-developer curation is preserved byte-identical ---
        // The web-framework entry is also the contrast for the newly seeded
        // agent below: it was saved eager and stays eager, because the user's
        // saved config outranks the defaults per `(skill, agent)`.
        expect(
          stackAfterEdit["web-developer"]?.["api-api"],
          "web-developer.api-api must stay absent — user's curation is authoritative",
        ).toBeUndefined();
        expect(stackAfterEdit["web-developer"]?.["web-framework"]).toStrictEqual({
          id: E2E_SKILL.react.id,
          preloaded: true,
        });
        expect(stackAfterEdit["web-developer"]?.["web-testing"]).toStrictEqual([
          E2E_SKILL.vitest.id,
        ]);

        // --- api-developer (newly selected) is seeded from the relevance rule ---
        expect(
          stackAfterEdit["api-developer"],
          "api-developer stack must be seeded when the agent is newly selected this session",
        ).toBeDefined();
        // Every triple here is new, so nothing saved outranks the defaults and
        // they decide alone — reach from the skill's taxonomy, eagerness from a
        // table authored per catalogue skill id. So the api framework reaches
        // the api agent and the two web skills never do, while the framework
        // itself arrives LAZY: it is this marketplace's skill, its namespaced id
        // is in no such table, and absence there is lazy by rule. A lazy entry
        // is the bare id, and api-api is exclusive, so it is the whole value.
        expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual(E2E_SKILL.hono.id);
        expect(
          stackAfterEdit["api-developer"]?.["web-framework"],
          "web-framework-react must NOT cross domains to the newly seeded api agent",
        ).toBeUndefined();
        expect(
          stackAfterEdit["api-developer"]?.["web-testing"],
          "web-testing-vitest must NOT cross domains to the newly seeded api agent",
        ).toBeUndefined();

        // ================================================================
        // Phase 4: Filesystem assertions.
        // ================================================================

        // web-developer's curated removal of api-api must be reflected on disk:
        // the compiled markdown must NOT embed api-framework-hono content.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
          notContains: [E2E_SKILL.hono.id],
        });

        // api-developer (newly added) contains its own domain's seeded skill
        // and none of the web ones.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: [E2E_SKILL.hono.id],
          notContains: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        });

        // Both tiers on the surface a user actually reads. The frontmatter list
        // IS the preload list: the seeded agent preloads nothing, though the
        // line above just proved hono reached it, while the curated agent's
        // saved eager entry is still in its own.
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
          noSkills: true,
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          exactSkills: [E2E_SKILL.react.id],
        });
      },
    );
  });
});
