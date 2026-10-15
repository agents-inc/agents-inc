import { expect } from "vitest";

import {
  createTestEnvironment,
  type DualScopeEnv,
  type TestEnvironment,
} from "./dual-scope-helpers.js";
import { InteractivePrompt } from "./interactive-prompt.js";
import { runInitFrom, type SeedConfigStore } from "./seed-config-store.js";
import { E2E_AGENT, E2E_SKILL, E2E_STACK_ID } from "./expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { globalHomeFor } from "../../src/cli/lib/__tests__/helpers/global-home.js";

import type { CLIResult } from "./cli.js";
import type { ProjectHandle } from "./project-handle.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { SeedPayload, SeedSkill } from "@workspace/matrix/seed";

type Scope = SeedSkill["scope"];

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

/**
 * The E2E source's stack, written out skill by skill as the editor sends it. Restated from
 * `E2E_STACK` in `create-e2e-source.ts`, whose keys are `E2E_STACK_SKILL_IDS` — a spec installing
 * this and asserting that list is what holds the two together.
 */
const E2E_STACK_ASSIGNMENTS: Record<string, SeedSkill["assignments"]> = {
  [E2E_SKILL.react.id]: { [WEB_DEV]: "preloaded" },
  [E2E_SKILL.vitest.id]: { [WEB_DEV]: "lazy" },
  [E2E_SKILL.zustand.id]: { [WEB_DEV]: "lazy" },
  [E2E_SKILL.reviewing.id]: { [WEB_DEV]: "lazy", [API_DEV]: "lazy" },
  [E2E_SKILL["cli-reviewing"].id]: { [WEB_DEV]: "lazy" },
  [E2E_SKILL["research-methodology"].id]: { [WEB_DEV]: "lazy", [API_DEV]: "lazy" },
  [E2E_SKILL.hono.id]: { [API_DEV]: "preloaded" },
};

export type E2EStackOptions = {
  /** Where every skill and sub-agent rests unless named below. Default `global`. */
  scope?: Scope;
  /** Skills placed in the project instead. */
  projectSkills?: readonly string[];
  /** Sub-agents placed in the project instead. */
  projectAgents?: readonly AgentName[];
  /** Default `eject`. */
  install?: SeedSkill["install"];
  /** Skills installed as plugins whatever `install` says. */
  pluginSkills?: readonly string[];
  /** Skills the stack assigns that this configuration leaves out. */
  without?: readonly string[];
  /** Skills added beyond the stack, each assigned lazily to these sub-agents. */
  plus?: Readonly<Record<string, readonly AgentName[]>>;
  /** Skills kept but assigned to no sub-agent. */
  unassigned?: readonly string[];
  /** Sub-agents left out, with every assignment to them. */
  withoutAgents?: readonly AgentName[];
};

/** The E2E stack as a shared configuration, so `init --from` installs what selecting it would. */
export function e2eStackPayload(options: E2EStackOptions = {}): SeedPayload {
  const stackSkills = Object.entries({
    ...E2E_STACK_ASSIGNMENTS,
    ...lazilyAssigned(options.plus ?? {}),
  }).filter(([id]) => !options.without?.includes(id));
  const keptAgents = [WEB_DEV, API_DEV].filter((name) => isKeptAgent(name, options));

  return buildSeedPayload({
    stackId: E2E_STACK_ID,
    skills: Object.fromEntries(
      stackSkills.map(([id, assigned]) => [id, seedSkillOf(id, assigned, options)]),
    ),
    agents: Object.fromEntries(
      keptAgents.map((name) => [name, { scope: seedAgentScopeOf(name, options) }]),
    ),
  });
}

/** Where an install runs: `dir` is its cwd, `home` its HOME. */
type InstallSite = { dir: string; home: string };

/**
 * Publishes `payload` under `id` and installs it with `init --from` at `site`, from the E2E source
 * unless `sourceDir` names another. Fails the spec when the install does.
 */
export async function installFromSeed(
  store: SeedConfigStore,
  id: string,
  payload: SeedPayload,
  site: InstallSite,
  sourceDir: string = E2E_SOURCE.sourceDir,
): Promise<CLIResult> {
  store.publish(id, payload);
  const result = await runInitFrom(store, id, { dir: site.dir, globalHome: site.home }, sourceDir);
  expect(result.exitCode, `init --from ${id} failed: ${result.output}`).toBe(EXIT_CODES.SUCCESS);
  return result;
}

/**
 * Runs `edit --from <id>` against `store` at a real terminal and approves its plan — the apply a
 * user makes, where `runEditFrom` is the one refused for want of a terminal. Asserts nothing about
 * how the edit exits; {@link applyFromSeed} does.
 */
export async function applyEditFrom(
  store: SeedConfigStore,
  id: string,
  project: ProjectHandle,
  env?: Record<string, string>,
): Promise<{ exitCode: number; output: string }> {
  const prompt = new InteractivePrompt(["edit", "--from", id], project.dir, {
    env: { ...env, AGENTS_INC_API_URL: store.url, HOME: globalHomeFor(project) },
  });

  try {
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    return { exitCode, output: prompt.getOutput() };
  } finally {
    await prompt.destroy();
  }
}

/**
 * Publishes `payload` under `id` and applies it with {@link applyEditFrom} at `site`. Fails the
 * spec unless the edit exits `expectedExit` (default success).
 */
