import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./compile-agents.js", () => ({ compileAgents: vi.fn() }));

import { compileAgentsAllScopes } from "./compile-agents-all-scopes.js";
import { compileAgents } from "./compile-agents.js";
import { buildRecompileAgentsResult } from "../../__tests__/factories/recompile-factories.js";

const mockCompileAgents = vi.mocked(compileAgents);

const HOME = path.join(path.sep, "home", "someone");
const PROJECT = path.join(HOME, "work", "project");
const SOURCE = path.join(path.sep, "source");

describe("compileAgentsAllScopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(os, "homedir").mockReturnValue(HOME);
    mockCompileAgents.mockResolvedValue(buildRecompileAgentsResult());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const options = (projectDir: string) => ({
    projectDir,
    sourcePath: SOURCE,
    skills: {},
    agentScopeMap: new Map(),
  });

  it("compiles the home installation once, into its own agents folder", async () => {
    await compileAgentsAllScopes(options(HOME));

    expect(mockCompileAgents).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        projectDir: HOME,
        outputDir: path.join(HOME, ".claude", "agents"),
      }),
    );
  });

  it("compiles a project in two passes, the global scope first", async () => {
    await compileAgentsAllScopes(options(PROJECT));

    expect(mockCompileAgents).toHaveBeenCalledTimes(2);
    expect(mockCompileAgents).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ projectDir: HOME, scopeFilter: "global" }),
    );
    expect(mockCompileAgents).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ projectDir: PROJECT }),
    );
  });
});
