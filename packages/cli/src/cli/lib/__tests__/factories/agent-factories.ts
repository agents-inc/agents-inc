import type {
  AgentConfig,
  AgentDefinition,
  AgentName,
  CompiledAgentData,
  Skill,
} from "../../../types";
import type { AgentDefs } from "../../operations/project/load-agent-defs.js";

const MOCK_CLI_ROOT = "/mock/cli/root";

/** A mocked `loadAgentDefs` result; roster and sourcePath always come from one call. */
export function buildAgentDefs(
  agents: Partial<Record<AgentName, AgentDefinition>>,
  sourcePath: string = MOCK_CLI_ROOT,
): AgentDefs {
  return {
    agents,
    sourcePath,
    agentSourcePaths: { agentsDir: `${sourcePath}/src/agents`, sourcePath },
  };
}

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
