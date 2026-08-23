import os from "os";
import path from "path";
import { Liquid } from "liquidjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../compiler.js", () => ({
  compileAgentForPlugin: vi.fn(),
}));

import { writeCompiledAgentsByScope } from "./write-compiled-agents";
import { compileAgentForPlugin } from "../compiler.js";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { createMockAgentConfig } from "../__tests__/factories/agent-factories";
import { createMockSkillEntry } from "../__tests__/factories/skill-factories";
import {
  cleanupTempDir,
  createTempDir,
  directoryExists,
  fileExists,
} from "../__tests__/test-fs-utils";
import { SKILLS } from "../__tests__/test-fixtures";
import { EJECT_SOURCE } from "../../consts";
import { firstElement } from "../__tests__/helpers/element-at";
import type { AgentConfig, AgentName, SkillScope } from "../../types";

const PROJECT_AGENT: AgentName = "web-developer";
const GLOBAL_AGENT: AgentName = "api-developer";
const COMPILED_BODY = "---\nname: agent\ndescription: compiled\n---\n";

const mockCompileAgentForPlugin = vi.mocked(compileAgentForPlugin);

describe("writeCompiledAgentsByScope", () => {
  let tempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-write-compiled-agents-");
    fakeHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "project");
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    mockCompileAgentForPlugin.mockResolvedValue(COMPILED_BODY);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const globalAgentsDir = (): string => resolveInstallPaths(fakeHome, "global").agentsDir;
  const projectAgentsDir = (): string => resolveInstallPaths(projectDir, "project").agentsDir;

  const writeAgents = async (
    resolvedAgents: Partial<Record<AgentName, AgentConfig>>,
    agentScopeMap?: Map<AgentName, SkillScope>,
  ) =>
    writeCompiledAgentsByScope({
      resolvedAgents,
      sourcePath: projectDir,
      engine: new Liquid(),
      projectAgentsDir: projectAgentsDir(),
      ...(agentScopeMap !== undefined && { agentScopeMap }),
    });

  it("leaves the global agents directory absent when every agent routes to the project scope", async () => {
    const outcomes = await writeAgents(
      { [PROJECT_AGENT]: createMockAgentConfig(PROJECT_AGENT) },
      new Map<AgentName, SkillScope>([[PROJECT_AGENT, "project"]]),
    );

    // Subject guard: the project agent really was written, so the assertion
    // below is about a pass that did work rather than one that no-opped.
    expect(outcomes).toStrictEqual([
      {
        name: PROJECT_AGENT,
        ok: true,
        scope: "project",
        targetDir: projectAgentsDir(),
        rewritten: true,
      },
    ]);
    expect(await fileExists(path.join(projectAgentsDir(), `${PROJECT_AGENT}.md`))).toBe(true);

    expect(
      await directoryExists(globalAgentsDir()),
      "a pass that routes no agent to global must not create the global agents directory",
    ).toBe(false);
  });

  it("leaves the global agents directory absent when no scope map is passed at all", async () => {
    await writeAgents({ [PROJECT_AGENT]: createMockAgentConfig(PROJECT_AGENT) });

    expect(await fileExists(path.join(projectAgentsDir(), `${PROJECT_AGENT}.md`))).toBe(true);
    expect(
      await directoryExists(globalAgentsDir()),
      "an unrouted write targets the caller's project dir, so global must stay absent",
    ).toBe(false);
  });

  it("writes a global-routed agent into the global agents directory", async () => {
    const outcomes = await writeAgents(
      { [GLOBAL_AGENT]: createMockAgentConfig(GLOBAL_AGENT) },
      new Map<AgentName, SkillScope>([[GLOBAL_AGENT, "global"]]),
    );

    expect(outcomes).toStrictEqual([
      {
        name: GLOBAL_AGENT,
        ok: true,
        scope: "global",
        targetDir: globalAgentsDir(),
        rewritten: true,
      },
    ]);
    expect(await directoryExists(globalAgentsDir())).toBe(true);
    expect(await fileExists(path.join(globalAgentsDir(), `${GLOBAL_AGENT}.md`))).toBe(true);
    expect(await fileExists(path.join(projectAgentsDir(), `${GLOBAL_AGENT}.md`))).toBe(false);
  });

  it("writes each agent to its own scope's directory in a mixed-scope pass", async () => {
    await writeAgents(
      {
        [PROJECT_AGENT]: createMockAgentConfig(PROJECT_AGENT),
        [GLOBAL_AGENT]: createMockAgentConfig(GLOBAL_AGENT),
      },
      new Map<AgentName, SkillScope>([
        [PROJECT_AGENT, "project"],
        [GLOBAL_AGENT, "global"],
      ]),
    );

    expect(await fileExists(path.join(projectAgentsDir(), `${PROJECT_AGENT}.md`))).toBe(true);
    expect(await fileExists(path.join(globalAgentsDir(), `${GLOBAL_AGENT}.md`))).toBe(true);
  });

  /**
   * Each skill's own `source` is what decides whether the compiler emits `${id}:${id}` or a
   * bare id, and this pass is the only thing between the resolver that attaches it and the
   * compiler that reads it. A mixed-mode sub-agent is normal, so the two are asserted per
   * skill rather than per agent.
   */
  describe("what reaches the compiler", () => {
    it("forwards a marketplace-sourced skill with its source intact", async () => {
      const pluginSkill = createMockSkillEntry(SKILLS.react.id, false, { source: "agents-inc" });

      await writeAgents({
        [PROJECT_AGENT]: createMockAgentConfig(PROJECT_AGENT, [pluginSkill]),
      });

      expect(mockCompileAgentForPlugin).toHaveBeenCalledTimes(1);
      const [name, agent] = firstElement(mockCompileAgentForPlugin.mock.calls);
      expect(name).toBe(PROJECT_AGENT);
      expect(agent.skills).toStrictEqual([pluginSkill]);
    });

    it("forwards an ejected skill with its source intact", async () => {
      const ejectSkill = createMockSkillEntry(SKILLS.react.id, false, { source: EJECT_SOURCE });

      await writeAgents({
        [PROJECT_AGENT]: createMockAgentConfig(PROJECT_AGENT, [ejectSkill]),
      });

      expect(mockCompileAgentForPlugin).toHaveBeenCalledTimes(1);
      const [name, agent] = firstElement(mockCompileAgentForPlugin.mock.calls);
      expect(name).toBe(PROJECT_AGENT);
      expect(agent.skills).toStrictEqual([ejectSkill]);
    });
  });
});
