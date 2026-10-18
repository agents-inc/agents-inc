/**
 * The install config `buildAndMergeConfig` hands the writer, run on the real generator: what it
 * records, what it refuses, and the verbose trail it leaves.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildAndMergeConfig,
  buildCompileAgents,
  refuseUnofferedStack,
  setConfigMetadata,
} from "./local-installer";
import { initializeMatrix } from "../matrix/matrix-provider";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  buildAgentConfigs,
  buildInstallSelection,
  buildProjectConfig,
  buildSourceResult,
} from "../__tests__/factories/config-factories";
import { createMockAgent } from "../__tests__/factories/agent-factories";
import { buildSkillConfig, buildSkillConfigs } from "../__tests__/helpers/skill-config-builders";
import { writeTestTsConfig } from "../__tests__/helpers/config-io";
import { silenceConsole } from "../__tests__/helpers/silence-console";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { FULLSTACK_PAIR_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { setVerbose } from "../../utils/logger";
import { DEFAULT_SOURCE } from "../configuration";
import type { AgentName, SkillId, StackAgentConfig } from "../../types";

const REACT: SkillId = "web-framework-react";
const HONO = "api-framework-hono";
const WEB_DEVELOPER = "web-developer";
const API_DEVELOPER = "api-developer";
const BUILT_IN_STACK_ID = "nextjs-fullstack";
const UNOFFERED_STACK_ID = "no-such-stack";
const SHARED_DESCRIPTION = "A configuration a teammate shared";
const PLUGIN_MARKETPLACE = "acme";

const ASSIGNED_STACK: Partial<Record<AgentName, StackAgentConfig>> = {
  [WEB_DEVELOPER]: { "web-framework": [{ id: REACT, preloaded: false }] },
};

describe("buildAndMergeConfig", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-install-config-build-");
    initializeMatrix(FULLSTACK_PAIR_MATRIX);
    setVerbose(true);
  });

  afterEach(async () => {
    setVerbose(false);
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  function sourceResultFor(source: string) {
    return buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir, {
      sourceConfig: { source, sourceOrigin: "flag" },
    });
  }

  function selectionWithAgent(overrides: Parameters<typeof buildInstallSelection>[1] = {}) {
    return buildInstallSelection(buildSkillConfigs([REACT]), {
      selectedAgents: [WEB_DEVELOPER],
      agentConfigs: buildAgentConfigs([WEB_DEVELOPER]),
      assignedStack: ASSIGNED_STACK,
      ...overrides,
    });
  }

  it("leaves a verbose trail of the selection, the stack it found and the merge", async () => {
    await buildAndMergeConfig(
      selectionWithAgent({ selectedStackId: BUILT_IN_STACK_ID }),
      sourceResultFor(DEFAULT_SOURCE),
      tempDir,
    );

    const said = (line: string) => expect(consoleSpies.log).toHaveBeenCalledWith(`  ${line}`);
    said(
      `buildInstallConfig: selectedStackId='${BUILT_IN_STACK_ID}', skills=[${REACT}], selectedAgents=[${WEB_DEVELOPER}]`,
    );
    said(`buildInstallConfig: loadedStack=found (id='${BUILT_IN_STACK_ID}')`);
    said(`buildInstallConfig result: stack=1 agents, agents=[${WEB_DEVELOPER}], skills=1`);
    said("buildAndMergeConfig: before merge — stack=1 agents");
    said("buildAndMergeConfig: after merge — stack=1 agents, merged=false");
  });

  it("lists several selected skills and sub-agents comma-separated in the trail", async () => {
    await buildAndMergeConfig(
      buildInstallSelection(buildSkillConfigs([REACT, HONO]), {
        selectedAgents: [WEB_DEVELOPER, API_DEVELOPER],
        agentConfigs: buildAgentConfigs([WEB_DEVELOPER, API_DEVELOPER]),
        assignedStack: ASSIGNED_STACK,
      }),
      sourceResultFor(DEFAULT_SOURCE),
      tempDir,
    );

    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  buildInstallConfig: selectedStackId='null', skills=[${REACT}, ${HONO}], selectedAgents=[${WEB_DEVELOPER}, ${API_DEVELOPER}]`,
    );
    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  buildInstallConfig result: stack=1 agents, agents=[${API_DEVELOPER}, ${WEB_DEVELOPER}], skills=2`,
    );
  });

  it("says no stack is set when no sub-agent is selected", async () => {
    await buildAndMergeConfig(
      buildInstallSelection(buildSkillConfigs([REACT, HONO])),
      sourceResultFor(DEFAULT_SOURCE),
      tempDir,
    );

    expect(consoleSpies.log).toHaveBeenCalledWith(
      "  buildInstallConfig result: stack=UNDEFINED, agents=[], skills=2",
    );
  });

  it("names a stack the marketplace does not offer before refusing it", async () => {
    await expect(
      buildAndMergeConfig(
        selectionWithAgent({ selectedStackId: UNOFFERED_STACK_ID }),
        sourceResultFor(tempDir),
        tempDir,
      ),
    ).rejects.toThrow(
      `Stack '${UNOFFERED_STACK_ID}' is not a stack the source '${tempDir}' offers.`,
    );
    expect(consoleSpies.log).toHaveBeenCalledWith("  buildInstallConfig: loadedStack=NOT FOUND");
  });

  it("carries the sharer's description when no stack is applied", async () => {
    const { config } = await buildAndMergeConfig(
      selectionWithAgent({ description: SHARED_DESCRIPTION }),
      sourceResultFor(DEFAULT_SOURCE),
      tempDir,
    );

    expect(config.description).toBe(SHARED_DESCRIPTION);
  });

  it("drops what the session leaves out when told it is authoritative", async () => {
    await writeTestTsConfig(
      tempDir,
      buildProjectConfig({
        name: "project",
        skills: buildSkillConfigs([REACT, HONO]),
        agents: buildAgentConfigs([WEB_DEVELOPER]),
      }),
    );
    const selection = selectionWithAgent();

    const additive = await buildAndMergeConfig(selection, sourceResultFor(DEFAULT_SOURCE), tempDir);
    const authoritative = await buildAndMergeConfig(
      selection,
      sourceResultFor(DEFAULT_SOURCE),
      tempDir,
      undefined,
      "all",
    );

    expect(additive.config.skills.map((skill) => skill.id)).toContain(HONO);
    expect(authoritative.config.skills.map((skill) => skill.id)).not.toContain(HONO);
  });
});

describe("refuseUnofferedStack", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-refuse-unoffered-stack-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("refuses a stack the marketplace does not offer, and lets one it does through", async () => {
    const custom = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);
    const publicCatalogue = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir, {
      sourceConfig: { source: DEFAULT_SOURCE, sourceOrigin: "default" },
    });

    await expect(refuseUnofferedStack(UNOFFERED_STACK_ID, custom)).rejects.toThrow(
      `Stack '${UNOFFERED_STACK_ID}' is not a stack the source '${tempDir}' offers.`,
    );
    await expect(refuseUnofferedStack(BUILT_IN_STACK_ID, publicCatalogue)).resolves.toBeUndefined();
  });
});

describe("setConfigMetadata with a load that names no marketplace", () => {
  it("records no marketplace", () => {
    const config = setConfigMetadata(
      buildProjectConfig(),
      buildInstallSelection([]),
      buildSourceResult(FULLSTACK_PAIR_MATRIX, "", {
        sourceConfig: { source: "", sourceOrigin: "default" },
      }),
    );

    expect(Object.keys(config)).not.toContain("marketplace");
  });
});

describe("buildCompileAgents and a skill's origin", () => {
  it("hands each referenced skill the origin its config records", () => {
    initializeMatrix(FULLSTACK_PAIR_MATRIX);
    const agents = buildCompileAgents(
      buildProjectConfig({
        skills: [buildSkillConfig(REACT, { origin: PLUGIN_MARKETPLACE })],
        agents: buildAgentConfigs([WEB_DEVELOPER]),
        stack: ASSIGNED_STACK,
      }),
      { [WEB_DEVELOPER]: createMockAgent(WEB_DEVELOPER) },
    );

    expect(agents[WEB_DEVELOPER]?.skills).toStrictEqual([
      {
        id: REACT,
        usage: "Use when working with web-framework.",
        preloaded: false,
        source: PLUGIN_MARKETPLACE,
      },
    ]);
  });
});
