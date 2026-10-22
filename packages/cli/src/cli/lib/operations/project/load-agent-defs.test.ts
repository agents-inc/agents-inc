import path from "path";
import { describe, it, expect } from "vitest";

import { loadAgentDefs } from "./load-agent-defs.js";
import { AGENT_NAMES } from "../../../types/agents.js";
import { DIRS } from "../../../consts.js";
import { typedKeys } from "../../../utils/typed-object.js";
import { CLI_ROOT } from "../../__tests__/helpers/cli-runner.js";

describe("loadAgentDefs", () => {
  it("answers exactly the CLI's own sub-agents, the roster every AgentName union is generated from", async () => {
    const { agents } = await loadAgentDefs();

    expect(typedKeys(agents).toSorted()).toStrictEqual([...AGENT_NAMES].toSorted());
  });

  it("names the CLI itself as the source its sub-agents compile from", async () => {
    const defs = await loadAgentDefs();

    expect(defs.sourcePath).toBe(CLI_ROOT);
    expect(defs.agentSourcePaths).toStrictEqual({
      agentsDir: path.join(CLI_ROOT, DIRS.agents),
      sourcePath: CLI_ROOT,
    });
  });
});
