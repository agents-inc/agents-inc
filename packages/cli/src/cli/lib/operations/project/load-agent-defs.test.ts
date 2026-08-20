import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentDefinition, AgentName, AgentSourcePaths } from "../../../types/index.js";

vi.mock("../../agents/index.js", () => ({
  getAgentDefinitions: vi.fn(),
}));

vi.mock("../../loading/index.js", () => ({
  loadMergedAgents: vi.fn(),
}));

vi.mock("../../../consts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../consts.js")>();
  return {
    ...actual,
    PROJECT_ROOT: "/mock/cli/root",
  };
});

import { loadAgentDefs } from "./load-agent-defs";
import { getAgentDefinitions } from "../../agents/index.js";
import { loadMergedAgents } from "../../loading/index.js";

const mockGetAgentDefinitions = vi.mocked(getAgentDefinitions);
const mockLoadMergedAgents = vi.mocked(loadMergedAgents);

const MOCK_AGENT_SOURCE_PATHS: AgentSourcePaths = {
  agentsDir: "/tmp/source/src/agents",
  sourcePath: "/tmp/source",
};

function createMockAgentDef(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    title: "Mock Agent",
    description: "A mock agent for testing",
    tools: [],
    ...overrides,
  };
}

const SOURCE_AGENT: AgentDefinition = createMockAgentDef({
  title: "Source Web Developer",
  description: "Source-overridden web developer",
});

const CLI_ONLY_AGENT: AgentDefinition = createMockAgentDef({
  title: "CLI Reviewer",
  description: "Built-in reviewer",
});

describe("loadAgentDefs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAgentDefinitions.mockResolvedValue(MOCK_AGENT_SOURCE_PATHS);
  });

  it("should return merged agents from loadMergedAgents(sourcePath)", async () => {
    const mergedAgents: Partial<Record<AgentName, AgentDefinition>> = {
      "web-developer": SOURCE_AGENT,
      reviewer: CLI_ONLY_AGENT,
    };

    mockLoadMergedAgents.mockResolvedValue(mergedAgents);

    const result = await loadAgentDefs();

    expect(mockLoadMergedAgents).toHaveBeenCalledTimes(1);
    expect(mockLoadMergedAgents).toHaveBeenCalledWith("/tmp/source");

    // loadMergedAgents is mocked, so what is pinned here is FORWARDING, not merge
    // precedence: whatever it returns must reach result.agents entry-for-entry and
    // unchanged. Precedence belongs to loadMergedAgents' own spec.
    expect(result.agents["web-developer"]).toStrictEqual(SOURCE_AGENT);
    expect(result.agents["reviewer"]).toStrictEqual(CLI_ONLY_AGENT);
    expect(result.agents).toStrictEqual({
      "web-developer": SOURCE_AGENT,
      reviewer: CLI_ONLY_AGENT,
    });
  });

  it("asks for agent partials with no arguments at all", async () => {
    mockLoadMergedAgents.mockResolvedValue({});

    await loadAgentDefs();

    // Agent partials always come from the CLI's own installation, so there is nothing for a
    // caller to vary: no remote source, and no options. Passing either would take
    // getAgentDefinitions' remote branch or hand it a field it does not read.
    expect(mockGetAgentDefinitions).toHaveBeenCalledWith();
  });

  it("should return sourcePath from agentSourcePaths", async () => {
    mockLoadMergedAgents.mockResolvedValue({});

    const result = await loadAgentDefs();

    expect(result.sourcePath).toBe("/tmp/source");
  });

  it("should return complete agentSourcePaths", async () => {
    mockLoadMergedAgents.mockResolvedValue({});

    const result = await loadAgentDefs();

    expect(result.agentSourcePaths).toStrictEqual(MOCK_AGENT_SOURCE_PATHS);
  });
});
