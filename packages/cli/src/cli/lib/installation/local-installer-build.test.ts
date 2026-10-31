/**
 * The install config `buildAndMergeConfig` hands the writer, run on the real generator: what it
 * records, what it refuses, and the verbose trail it leaves.
 */

import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildAndMergeConfig, buildCompileAgents, refuseUnofferedStack } from "./local-installer";
import { initializeMatrix } from "../matrix/matrix-provider";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  buildAgentConfigs,
  buildInstallSelection,
  buildProjectConfig,
  buildSourceConfig,
  buildSourceResult,
} from "../__tests__/factories/config-factories";
import { createMockAgent } from "../__tests__/factories/agent-factories";
import { sa } from "../__tests__/factories/skill-factories";
import { renderConfigTs } from "../__tests__/content-generators";
import {
  cleanupTestSource,
  createTestSource,
  writeTestFile,
} from "../__tests__/fixtures/create-test-source";
import { buildSkillConfig, buildSkillConfigs } from "../__tests__/helpers/skill-config-builders";
import { writeTestTsConfig } from "../__tests__/helpers/config-io";
import { silenceConsole } from "../__tests__/helpers/silence-console";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { FULLSTACK_PAIR_MATRIX, FULLSTACK_TRIO_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { CUSTOM_TEST_STACKS } from "../__tests__/mock-data/mock-stacks";
import { elementAt, firstElement } from "../__tests__/helpers/element-at";
import { setVerbose } from "../../utils/logger";
import { SOURCE_ROOT_DIR } from "../../consts";
import { DEFAULT_SOURCE } from "../configuration";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import type { AgentDefinition, AgentName, SkillId, StackAgentConfig } from "../../types";

const REACT: SkillId = "web-framework-react";
const VITEST: SkillId = "web-testing-vitest";
const HONO = "api-framework-hono";
const WEB_DEVELOPER = "web-developer";
const API_DEVELOPER = "api-developer";
const BUILT_IN_STACK_ID = "nextjs-fullstack";
const UNOFFERED_STACK_ID = "no-such-stack";
const SHARED_DESCRIPTION = "A configuration a teammate shared";
const PLUGIN_MARKETPLACE = "acme";
const DECLARED_STACKS_FILE = "data/stacks.ts";

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

  it("finds the stack it applies in the marketplace's own folder", async () => {
    const offered = firstElement(CUSTOM_TEST_STACKS);
    const marketplace = await createTestSource({ stacks: CUSTOM_TEST_STACKS });
    try {
      const { config } = await buildAndMergeConfig(
        selectionWithAgent({ selectedStackId: offered.id }),
        buildSourceResult(FULLSTACK_PAIR_MATRIX, marketplace.sourceDir, {
          sourceConfig: { source: marketplace.sourceDir, sourceOrigin: "flag" },
        }),
        tempDir,
      );

      expect(config.description).toBe(offered.description);
    } finally {
      await cleanupTestSource(marketplace);
    }
  });

  it("keeps the sharer's own description over the stack it applies", async () => {
    const offered = firstElement(CUSTOM_TEST_STACKS);
    const marketplace = await createTestSource({ stacks: CUSTOM_TEST_STACKS });
    try {
      const { config } = await buildAndMergeConfig(
        selectionWithAgent({ selectedStackId: offered.id, description: SHARED_DESCRIPTION }),
        buildSourceResult(FULLSTACK_PAIR_MATRIX, marketplace.sourceDir, {
          sourceConfig: { source: marketplace.sourceDir, sourceOrigin: "flag" },
        }),
        tempDir,
      );

      expect(config.description).toBe(SHARED_DESCRIPTION);
    } finally {
      await cleanupTestSource(marketplace);
    }
  });

  it("records no marketplace for a load that names none", async () => {
    const { config } = await buildAndMergeConfig(
      buildInstallSelection([]),
      buildSourceResult(FULLSTACK_PAIR_MATRIX, "", {
        sourceConfig: { source: "", sourceOrigin: "default" },
      }),
      tempDir,
    );

    expect(Object.keys(config)).not.toContain("marketplace");
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

  it("lets through a stack from the stacks file the marketplace declares, and refuses one it does not ship", async () => {
    const offered = firstElement(CUSTOM_TEST_STACKS);
    await writeTestTsConfig(
      tempDir,
      buildSourceConfig({ stacksFile: DECLARED_STACKS_FILE }),
      SOURCE_ROOT_DIR,
    );
    await writeTestFile(
      path.join(tempDir, DECLARED_STACKS_FILE),
      renderConfigTs({ stacks: CUSTOM_TEST_STACKS }),
    );
    const custom = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

    await expect(refuseUnofferedStack(offered.id, custom)).resolves.toBeUndefined();
    await expect(refuseUnofferedStack(UNOFFERED_STACK_ID, custom)).rejects.toThrow(
      `Stack '${UNOFFERED_STACK_ID}' is not a stack the source '${tempDir}' offers.`,
    );
  });

  it("says a marketplace that ships no stacks ships none", async () => {
    const custom = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

    await expect(refuseUnofferedStack(UNOFFERED_STACK_ID, custom)).rejects.toHaveProperty(
      "message",
      `Stack '${UNOFFERED_STACK_ID}' is not a stack the source '${tempDir}' offers. A marketplace ships its own stacks; the CLI's built-in ones belong to the default public marketplace alone. It ships no stacks.`,
    );
  });

  it("names the built-in stacks for the public catalogue, which offers them in place of its own", async () => {
    const builtInStackIds = BUILT_IN_MATRIX.suggestedStacks.map((stack) => stack.id);
    const publicCatalogue = buildSourceResult(
      { ...FULLSTACK_PAIR_MATRIX, suggestedStacks: [...BUILT_IN_MATRIX.suggestedStacks] },
      tempDir,
      { sourceConfig: { source: DEFAULT_SOURCE, sourceOrigin: "default" } },
    );

    await expect(refuseUnofferedStack(UNOFFERED_STACK_ID, publicCatalogue)).rejects.toHaveProperty(
      "message",
      `Stack '${UNOFFERED_STACK_ID}' is not a stack the source '${DEFAULT_SOURCE}' offers. A marketplace ships its own stacks; the CLI's built-in ones belong to the default public marketplace alone. It ships: ${builtInStackIds.slice(0, -1).join(", ")} and ${elementAt(builtInStackIds, builtInStackIds.length - 1)}.`,
    );
  });
});

/** Run on the real resolver, so each skill reference is the one a compile receives. */
describe("buildCompileAgents", () => {
  beforeEach(() => {
    initializeMatrix(FULLSTACK_TRIO_MATRIX);
  });

  const definitions = (...names: AgentName[]): Partial<Record<AgentName, AgentDefinition>> =>
    Object.fromEntries(names.map((name) => [name, createMockAgent(name)]));

  const REACT_AND_VITEST_STACK: Partial<Record<AgentName, StackAgentConfig>> = {
    [WEB_DEVELOPER]: {
      "web-framework": [sa(REACT, false)],
      "web-testing": [sa(VITEST, false)],
    },
  };

  const REACT_REF = {
    id: REACT,
    usage: "Use when working with web-framework.",
    preloaded: false,
    source: "eject",
  };
  const VITEST_REF = {
    id: VITEST,
    usage: "Use when working with web-testing.",
    preloaded: false,
    source: "eject",
  };

  it("carries a sub-agent's model, Codex model and effort onto its entry, stack or not", () => {
    const config = buildProjectConfig({
      agents: buildAgentConfigs([WEB_DEVELOPER], {
        model: "haiku",
        codexModel: "gpt-5.6-terra",
        effort: "high",
      }),
      skills: buildSkillConfigs([REACT]),
    });

    expect(buildCompileAgents(config, definitions(WEB_DEVELOPER))).toStrictEqual({
      [WEB_DEVELOPER]: { model: "haiku", codexModel: "gpt-5.6-terra", effort: "high" },
    });
  });

  it("hands a sub-agent each skill its stack assigns", () => {
    const config = buildProjectConfig({
      agents: buildAgentConfigs([WEB_DEVELOPER]),
      skills: buildSkillConfigs([REACT]),
      stack: { [WEB_DEVELOPER]: { "web-framework": [sa(REACT, false)] } },
    });

    expect(buildCompileAgents(config, definitions(WEB_DEVELOPER))).toStrictEqual({
      [WEB_DEVELOPER]: { skills: [REACT_REF] },
    });
  });

  it("leaves out a sub-agent no definition answers, and gives one with no stack row no skills", () => {
    const config = buildProjectConfig({
      agents: buildAgentConfigs([WEB_DEVELOPER, API_DEVELOPER]),
      skills: buildSkillConfigs([REACT]),
    });

    expect(buildCompileAgents(config, definitions(WEB_DEVELOPER))).toStrictEqual({
      [WEB_DEVELOPER]: {},
    });
  });

  it("hands each referenced skill the origin its config records", () => {
    const agents = buildCompileAgents(
      buildProjectConfig({
        skills: [buildSkillConfig(REACT, { origin: PLUGIN_MARKETPLACE })],
        agents: buildAgentConfigs([WEB_DEVELOPER]),
        stack: ASSIGNED_STACK,
      }),
      definitions(WEB_DEVELOPER),
    );

    expect(agents[WEB_DEVELOPER]?.skills).toStrictEqual([
      { ...REACT_REF, source: PLUGIN_MARKETPLACE },
    ]);
  });

  it("gives a global sub-agent only the skills active at global scope", () => {
    const config = buildProjectConfig({
      agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
      skills: [...buildSkillConfigs([REACT]), ...buildSkillConfigs([VITEST], { scope: "global" })],
      stack: REACT_AND_VITEST_STACK,
    });

    expect(buildCompileAgents(config, definitions(WEB_DEVELOPER))).toStrictEqual({
      [WEB_DEVELOPER]: { skills: [VITEST_REF] },
    });
  });

  it("gives a project sub-agent every skill its stack assigns, whatever their scope", () => {
    const config = buildProjectConfig({
      agents: buildAgentConfigs([WEB_DEVELOPER]),
      skills: [...buildSkillConfigs([REACT]), ...buildSkillConfigs([VITEST], { scope: "global" })],
      stack: REACT_AND_VITEST_STACK,
    });

    expect(buildCompileAgents(config, definitions(WEB_DEVELOPER))).toStrictEqual({
      [WEB_DEVELOPER]: { skills: [REACT_REF, VITEST_REF] },
    });
  });

  describe("excluded entries", () => {
    it("leaves out a skill the configuration excludes", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs([WEB_DEVELOPER]),
        skills: [...buildSkillConfigs([REACT]), ...buildSkillConfigs([VITEST], { excluded: true })],
        stack: REACT_AND_VITEST_STACK,
      });

      expect(buildCompileAgents(config, definitions(WEB_DEVELOPER))).toStrictEqual({
        [WEB_DEVELOPER]: { skills: [REACT_REF] },
      });
    });

    it("leaves out a sub-agent the configuration excludes", () => {
      const config = buildProjectConfig({
        agents: [
          ...buildAgentConfigs([WEB_DEVELOPER]),
          ...buildAgentConfigs([API_DEVELOPER], { excluded: true }),
        ],
        skills: buildSkillConfigs([REACT]),
      });

      expect(buildCompileAgents(config, definitions(WEB_DEVELOPER, API_DEVELOPER))).toStrictEqual({
        [WEB_DEVELOPER]: {},
      });
    });

    it("keeps a skill whose excluded entry is only its other scope's, with its active entry's origin", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs([WEB_DEVELOPER]),
        skills: [
          ...buildSkillConfigs([REACT]),
          ...buildSkillConfigs([REACT], { scope: "global", origin: "agents-inc", excluded: true }),
        ],
        stack: { [WEB_DEVELOPER]: { "web-framework": [sa(REACT, false)] } },
      });

      expect(buildCompileAgents(config, definitions(WEB_DEVELOPER))).toStrictEqual({
        [WEB_DEVELOPER]: { skills: [REACT_REF] },
      });
    });
  });
});
