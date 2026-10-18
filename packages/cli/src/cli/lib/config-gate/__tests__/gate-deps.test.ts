import { describe, expect, it, vi } from "vitest";

import { resolveGateDeps } from "../deps";
import { createMockAgent } from "../../__tests__/factories/agent-factories";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories";
import { SKILLS } from "../../__tests__/test-fixtures";

const MATRIX = createMockMatrix(SKILLS.react);
const AGENTS = { "web-developer": createMockAgent("web-developer") };

function lazyDeps() {
  return {
    loadMatrix: vi.fn(() => Promise.resolve(MATRIX)),
    loadAgents: vi.fn(() => Promise.resolve(AGENTS)),
  };
}

describe("resolveGateDeps", () => {
  it("answers deps already loaded as they were given", async () => {
    const loaded = { matrix: MATRIX, agents: AGENTS };

    expect(await resolveGateDeps(loaded, "T1")).toBe(loaded);
  });

  it("loads the matrix and the sub-agents for a tier that regenerates types", async () => {
    expect(await resolveGateDeps(lazyDeps(), "T1")).toStrictEqual({
      matrix: MATRIX,
      agents: AGENTS,
    });
  });

  it("loads the matrix alone for a tier that propagates without regenerating types", async () => {
    const deps = lazyDeps();

    expect(await resolveGateDeps(deps, "T2")).toStrictEqual({ matrix: MATRIX, agents: {} });
    expect(deps.loadAgents).not.toHaveBeenCalled();
  });

  it("loads nothing for a tier no consequence reads deps for", async () => {
    const deps = lazyDeps();

    expect(await resolveGateDeps(deps, "T3")).toBeNull();
    expect(deps.loadMatrix).not.toHaveBeenCalled();
  });
});
