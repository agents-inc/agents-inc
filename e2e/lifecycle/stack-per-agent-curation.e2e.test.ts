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
import type { AgentName, StackAgentConfig } from "../../src/cli/types/index.js";

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
 *   B. Newly-added skill fans out to every existing agent (with preloaded: false)
 *      while existing preloaded: true entries retain their flag.
 *   C. New agent added this session seeds from ownership defaults while
 *      existing curated agents' stacks stay byte-identical.
 *
 * Every scenario asserts BOTH the parsed `config.ts` stack AND the compiled
 * agent `.md` files under `.claude/agents/`.
 */

type StackSkillAssignment = string | { id: string; preloaded?: boolean };

type Stack = Record<string, Record<string, StackSkillAssignment[]>>;

/**
 * Extracts the stack JSON from a CLI-written `config.ts` by finding the
 * `const stack` declaration and parsing its value. Returns the parsed stack.
 *
 * Deliberately NOT `loadConfigOrFail`: this file asserts on the writer's
 * compaction contract, which the structural loader undoes. `compactAssignment`
 * (config-writer.ts) writes `{ id, preloaded: false }` as a bare string, and
 * `normalizeAgentConfig` (stacks-loader.ts) expands it back to
 * `{ id, preloaded: false }` on load. The bare-string assertions below (e.g.
 * `toStrictEqual(["api-framework-hono"])`) are therefore only observable in the
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

/**
 * Looks up a skill assignment entry (preserving preloaded flag) for a given
 * (agent, category, skillId) triple. Returns undefined when the category is
 * missing from the agent or the skill is not in that category.
 */
function findAssignment(
  stack: Stack,
  agent: string,
  category: string,
  skillId: string,
): StackSkillAssignment | undefined {
  const agentStack = stack[agent];
  if (!agentStack) return undefined;
  const assignments = agentStack[category];
  if (!assignments) return undefined;
  return assignments.find((a) => (typeof a === "string" ? a === skillId : a.id === skillId));
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
      "preserves curated removal AND fans out newly-added skill across agents",
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
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-testing": [{ id: "web-testing-vitest" }],
            // api-api intentionally omitted — the user hand-removed it.
          },
          "api-developer": {
            "web-framework": [{ id: "web-framework-react" }],
            "web-testing": [{ id: "web-testing-vitest" }],
            "api-api": [{ id: "api-framework-hono", preloaded: true }],
          },
        } satisfies Partial<Record<AgentName, StackAgentConfig>>;

        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react", "web-testing-vitest", "api-framework-hono"],
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

        await wizard.build.selectSkill(E2E_SKILL.zustand.id);

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
        expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual([
          { id: "api-framework-hono", preloaded: true },
        ]);

        // --- Scenario B: newly-added skill fans out with preloaded: false ---
        const webDeveloperZustand = findAssignment(
          stackAfterEdit,
          "web-developer",
          "web-client-state",
          "web-state-zustand",
        );
        expect(
          webDeveloperZustand,
          "Newly-added web-state-zustand must appear on web-developer.web-client-state",
        ).toBeDefined();

        const apiDeveloperZustand = findAssignment(
          stackAfterEdit,
          "api-developer",
          "web-client-state",
          "web-state-zustand",
        );
        expect(
          apiDeveloperZustand,
          "Newly-added web-state-zustand must fan out to api-developer.web-client-state",
        ).toBeDefined();

        // Newly-added entries default to preloaded: false. The CLI compacts
        // `{id, preloaded: false}` to a bare string, so the assignment is the
        // bare skill id string.
        expect(webDeveloperZustand).toStrictEqual("web-state-zustand");
        expect(apiDeveloperZustand).toStrictEqual("web-state-zustand");

        // --- Scenario B (continued): existing preloaded: true survives ---
        expect(stackAfterEdit["web-developer"]?.["web-framework"]).toStrictEqual([
          { id: "web-framework-react", preloaded: true },
        ]);
        expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual([
          { id: "api-framework-hono", preloaded: true },
        ]);

        // ================================================================
        // Phase 4: Filesystem assertions — compiled agent .md files reflect
        // the per-agent stack (not a globally-regenerated version).
        // ================================================================

        // web-developer was curated to NOT have api-api. Its compiled markdown
        // must not embed the api-framework-hono skill content.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
          notContains: ["api-framework-hono"],
        });

        // api-developer keeps api-framework-hono on its stack, so its compiled
        // markdown MUST still reference the skill.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: ["api-framework-hono"],
        });

        // The newly-added skill must land on every compiled agent (fanout).
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
          contains: ["web-state-zustand"],
        });
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: ["web-state-zustand"],
        });
      },
    );
  });

  describe("new agent added this session seeds from ownership defaults", () => {
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
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-testing": [{ id: "web-testing-vitest" }],
            // Intentionally no api-api category on web-developer.
          },
        } satisfies Partial<Record<AgentName, StackAgentConfig>>;

        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react", "web-testing-vitest", "api-framework-hono"],
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
        expect(
          stackAfterEdit["web-developer"]?.["api-api"],
          "web-developer.api-api must stay absent — user's curation is authoritative",
        ).toBeUndefined();
        expect(stackAfterEdit["web-developer"]?.["web-framework"]).toStrictEqual([
          { id: "web-framework-react", preloaded: true },
        ]);
        expect(stackAfterEdit["web-developer"]?.["web-testing"]).toStrictEqual([
          "web-testing-vitest",
        ]);

        // --- api-developer (newly selected) is seeded from ownership defaults ---
        expect(
          stackAfterEdit["api-developer"],
          "api-developer stack must be seeded when the agent is newly selected this session",
        ).toBeDefined();
        expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual(["api-framework-hono"]);
        expect(stackAfterEdit["api-developer"]?.["web-framework"]).toStrictEqual([
          "web-framework-react",
        ]);
        expect(stackAfterEdit["api-developer"]?.["web-testing"]).toStrictEqual([
          "web-testing-vitest",
        ]);

        // ================================================================
        // Phase 4: Filesystem assertions.
        // ================================================================

        // web-developer's curated removal of api-api must be reflected on disk:
        // the compiled markdown must NOT embed api-framework-hono content.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
          notContains: ["api-framework-hono"],
        });

        // api-developer (newly added) contains its seeded skills.
        await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
          contains: ["api-framework-hono", "web-framework-react", "web-testing-vitest"],
        });
      },
    );
  });
});
