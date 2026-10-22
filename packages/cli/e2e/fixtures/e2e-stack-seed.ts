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

// Restates `E2E_STACK` in create-e2e-source.ts; specs asserting `E2E_STACK_SKILL_IDS` keep them in step.
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
  /** Default `global`. */
  scope?: Scope;
  projectSkills?: readonly string[];
  projectAgents?: readonly AgentName[];
  /** Default `eject`. */
  install?: SeedSkill["install"];
  pluginSkills?: readonly string[];
  without?: readonly string[];
  /** Extra skills, each assigned lazily to these sub-agents. */
  plus?: Readonly<Record<string, readonly AgentName[]>>;
  unassigned?: readonly string[];
  withoutAgents?: readonly AgentName[];
};

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

type InstallSite = { dir: string; home: string };

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

// At a real terminal, approving the plan; asserts nothing about the exit. A run that never asks
// times out here: {@link applyUnchangedFromSeed} is the path for one that changes nothing.
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

/** At a real terminal, a run that changes nothing: it says so and exits without asking. */
export async function applyUnchangedFromSeed(
  store: SeedConfigStore,
  id: string,
  payload: SeedPayload,
  site: InstallSite,
): Promise<{ exitCode: number; output: string }> {
  store.publish(id, payload);
  const prompt = new InteractivePrompt(["edit", "--from", id], site.dir, {
    env: { AGENTS_INC_API_URL: store.url, HOME: site.home },
  });

  try {
    const exitCode = await prompt.waitForExit(TIMEOUTS.WIZARD_LOAD);
    const output = prompt.getOutput();
    expect(exitCode, `edit --from ${id} failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output, `edit --from ${id} must say it changed nothing`).toContain(
      STEP_TEXT.EDIT_UNCHANGED,
    );
    expect(output, "a run that changes nothing has nothing to confirm").not.toContain(
      STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM,
    );
    return { exitCode, output };
  } finally {
    await prompt.destroy();
  }
}

export function installE2EStackGlobally(
  store: SeedConfigStore,
  home: string,
  sourceDir?: string,
): Promise<CLIResult> {
  return installFromSeed(store, "E2EGlobal", e2eStackPayload(), { dir: home, home }, sourceDir);
}

export const DUAL_SCOPE = {
  projectSkills: [E2E_SKILL.hono.id],
  projectAgents: [API_DEV],
} as const satisfies E2EStackOptions;

// Global install, then a project install moving Hono and API Developer in, leaving each a `[P][G]` pair.
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

const DUAL_SCOPE_ID = "DualScp1";

// The same split as `installE2EStackDualScope`, made by one `init --from` from the project.
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

// The project run adds nothing: its config inlines every global entry.
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

export async function createDualScopeEnvFromSeed(store: SeedConfigStore): Promise<DualScopeEnv> {
  const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
  await installE2EStackDualScope(store, { fakeHome, projectDir });
  return { fakeHome, projectDir, destroy: () => cleanupTempDir(tempDir) };
}

export async function createGlobalOnlyEnvFromSeed(store: SeedConfigStore): Promise<DualScopeEnv> {
  const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
  await installE2EStackGlobalOnly(store, { fakeHome, projectDir });
  return { fakeHome, projectDir, destroy: () => cleanupTempDir(tempDir) };
}

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
