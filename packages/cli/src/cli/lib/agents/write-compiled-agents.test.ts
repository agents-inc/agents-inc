import os from "os";
import path from "path";
import { readFile } from "fs/promises";
import type { Liquid } from "liquidjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeCompiledAgentsByScope } from "./write-compiled-agents";
import { createLiquidEngine } from "../compiler.js";
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
import { DEFAULT_TEST_AGENTS } from "../__tests__/mock-data/mock-agents";
import { writeSourceAgent } from "../__tests__/helpers/disk-writers";
import { parseCompiledAgentSections } from "../__tests__/helpers/compiled-agent-sections.js";
import { DIRS, EJECT_SOURCE } from "../../consts";
import type { AgentConfig, AgentName, PluginSkillRef, SkillScope } from "../../types";

const PROJECT_AGENT: AgentName = "web-developer";
const GLOBAL_AGENT: AgentName = "api-developer";

const REACT_PLUGIN_REF: PluginSkillRef = "web-framework-react:web-framework-react";

describe("writeCompiledAgentsByScope", () => {
  let tempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let engine: Liquid;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-write-compiled-agents-");
    fakeHome = path.join(tempDir, "home");
    projectDir = path.join(tempDir, "project");
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    for (const agent of DEFAULT_TEST_AGENTS) {
      await writeSourceAgent(path.join(projectDir, DIRS.agents), agent);
    }
    engine = await createLiquidEngine();
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
      engine,
      projectAgentsDir: projectAgentsDir(),
      projectDir,
      ...(agentScopeMap !== undefined && { agentScopeMap }),
    });

  it("leaves the global agents directory absent when every agent routes to the project scope", async () => {
    const outcomes = await writeAgents(
      { [PROJECT_AGENT]: createMockAgentConfig(PROJECT_AGENT) },
      new Map<AgentName, SkillScope>([[PROJECT_AGENT, "project"]]),
    );

    // Subject guard: the pass really wrote the project agent.
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

  /** Each skill's own `source` decides `${id}:${id}` versus a bare id, so assert per skill. */
  describe("how the written agent names its skills", () => {
    const writtenProjectAgent = async (): Promise<string> =>
      readFile(path.join(projectAgentsDir(), `${PROJECT_AGENT}.md`), "utf-8");

    it("names a marketplace-sourced skill by its plugin reference", async () => {
      const pluginSkill = createMockSkillEntry(SKILLS.react.id, false, { source: "agents-inc" });

      await writeAgents({
        [PROJECT_AGENT]: createMockAgentConfig(PROJECT_AGENT, [pluginSkill]),
      });

      expect(parseCompiledAgentSections(await writtenProjectAgent()).dynamicEntries).toStrictEqual([
        { id: SKILLS.react.id, invokeRef: REACT_PLUGIN_REF },
      ]);
    });

    it("names an ejected skill by its bare id", async () => {
      const ejectSkill = createMockSkillEntry(SKILLS.react.id, false, { source: EJECT_SOURCE });

      await writeAgents({
        [PROJECT_AGENT]: createMockAgentConfig(PROJECT_AGENT, [ejectSkill]),
      });

      expect(parseCompiledAgentSections(await writtenProjectAgent()).dynamicEntries).toStrictEqual([
        { id: SKILLS.react.id, invokeRef: SKILLS.react.id },
      ]);
    });
  });
});
