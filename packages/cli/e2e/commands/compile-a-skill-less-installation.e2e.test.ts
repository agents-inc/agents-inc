import { rm } from "node:fs/promises";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { CLI } from "../fixtures/cli.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  createTempDir,
  loadConfigOrFail,
  readCompiledAgents,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { AgentName, AgentScopeConfig } from "../../src/cli/types/index.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";

/**
 * `compile` recompiles sub-agents `init --from` installed with no skill. Control: a config
 * declaring skills none of which is on disk is still refused.
 */

const EDITED_AGENT = "web-developer" as const satisfies AgentName;
const CONTROL_AGENT = "api-developer" as const satisfies AgentName;

/**
 * Copied byte for byte from `GATE_HOOKS_LINE` in `packages/compile/src/agent-source.test.ts`, not
 * composed.
 */
const COMPLETION_GATE_LINE = String.raw`hooks: {"Stop":[{"hooks":[{"type":"command","command":"command -v npm >/dev/null 2>&1 && [ -f package.json ] || exit 0; out=$(npm run --if-present --silent typecheck 2>&1) || { printf '%s\\n' \"$out\" >&2; exit 2; }"}]}]}`;

/** Values the installed sub-agents do not already carry, so the edit is a change. */
const HAND_EDIT = {
  model: "haiku",
  effort: "high",
} as const satisfies Pick<AgentScopeConfig, "model" | "effort">;

/** How `agent.liquid` writes {@link HAND_EDIT} into frontmatter. */
const HAND_EDITED_LINES = ["\nmodel: haiku\n", "\neffort: high\n"] as const;

const SKILL_LESS_ID = "NoSkill1";
const LOST_SKILLS_ID = "LostSkl1";

const SKILL_LESS_PAYLOAD = buildSeedPayload({
  agents: {
    [EDITED_AGENT]: { on: true, scope: "project" },
    [CONTROL_AGENT]: { on: true, scope: "project" },
  },
});

/** One ejected skill, so deleting it leaves a config that names it. */
const ONE_SKILL_PAYLOAD = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [EDITED_AGENT]: "lazy" },
    }),
  },
  agents: {
    [EDITED_AGENT]: { on: true, scope: "project" },
    [CONTROL_AGENT]: { on: true, scope: "project" },
  },
});

describe("compile over an installation whose sub-agents carry no skills", () => {
  let store: SeedConfigStore;
  let sourceDir: string;
  let e2eSourceTempDir: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  async function installedFrom(id: string, payload: unknown): Promise<ProjectHandle> {
    const project = { dir: await takeTempDir(), globalHome: await takeTempDir() };
    store.publish(id, payload);

    const installed = await runInitFrom(store, id, project, sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return project;
  }

  it(
    "recompiles the sub-agents exactly as init wrote them, and restores a deleted one",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const project = await installedFrom(SKILL_LESS_ID, SKILL_LESS_PAYLOAD);

      // Subject guards: no skill declared and both sub-agents written, else the comparison holds
      // over nothing.
      expect((await loadConfigOrFail(project.dir)).skills).toStrictEqual([]);
      const installedAgents = await readCompiledAgents(project.dir);
      expect(Object.keys(installedAgents).sort()).toStrictEqual(
        [`${EDITED_AGENT}.md`, `${CONTROL_AGENT}.md`].sort(),
      );
      for (const agent of [EDITED_AGENT, CONTROL_AGENT]) {
        expect(
          installedAgents[`${agent}.md`],
          `${agent} was installed without its completion gate`,
        ).toContain(`\n${COMPLETION_GATE_LINE}\n`);
      }

      await rm(path.join(agentsPath(project.dir), `${CONTROL_AGENT}.md`));

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(exitCode, `compile failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.COMPILE_COMPLETE);
      expect(output).not.toContain(STEP_TEXT.COMPILE_NO_SKILLS_ERROR);
      expect(
        await readCompiledAgents(project.dir),
        "compile rendered the base agents differently from the init that installed them, or never wrote the deleted one back",
      ).toStrictEqual(installedAgents);
    },
  );

  it(
    "compiles a hand edit to a skill-less sub-agent's model and effort into its frontmatter",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const project = await installedFrom(SKILL_LESS_ID, SKILL_LESS_PAYLOAD);
      const installedAgents = await readCompiledAgents(project.dir);
      for (const line of HAND_EDITED_LINES) {
        expect(
          installedAgents[`${EDITED_AGENT}.md`],
          "the sub-agent already carries the edit, so compiling it proves nothing",
        ).not.toContain(line);
      }

      const config = await loadConfigOrFail(project.dir);
      const editedAgents = config.agents.map((agent) =>
        agent.name === EDITED_AGENT ? { ...agent, ...HAND_EDIT } : agent,
      );
      await writeProjectConfig(project.dir, { ...config, agents: editedAgents });

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(exitCode, `compile failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
      expect(
        (await loadConfigOrFail(project.dir)).agents,
        "compile rewrote the hand-edited roster it was asked to compile",
      ).toStrictEqual(editedAgents);
      const compiled = await readCompiledAgents(project.dir);
      for (const line of HAND_EDITED_LINES) {
        expect(
          compiled[`${EDITED_AGENT}.md`],
          "the hand edit never reached the compiled sub-agent",
        ).toContain(line);
      }
      expect(
        compiled[`${CONTROL_AGENT}.md`],
        "an edit to one sub-agent's entry changed another",
      ).toBe(installedAgents[`${CONTROL_AGENT}.md`]);
    },
  );

  it(
    "still refuses an installation whose declared skills are all missing from disk",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const project = await installedFrom(LOST_SKILLS_ID, ONE_SKILL_PAYLOAD);
      const installedAgents = await readCompiledAgents(project.dir);
      expect(
        installedAgents[`${EDITED_AGENT}.md`],
        "the skill never reached the sub-agent, so losing it could not strip anything",
      ).toContain(E2E_SKILL.react.id);

      await rm(skillsPath(project.dir), { recursive: true });

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(output).toContain(STEP_TEXT.COMPILE_NO_SKILLS_ERROR);
      expect(
        await readCompiledAgents(project.dir),
        "a refused compile rewrote the sub-agents without the skills their config names",
      ).toStrictEqual(installedAgents);
    },
  );
});
