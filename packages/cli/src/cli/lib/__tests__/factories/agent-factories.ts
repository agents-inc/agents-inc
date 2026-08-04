import type { AgentConfig, AgentDefinition, CompiledAgentData, Skill } from "../../../types";

export function createMockAgent(
  name: string,
  overrides?: Partial<AgentDefinition>,
): AgentDefinition {
  return {
    title: name,
    description: `${name} agent`,
    tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
    model: "opus",
    permissionMode: "default",
    ...overrides,
  };
}

export function createMockAgentConfig(
  name: string,
  skills: Skill[] = [],
  overrides?: Partial<AgentConfig>,
): AgentConfig {
  return {
    name,
    title: `${name} agent`,
    description: `Test ${name}`,
    tools: ["Read", "Write"],
    skills,
    path: name,
    ...overrides,
  };
}

export function createMockCompiledAgentData(overrides?: Partial<AgentConfig>): CompiledAgentData {
  const agent = createMockAgentConfig("test-agent", [], {
    title: "Test Agent",
    description: "A test agent",
    ...overrides,
  });

  return {
    agent,
    identity: "Test identity",
    playbook: "Test playbook",
    output: "Test output",
    criticalRequirementsTop: "",
    criticalReminders: "",
    skills: agent.skills,
    preloadedSkills: [],
    dynamicSkills: [],
    preloadedSkillIds: [],
  };
}
