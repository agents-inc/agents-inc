import { expect } from "vitest";
import type {
  ProjectConfig,
  SkillConfig,
  AgentScopeConfig,
  SkillId,
  AgentName,
} from "../../../types";
import { readTestTsConfig } from "../helpers/config-io.js";

// --- Types ---

export interface ExpectedConfig {
  name?: string;
  source?: string;
  skillIds: string[];
  agentNames: string[];
  stackAgents?: string[];
  stackCategories?: Record<string, string[]>;
}

// --- Functions ---

/** Verify exact skill IDs in config (order-independent) */
export function expectConfigSkills(config: ProjectConfig, expectedIds: string[]): void {
  expect(config.skills.map((s) => s.id).sort()).toStrictEqual([...expectedIds].sort());
}

/** Verify exact agent names in config (order-independent) */
export function expectConfigAgents(config: ProjectConfig, expectedNames: string[]): void {
  expect(config.agents.map((a) => a.name).sort()).toStrictEqual([...expectedNames].sort());
}

/** Verify full SkillConfig shapes including id, scope, source (order-independent) */
export function expectSkillConfigs(config: ProjectConfig, expected: SkillConfig[]): void {
  const normalize = <T extends { id: string }>(skills: T[]) =>
    [...skills].sort((a, b) => a.id.localeCompare(b.id));
  expect(normalize(config.skills)).toStrictEqual(normalize(expected));
}

/** Verify full AgentScopeConfig shapes including name, scope (order-independent) */
export function expectAgentConfigs(config: ProjectConfig, expected: AgentScopeConfig[]): void {
  const normalize = <T extends { name: string }>(agents: T[]) =>
    [...agents].sort((a, b) => a.name.localeCompare(b.name));
  expect(normalize(config.agents)).toStrictEqual(normalize(expected));
}

/** Verify complete config shape in one call */
export function expectFullConfig(config: ProjectConfig, expected: ExpectedConfig): void {
  if (expected.name) expect(config.name).toBe(expected.name);
  if (expected.source) expect(config.source).toBe(expected.source);

  expect(config.skills.map((s) => s.id).sort()).toStrictEqual([...expected.skillIds].sort());
  expect(config.agents.map((a) => a.name).sort()).toStrictEqual([...expected.agentNames].sort());

  if (expected.stackAgents) {
    expect(Object.keys(config.stack ?? {}).sort()).toStrictEqual([...expected.stackAgents].sort());
  }
  if (expected.stackCategories) {
    for (const [agent, categories] of Object.entries(expected.stackCategories)) {
      expect(Object.keys(config.stack![agent] ?? {}).sort()).toStrictEqual([...categories].sort());
    }
  }
}

/** Parse config file from disk and verify shape. Returns config for further checks. */
export async function expectConfigOnDisk(
  configPath: string,
  expected: ExpectedConfig,
): Promise<ProjectConfig> {
  const config = await readTestTsConfig<ProjectConfig>(configPath);
  expectFullConfig(config, expected);
  return config;
}

/**
 * Asserts common config integrity invariants:
 * 1. config.agents names are sorted alphabetically
 * 2. config.skills contains all expectedSkillIds
 * 3. config.stack does not contain DEFAULT_AGENTS (agent-summoner, skill-summoner, codex-keeper)
 * 4. every agent in config.stack is also in config.agents
 */
export function assertConfigIntegrity(
  config: ProjectConfig,
  expectedSkillIds: SkillId[],
  expectedAgents?: AgentName[],
): void {
  // Agents are sorted alphabetically in config
  const agentNames = config.agents.map((a) => a.name);
  const sortedAgentNames = [...agentNames].sort();
  expect(agentNames).toStrictEqual(sortedAgentNames);

  // All expected skills are present (exact match, sorted)
  const configSkillIds = config.skills.map((s) => s.id).sort();
  expect(configSkillIds).toStrictEqual([...expectedSkillIds].sort());

  // If expectedAgents provided, verify they match
  if (expectedAgents) {
    expect(agentNames).toStrictEqual([...expectedAgents].sort());
  }

  // DEFAULT_AGENTS must not appear in stack
  if (config.stack) {
    expect(config.stack["agent-summoner"]).toBeUndefined();
    expect(config.stack["skill-summoner"]).toBeUndefined();
    expect(config.stack["codex-keeper"]).toBeUndefined();

    // Every agent in stack must be in config.agents
    for (const agentId of Object.keys(config.stack)) {
      expect(agentNames).toContain(agentId);
    }
  }
}
