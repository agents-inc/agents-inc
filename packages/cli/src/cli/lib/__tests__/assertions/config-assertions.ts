import { expect } from "vitest";
import type { ProjectConfig, SkillConfig, AgentScopeConfig } from "../../../types";

export function expectConfigSkills(config: ProjectConfig, expectedIds: string[]): void {
  expect(config.skills.map((s) => s.id).sort()).toStrictEqual([...expectedIds].sort());
}

export function expectConfigAgents(config: ProjectConfig, expectedNames: string[]): void {
  expect(config.agents.map((a) => a.name).sort()).toStrictEqual([...expectedNames].sort());
}

export function expectSkillConfigs(config: ProjectConfig, expected: SkillConfig[]): void {
  const normalize = <T extends { id: string }>(skills: T[]) =>
    [...skills].sort((a, b) => a.id.localeCompare(b.id));
  expect(normalize(config.skills)).toStrictEqual(normalize(expected));
}

export function expectAgentConfigs(config: ProjectConfig, expected: AgentScopeConfig[]): void {
  const normalize = <T extends { name: string }>(agents: T[]) =>
    [...agents].sort((a, b) => a.name.localeCompare(b.name));
  expect(normalize(config.agents)).toStrictEqual(normalize(expected));
}