export async function applyFromSeed(
  store: SeedConfigStore,
  id: string,
  payload: SeedPayload,
  site: InstallSite,
  expectedExit: number = EXIT_CODES.SUCCESS,
): Promise<{ exitCode: number; output: string }> {
  store.publish(id, payload);
  const applied = await applyEditFrom(store, id, { dir: site.dir, globalHome: site.home });
  expect(applied.exitCode, `edit --from ${id} failed: ${applied.output}`).toBe(expectedExit);
  return applied;
}

/**
 * A global install of the E2E stack at `home`, as selecting it at HOME with every skill ejected.
 */
export function installE2EStackGlobally(
  store: SeedConfigStore,
  home: string,
  sourceDir?: string,
): Promise<CLIResult> {
  return installFromSeed(store, "E2EGlobal", e2eStackPayload(), { dir: home, home }, sourceDir);
}

/** The project half of the dual-scope installation: Hono and API Developer in the project. */
export const DUAL_SCOPE = {
  projectSkills: [E2E_SKILL.hono.id],
  projectAgents: [API_DEV],
} as const satisfies E2EStackOptions;

/**
 * The dual-scope installation: the E2E stack installed globally, then a project install that moves
 * Hono and API Developer into the project — leaving each a `[P][G]` pair, the project's own entry
 * beside a `{ scope: "global", excluded: true }` tombstone.
 */
export async function installE2EStackDualScope(
  store: SeedConfigStore,
  env: { fakeHome: string; projectDir: string },
  sourceDir?: string,
): Promise<void> {
  await installE2EStackGlobally(store, env.fakeHome, sourceDir);
  await installFromSeed(
    store,
    "E2EDual",
    e2eStackPayload(DUAL_SCOPE),
    { dir: env.projectDir, home: env.fakeHome },
    sourceDir,
  );
}

/** The id {@link installDualScopeStack} publishes {@link DUAL_SCOPE} under. */
const DUAL_SCOPE_ID = "DualScp1";

/**
 * A fresh test environment holding the dual-scope installation, made by ONE `init --from` run from
 * the project with {@link DUAL_SCOPE} — the stack in the global installation but for the API skill
 * and the API sub-agent, which the project owns. {@link installE2EStackDualScope} makes the same
 * split in two runs, the global install first.
 */
export async function installDualScopeStack(
  store: SeedConfigStore,
  sourceDir: string,
): Promise<TestEnvironment> {
  const env = await createTestEnvironment();
  await installFromSeed(
    store,
    DUAL_SCOPE_ID,
    e2eStackPayload(DUAL_SCOPE),
    { dir: env.projectDir, home: env.fakeHome },
    sourceDir,
  );
  return env;
}

/**
 * The global-only installation: the E2E stack installed globally, then the same configuration run
 * from the project, which adds nothing there — the project config inlines every global entry and
 * the project is registered in the global one.
 */
async function installE2EStackGlobalOnly(
  store: SeedConfigStore,
  env: { fakeHome: string; projectDir: string },
): Promise<void> {
  await installE2EStackGlobally(store, env.fakeHome);
  await installFromSeed(store, "E2EGlobalOnly", e2eStackPayload(), {
    dir: env.projectDir,
    home: env.fakeHome,
  });
}

/** A fresh environment holding {@link installE2EStackDualScope}'s installation. */
export async function createDualScopeEnvFromSeed(store: SeedConfigStore): Promise<DualScopeEnv> {
  const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
  await installE2EStackDualScope(store, { fakeHome, projectDir });
  return { fakeHome, projectDir, destroy: () => cleanupTempDir(tempDir) };
}

/** A fresh environment holding {@link installE2EStackGlobalOnly}'s installation. */
export async function createGlobalOnlyEnvFromSeed(store: SeedConfigStore): Promise<DualScopeEnv> {
  const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
  await installE2EStackGlobalOnly(store, { fakeHome, projectDir });
  return { fakeHome, projectDir, destroy: () => cleanupTempDir(tempDir) };
}

/** Each skill `plus` adds, assigned lazily to the sub-agents it names. */
function lazilyAssigned(
  plus: NonNullable<E2EStackOptions["plus"]>,
): Record<string, SeedSkill["assignments"]> {
  return Object.fromEntries(
    Object.entries(plus).map(([id, agents]) => [
      id,
      Object.fromEntries(agents.map((agent) => [agent, "lazy" as const])),
    ]),
  );
}

/** One stack skill, installed, placed and assigned as `options` says. */
function seedSkillOf(
  id: string,
  assigned: SeedSkill["assignments"],
  options: E2EStackOptions,
): SeedSkill {
  return buildSeedSkill({
    install: options.pluginSkills?.includes(id) ? "plugin" : (options.install ?? "eject"),
    scope: options.projectSkills?.includes(id) ? "project" : restingScope(options),
    assignments: options.unassigned?.includes(id) ? {} : keptAssignments(assigned, options),
  });
}

function seedAgentScopeOf(name: AgentName, options: E2EStackOptions): Scope {
  return options.projectAgents?.includes(name) ? "project" : restingScope(options);
}

function restingScope(options: E2EStackOptions): Scope {
  return options.scope ?? "global";
}

/** `assigned` less every assignment to a sub-agent `options` leaves out. */
function keptAssignments(
  assigned: SeedSkill["assignments"],
  options: E2EStackOptions,
): SeedSkill["assignments"] {
  return Object.fromEntries(
    Object.entries(assigned).filter(([agent]) => isKeptAgent(agent, options)),
  );
}

function isKeptAgent(name: string, options: E2EStackOptions): boolean {
  return !options.withoutAgents?.some((dropped) => dropped === name);
}
