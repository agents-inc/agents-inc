import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import path from "path";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  loadConfigOrFail,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * A sub-agent's scope decides WHERE it lives, never WHAT it knows.
 *
 * A GLOBAL sub-agent's per-agent curation is carried by the global config alone:
 * a project config filters its stack down to project-scoped agents, so a global
 * agent has no row of its own there. Moving that agent to project scope during a
 * project edit must carry its curated catalogue across intact — including
 * assignments the shared relevance resolver would never derive on its own — and
 * must leave the global config's copy where it is.
 */

/**
 * What the global install has curated onto its web sub-agent.
 *
 * The api row is cross-domain on purpose: the shared resolver targets an api
 * skill at api-domain agents and the cross-domain role agents only, never at a
 * web developer. It can therefore only survive a rebuild by being preserved as
 * curation — a stack rebuilt from relevance drops it.
 */
const CURATED_GLOBAL_STACK = {
  "web-developer": {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
    "api-api": [{ id: E2E_SKILL.hono.id }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const GLOBAL_SKILL_CONFIGS = [
  { id: E2E_SKILL.react.id, scope: "global" as const, origin: "eject" },
  { id: E2E_SKILL.hono.id, scope: "global" as const, origin: "eject" },
];

describe("a sub-agent moved from global to project scope", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempHome: string | undefined;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempHome) {
      await cleanupTempDir(tempHome);
      tempHome = undefined;
    }
  });

  it("keeps the catalogue its global stack curated", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    tempHome = await createTempDir();
    const projectDir = path.join(tempHome, "project");

    // The global install owns web-developer and its curated stack.
    await writeProjectConfig(tempHome, {
      name: "global",
      skills: GLOBAL_SKILL_CONFIGS,
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web", "api"],
      stack: CURATED_GLOBAL_STACK,
    });

    for (const skill of [
      {
        id: E2E_SKILL.react.id,
        display: E2E_SKILL.react.display,
        category: "web-framework",
        slug: E2E_SKILL.react.slug,
      },
      {
        id: E2E_SKILL.hono.id,
        display: E2E_SKILL.hono.display,
        category: "api-api",
        slug: E2E_SKILL.hono.slug,
      },
    ] as const) {
      await createLocalSkill(tempHome, skill.id, {
        description: `${skill.id} skill`,
        metadata: renderMetadataYaml({
          displayName: skill.display,
          category: skill.category,
          slug: skill.slug,
          contentHash: `e2e-hash-${skill.slug}`,
        }),
      });
    }

    // The project inherits both skills and the agent, and carries NO stack row
    // for web-developer — that is exactly what the writer emits while the agent
    // is global-scoped, and it is the state the rebuild used to read as "new".
    await writeProjectConfig(projectDir, {
      name: path.basename(projectDir),
      skills: GLOBAL_SKILL_CONFIGS,
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web", "api"],
    });
    await createPermissionsFile(projectDir);
    await createPermissionsFile(tempHome);

    // Action: one project edit whose only change is the agent's scope.
    wizard = await EditWizard.launch({
      projectDir,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: tempHome },
      ...TERMINAL_SIZE.TALL,
    });

    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    const agents = await sources.advance();

    await agents.navigateCursorToAgent(E2E_AGENT["web-developer"].display);
    await agents.toggleScopeOnFocusedAgent();

    const confirm = await agents.advance("edit");
    const result = await confirm.confirm();
    expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
    await result.destroy();

    // Config: the agent now lives in the project, carrying what it knew.
    const projectStack = (await loadConfigOrFail(projectDir)).stack?.[
      E2E_AGENT["web-developer"].name
    ];
    expect(
      projectStack?.["web-framework"]?.map((assignment) => assignment.id),
      "the agent's own-domain assignment must survive the scope change",
    ).toStrictEqual([E2E_SKILL.react.id]);
    expect(
      projectStack?.["api-api"]?.map((assignment) => assignment.id),
      "the curated cross-domain assignment must survive the scope change",
    ).toStrictEqual([E2E_SKILL.hono.id]);

    // Config: the global install keeps the curation it owns — a project-context
    // edit takes the agent into this project, it never migrates global state out.
    const globalStack = (await loadConfigOrFail(tempHome)).stack?.[E2E_AGENT["web-developer"].name];
    expect(globalStack?.["api-api"]?.map((assignment) => assignment.id)).toStrictEqual([
      E2E_SKILL.hono.id,
    ]);

    // Filesystem: the compiled project agent embeds both, so the loss would have
    // been visible in what the sub-agent actually reads.
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: [E2E_SKILL.react.id, E2E_SKILL.hono.id],
    });
  });
});
