import type { CheckboxItem } from "../../components/wizard/checkbox-grid.js";
import type { AgentName } from "../../types/index.js";

export type AgentItem = CheckboxItem<AgentName>;

export type AgentGroup = {
  label: string;
  items: AgentItem[];
};

/**
 * The agents the wizard offers, in the order its grid lists them.
 *
 * Lives here rather than in `step-agents.tsx` because the grid is not the only
 * surface that has to know which row it opens on: the store seeds `focusedAgentId`
 * from the same roster before the first frame, so that a keystroke buffered ahead
 * of that frame resolves the same agent the user is looking at.
 */
export const BUILT_IN_AGENT_GROUPS: AgentGroup[] = [
  {
    label: "Web",
    items: [
      {
        id: "web-developer",
        label: "Web Developer",
        description: "Frontend features, components, TypeScript",
      },
      { id: "web-researcher", label: "Web Researcher", description: "Frontend pattern discovery" },
      {
        id: "web-tester",
        label: "Web Tester",
        description: "Frontend tests, E2E, component tests",
      },
    ],
  },
  {
    label: "API",
    items: [
      {
        id: "api-developer",
        label: "API Developer",
        description: "Backend routes, database, middleware",
      },
      { id: "api-researcher", label: "API Researcher", description: "Backend pattern discovery" },
      {
        id: "api-tester",
        label: "API Tester",
        description: "Endpoint, database, and auth flow tests",
      },
    ],
  },
  {
    label: "AI",
    items: [
      {
        id: "ai-developer",
        label: "AI Developer",
        description: "RAG pipelines, agent loops, tool calling",
      },
      {
        id: "ai-researcher",
        label: "AI Researcher",
        description: "Prompt, model, and RAG pipeline discovery",
      },
      {
        id: "ai-tester",
        label: "AI Tester",
        description: "LLM mocking, prompt regression, eval harnesses",
      },
    ],
  },
  {
    label: "CLI",
    items: [
      {
        id: "cli-developer",
        label: "CLI Developer",
        description: "CLI commands, interactive prompts",
      },
      { id: "cli-tester", label: "CLI Tester", description: "CLI application tests" },
      {
        id: "cli-researcher",
        label: "CLI Researcher",
        description: "CLI command and config pattern discovery",
      },
    ],
  },
  {
    label: "Meta",
    items: [
      {
        id: "pm",
        label: "PM",
        description: "Cross-domain implementation specs; domain frameworks via skills",
      },
      {
        id: "reviewer",
        label: "Reviewer",
        description: "Cross-domain code review; domain knowledge via skills",
      },
      { id: "agent-summoner", label: "Agent Summoner", description: "Create and improve agents" },
      {
        id: "skill-summoner",
        label: "Skill Summoner",
        description: "Create technology-specific skills",
      },
      { id: "codex-keeper", label: "Codex Keeper", description: "AI-focused documentation" },
    ],
  },
];

/** IDs of all built-in agents for fast lookup. */
export const BUILT_IN_AGENT_IDS = new Set<string>(
  BUILT_IN_AGENT_GROUPS.flatMap((group) => group.items.map((agent) => agent.id)),
);

/**
 * The agent the grid focuses when nothing is focused yet.
 *
 * Always a built-in: a marketplace's own agents are appended after these groups,
 * so the head of the list does not move with the loaded source.
 */
export function firstFocusableAgent(): AgentName {
  const first = BUILT_IN_AGENT_GROUPS[0]?.items[0];
  if (first === undefined) throw new Error("The built-in agent roster is empty");
  return first.id;
}
