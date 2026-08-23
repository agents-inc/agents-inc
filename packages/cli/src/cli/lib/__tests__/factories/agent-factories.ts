import type {
  AgentConfig,
  AgentDefinition,
  AgentName,
  CompiledAgentData,
  Skill,
} from "../../../types";
import type { AgentDefs } from "../../operations/project/load-agent-defs.js";

/** Where {@link buildAgentDefs} says the CLI's own agent partials sit, when a test does not care. */
const MOCK_CLI_ROOT = "/mock/cli/root";

/**
 * What `loadAgentDefs` in `lib/operations/project/load-agent-defs.ts` answers, for a spec that
 * mocks it.
 *
 * The roster and the sourcePath travel together in production — one call answers both, and every
 * caller uses the roster for the emitted type unions and the path for the compile pass — so a
 * spec that stubs one and invents the other is describing a state the loader cannot produce.
 */
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
