import { mkdir, writeFile, readFile, realpath, symlink } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Override GLOBAL_INSTALL_ROOT to a non-existent path so getGlobalConfigTypesPath()
// returns null in the default case — the dev machine's real ~/.claude-src/ must
// never affect tests. Individual tests that need the global-types-import form
// override this via Object.defineProperty inside a scoped describe block.
vi.mock("../../consts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../consts")>();
  return { ...mod, GLOBAL_INSTALL_ROOT: "/tmp/nonexistent-global-root" };
});

import { resolveInstallPaths } from "./install-base-dir";
import {
  installEject,
  buildEjectSkillsMap,
  buildCompileAgents,
  buildAgentScopeMap,
  setConfigMetadata,
} from "./local-installer";
// The pair writers this file exercises live in config-gate now and are no longer
// re-exported by `local-installer`, which is the point of the enforcement guard:
// nothing outside the gate may reach them through a public surface. A test is
// allowed the deep import — it is asserting on the implementation.
import {
  deregisterProjectPath as deregisterProjectPathUngated,
  mergeGlobalConfigs,
  propagateGlobalChangesToProjects,
  pruneGlobalEntriesFromRegisteredProjects,
  writeConfigFile as writeConfigFileUngated,
} from "../config-gate/propagate.js";
import { withGateToken } from "../config-gate/gate-token.js";
import { writeScopeConfigTypes, writeScopedFromWizard } from "../config-gate/index.js";
import type {
  AgentDefinition,
  AgentName,
  MergedSkillsMatrix,
  ProjectConfig,
  Skill,
  SkillId,
} from "../../types";
import { initializeMatrix } from "../matrix/matrix-provider";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  createMockCopiedSkill,
  createMockSkillEntry,
} from "../__tests__/factories/skill-factories";
import { createMockAgent } from "../__tests__/factories/agent-factories";
import { createMockMatrix } from "../__tests__/factories/matrix-factories";
import {
  buildWizardResult,
  buildProjectConfig,
  buildSourceResult,
  buildAgentConfigs,
} from "../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";
import { readGeneratedUnion } from "../__tests__/helpers/generated-types.js";
import { readTestTsConfig } from "../__tests__/helpers/config-io";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { loadSkillsFromAllSources } from "../loading";
import { DEFAULT_SOURCE, defaultStacks } from "../configuration";
import { fileExists } from "../../utils/fs";
import { expectInstallResult } from "../__tests__/assertions/index.js";
import { SKILLS } from "../__tests__/test-fixtures";
import {
  CATEGORY_EXCLUSIVITY_MATRIX,
  EMPTY_MATRIX,
  FULLSTACK_PAIR_MATRIX,
  FULLSTACK_TRIO_MATRIX,
  REACT_HONO_WEB_API_DOMAINS_MATRIX,
  SINGLE_REACT_MATRIX,
} from "../__tests__/mock-data/mock-matrices";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_PLUGIN_NAME,
  DEFAULT_PUBLIC_SOURCE_NAME,
  GLOBAL_CONFIG_NAME,
  LOCAL_SKILLS_PATH,
  STANDARD_FILES,
} from "../../consts";
import { generateConfigSource } from "../configuration/config-writer";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { TEST_CUSTOM_SOURCE_URL } from "../__tests__/test-constants";

// Mock heavy dependencies that involve file system operations outside our temp dir
vi.mock("../skills/skill-copier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../skills/skill-copier")>()),
  copySkillsToLocalFlattened: vi.fn().mockResolvedValue([]),
}));

vi.mock("../loading/loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loading/loader")>()),
  loadAllAgents: vi.fn().mockResolvedValue({}),
}));

vi.mock("../stacks/stacks-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stacks/stacks-loader")>();
  return {
    ...actual,
    loadStackById: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../resolver")>()),
  resolveAgents: vi.fn().mockResolvedValue({}),
  buildSkillRefsFromConfig: vi.fn().mockReturnValue([]),
}));

vi.mock("../compiler", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../compiler")>()),
  createLiquidEngine: vi.fn().mockResolvedValue({}),
  compileAgentForPlugin: vi.fn().mockResolvedValue("# compiled agent content"),
}));

vi.mock("../configuration/config-generator", async (importOriginal) => {
  const original = await importOriginal<typeof import("../configuration/config-generator")>();
  return {
    // Echoes the `name` argument, exactly as the real generator does — the seed
    // its caller passes IS the config's name, so a spec asserting on the written
    // name has to be able to see which seed arrived. The remaining values stay
    // literal because vi.mock factories are hoisted above imports.
    generateProjectConfigFromSkills: vi.fn().mockImplementation((name: string) => ({
      name,
      agents: [],
      skills: [{ id: "test-skill", scope: "project", source: "eject" }],
    })),
    buildStackProperty: vi.fn().mockReturnValue({}),
    // Use real splitConfigByScope for scope-aware config writing
    splitConfigByScope: original.splitConfigByScope,
    // Use real scopeEligibilityKey — pure string helper used by buildEjectConfig's
    // D-220 delta computation.
    scopeEligibilityKey: original.scopeEligibilityKey,
    // Use real isScopePairCompatible — pure scope rule used by computeScopeEligibilityGained
    isScopePairCompatible: original.isScopePairCompatible,
  };
});

/**
 * Writes a config fixture, holding the gate's write token.
 *
 * Some of these fixtures ARE the global pair's config half at the fake home, and
 * the runtime tripwire in `utils/fs` refuses that path to anything outside the
 * gate — correctly: a production caller reaching it this way would be the exact
 * bypass the tripwire exists to stop. Here the test is standing in for the gate,
 * seeding the prior state a spec needs, so it takes the token explicitly.
 */
function writeConfigFile(...args: Parameters<typeof writeConfigFileUngated>): Promise<void> {
  return withGateToken(() => writeConfigFileUngated(...args));
}

/**
 * Deregisters a project, holding the gate's write token.
 *
 * Same standing-in-for-the-gate arrangement as `writeConfigFile` above. Since
 * D-309 no `pair-writer` or `propagate` function mints the privilege on its own
 * behalf — the gate's PUBLIC entry points do — and `deregisterProjectPath` has no
 * public entry left (`mutateGlobal({ kind: "deregister-project" })` replaced it
 * in production), so its remaining callers, all specs, supply the token.
 */
function deregisterProjectPath(
  ...args: Parameters<typeof deregisterProjectPathUngated>
): Promise<void> {
  return withGateToken(() => deregisterProjectPathUngated(...args));
}

/**
 * Positional-argument shape of the gate's `writeScopedFromWizard`, kept so these
 * specs read as they did when `writeScopedConfigs` was the entry point. Pure
 * argument shuffling — the code under test is the gate's.
 */
async function writeScopedConfigs(
  finalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  projectDir: string,
  projectConfigPath: string,
  projectInstallationExists: boolean,
): Promise<void> {
  await writeScopedFromWizard({
    finalConfig,
    matrix,
    agents,
    projectDir,
    projectConfigPath,
    projectInstallationExists,
  });
}

/** Positional-argument shape of the gate's `writeScopeConfigTypes`. */
async function regenerateScopeConfigTypes(
  projectDir: string,
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
): Promise<void> {
  await writeScopeConfigTypes(projectDir, config, { matrix, agents });
}

// Access the mock to verify installMode is passed through
const mockCompileAgentForPlugin = vi.mocked((await import("../compiler")).compileAgentForPlugin);
const mockResolveAgents = vi.mocked((await import("../resolver")).resolveAgents);
const mockBuildSkillRefs = vi.mocked((await import("../resolver")).buildSkillRefsFromConfig);
const mockGenerateProjectConfig = vi.mocked(
  (await import("../configuration/config-generator")).generateProjectConfigFromSkills,
);
const mockBuildStackProperty = vi.mocked(
  (await import("../configuration/config-generator")).buildStackProperty,
);
const mockLoadStackById = vi.mocked((await import("../stacks/stacks-loader")).loadStackById);

// Boundary cast: fictional skill ID used throughout local-installer tests
const TEST_SKILL_ID = "meta-test-skill" as SkillId;

/** A shipped stack, read as the wizard reads it — the built-in tier under test. */
const BUILT_IN_STACK_ID = "nextjs-fullstack";

describe("local-installer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-installer-test-");
    initializeMatrix(EMPTY_MATRIX);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("installEject", () => {
    useFakeHome(() => tempDir);

    it("should create required directories", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // Verify directories were created
      expect(await fileExists(path.join(tempDir, CLAUDE_DIR, "skills"))).toBe(true);
      expect(await fileExists(path.join(tempDir, CLAUDE_DIR, "agents"))).toBe(true);
      expect(await fileExists(path.join(tempDir, CLAUDE_SRC_DIR))).toBe(true);
    });

    it("should write config to .claude-src/config.ts", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // Verify config was written — full round-trip through disk
      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: tempDir,
      });
      expect(result.configPath).toBe(configPath);
    });

    it("should include source in config from sourceFlag", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
        sourceFlag: "github:my-org/skills",
      });

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: "github:my-org/skills",
      });
    });

    it("should include source from sourceResult when no sourceFlag", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir, {
        sourceConfig: {
          source: "github:default/source",
          sourceOrigin: "project",
        },
      });

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: "github:default/source",
      });
    });

    it("should include marketplace in config when available", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir, {
        marketplace: "my-marketplace",
      });

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: tempDir,
        marketplace: "my-marketplace",
      });
    });

    it("should return correct result structure", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result).toStrictEqual({
        copiedSkills: [],
        config: {
          name: path.basename(tempDir),
          agents: [],
          skills: [{ id: "test-skill", scope: "project", source: "eject" }],
          source: tempDir,
        },
        configPath: path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
        compiledAgents: [],
        wasMerged: false,
        skillsDir: path.join(tempDir, LOCAL_SKILLS_PATH),
        agentsDir: path.join(tempDir, CLAUDE_DIR, "agents"),
      });
    });

    it("should merge with existing config when present", async () => {
      // Write an existing config in TS format
      const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      // Boundary cast: test provides a synthetic agent name not in the AgentName union
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        generateConfigSource({
          name: "existing-project",
          agents: [{ name: "existing-agent" as AgentName, scope: "project" as const }],
          skills: [],
          author: "@existing",
        }),
      );

      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expectInstallResult(result, {
        copiedSkillIds: [],
        compiledAgents: [],
        wasMerged: true,
      });
      expect(result.mergedConfigPath).toBe(
        path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
      );
      // Existing name should take precedence
      expect(result.config.name).toBe("existing-project");
      // Existing author should be preserved
      expect(result.config.author).toBe("@existing");
    });

    it("should derive local installMode from skill configs", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(
        buildSkillConfigs([TEST_SKILL_ID], { source: "eject" }),
      );
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // installMode is derived from skills at runtime, not stored on config
      expect(result.config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: tempDir,
      });
    });

    it("should not set wasMerged when no existing config", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expectInstallResult(result, {
        copiedSkillIds: [],
        compiledAgents: [],
        wasMerged: false,
      });
      expect(result.mergedConfigPath).toBeUndefined();
    });

    it("should pass per-skill source on skills to compileAgentForPlugin in plugin mode", async () => {
      // D-217: installMode is gone — per-skill `source` on each Skill drives
      // pluginRef attachment. Seed resolveAgents with a skill carrying a
      // marketplace source and assert the agent arg forwards it.
      const pluginSkill: Skill = createMockSkillEntry(TEST_SKILL_ID, false, {
        source: "agents-inc",
      });
      mockResolveAgents.mockResolvedValueOnce({
        "web-developer": {
          name: "web-developer",
          title: "Web Dev",
          description: "A dev",
          tools: ["Read"],
          skills: [pluginSkill],
        },
      });

      // Override generateProjectConfigFromSkills to return plugin-sourced skills
      mockGenerateProjectConfig.mockReturnValueOnce(
        buildProjectConfig({
          name: "agents-inc",
          skills: buildSkillConfigs([TEST_SKILL_ID], { source: "agents-inc" }),
        }),
      );

      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(
        buildSkillConfigs([TEST_SKILL_ID], { source: "agents-inc" }),
      );
      const sourceResult = buildSourceResult(matrix, tempDir);

      mockCompileAgentForPlugin.mockClear();

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expect(mockCompileAgentForPlugin).toHaveBeenCalledTimes(1);
      const [name, agent, ...rest] = firstElement(mockCompileAgentForPlugin.mock.calls);
      expect(name).toBe("web-developer");
      // Only the first two positional args carry behavioural contract; the last
      // two (sourcePath, engine) are infra and asserted only by arity.
      expect(rest).toHaveLength(2);
      expect(agent.skills).toStrictEqual([pluginSkill]);
      // Explicit per-skill assertion: every skill carries a non-"eject" source
      // (i.e., a marketplace name) so the compiler attaches pluginRef.
      for (const skill of agent.skills) {
        expect(skill.source).toBe("agents-inc");
      }
    });

    it("should pass per-skill source on skills to compileAgentForPlugin in eject mode", async () => {
      // D-217: installMode is gone — per-skill `source: "eject"` tells the
      // compiler to emit a bare id (no pluginRef). Seed resolveAgents with an
      // ejected skill and assert the agent arg forwards it.
      const ejectSkill: Skill = createMockSkillEntry(TEST_SKILL_ID, false, {
        source: "eject",
      });
      mockResolveAgents.mockResolvedValueOnce({
        "web-developer": {
          name: "web-developer",
          title: "Web Dev",
          description: "A dev",
          tools: ["Read"],
          skills: [ejectSkill],
        },
      });

      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(
        buildSkillConfigs([TEST_SKILL_ID], { source: "eject" }),
      );
      const sourceResult = buildSourceResult(matrix, tempDir);

      mockCompileAgentForPlugin.mockClear();

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expect(mockCompileAgentForPlugin).toHaveBeenCalledTimes(1);
      const [name, agent, ...rest] = firstElement(mockCompileAgentForPlugin.mock.calls);
      expect(name).toBe("web-developer");
      expect(rest).toHaveLength(2);
      expect(agent.skills).toStrictEqual([ejectSkill]);
      // Explicit per-skill assertion: every skill has source === "eject".
      for (const skill of agent.skills) {
        expect(skill.source).toBe("eject");
      }
    });

    it("should write valid config with satisfies ProjectConfig", async () => {
      const matrix = EMPTY_MATRIX;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(matrix, tempDir);

      await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const configContent = await readFile(configPath, "utf-8");

      // Should use plain object export with satisfies
      expect(configContent).not.toContain("defineConfig");
      expect(configContent).toContain("export default {");
      expect(configContent).toContain("satisfies ProjectConfig");

      // Should parse back to the exact expected config
      const config = await readTestTsConfig<ProjectConfig>(configPath);
      expect(config).toStrictEqual({
        name: path.basename(tempDir),
        agents: [],
        skills: [{ id: "test-skill", scope: "project", source: "eject" }],
        source: tempDir,
      });
    });

    it("should preserve preloaded flags from stack skill assignments", async () => {
      // Stack-picked init seeds `existingStack` from `buildStackProperty(loadedStack)`.
      // The real `generateProjectConfigFromSkills` then inherits the author's flag for
      // every (agent, category, skill) triple the stack marked — third-party stack YAML
      // is the explicit tier. Exercise the real seam end-to-end — no config-generator mocks.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const configGenerator = await vi.importActual<
        typeof import("../configuration/config-generator")
      >("../configuration/config-generator");
      mockGenerateProjectConfig.mockImplementationOnce(
        configGenerator.generateProjectConfigFromSkills,
      );
      mockBuildStackProperty.mockImplementationOnce(configGenerator.buildStackProperty);
      mockLoadStackById.mockResolvedValueOnce({
        id: "test-stack",
        name: "Test Stack",
        description: "A test stack",
        agents: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });

      const selectedAgents: AgentName[] = ["web-developer"];
      const wizardResult = buildWizardResult(buildSkillConfigs(["web-framework-react"]), {
        selectedStackId: "test-stack",
        selectedAgents,
        agentConfigs: buildAgentConfigs(selectedAgents),
      });
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // Preloaded: true from the stack YAML must round-trip into the final config stack
      expect(result.config.stack?.["web-developer"]?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);

      // And it must be persisted to disk identically
      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      const parsedWebDev = parsedConfig.stack?.["web-developer"] as Record<string, unknown>;
      expect(parsedWebDev["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);
    });

    it("loads a built-in stack's assignments the way the shared mapping does", async () => {
      // A built-in stack says which skills a sub-agent gets and nothing about how
      // any of them loads, so applying one is a NEW selection: every pair goes
      // through the same mapping a hand-picked skill does. Per pair, which is why
      // one framework preloads on the web developer and arrives lazily on the
      // codex-keeper that also carries it.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const configGenerator = await vi.importActual<
        typeof import("../configuration/config-generator")
      >("../configuration/config-generator");
      mockGenerateProjectConfig.mockImplementationOnce(
        configGenerator.generateProjectConfigFromSkills,
      );
      mockBuildStackProperty.mockImplementationOnce(configGenerator.buildStackProperty);
      mockLoadStackById.mockResolvedValueOnce(
        defaultStacks.find((stack) => stack.id === BUILT_IN_STACK_ID)!,
      );

      const selectedAgents: AgentName[] = ["web-developer", "codex-keeper"];
      const wizardResult = buildWizardResult(buildSkillConfigs(["web-framework-react"]), {
        selectedStackId: BUILT_IN_STACK_ID,
        selectedAgents,
        agentConfigs: buildAgentConfigs(selectedAgents),
      });
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result.config.stack?.["web-developer"]?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);
      expect(result.config.stack?.["codex-keeper"]?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react" },
      ]);

      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      const parsedWebDev = parsedConfig.stack?.["web-developer"] as Record<string, unknown>;
      const parsedKeeper = parsedConfig.stack?.["codex-keeper"] as Record<string, unknown>;
      expect(parsedWebDev["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);
      // A lazy assignment is written in its bare form — the id says everything.
      expect(parsedKeeper["web-framework"]).toStrictEqual(["web-framework-react"]);
    });

    it("keeps the saved load when a built-in stack is re-applied over an installed config", async () => {
      // An installed config is the user's curation, and a re-run that re-picks the
      // same stack must not overwrite it with the mapping's opinion — both entries
      // below say the opposite of what the mapping would.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const selectedAgents: AgentName[] = ["web-developer", "codex-keeper"];
      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeConfigFile(
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"]),
          agents: buildAgentConfigs(selectedAgents),
          stack: {
            "web-developer": { "web-framework": [{ id: "web-framework-react" }] },
            "codex-keeper": {
              "web-framework": [{ id: "web-framework-react", preloaded: true }],
            },
          },
        }),
        configPath,
      );

      const configGenerator = await vi.importActual<
        typeof import("../configuration/config-generator")
      >("../configuration/config-generator");
      mockGenerateProjectConfig.mockImplementationOnce(
        configGenerator.generateProjectConfigFromSkills,
      );
      mockBuildStackProperty.mockImplementationOnce(configGenerator.buildStackProperty);
      mockLoadStackById.mockResolvedValueOnce(
        defaultStacks.find((stack) => stack.id === BUILT_IN_STACK_ID)!,
      );

      const wizardResult = buildWizardResult(buildSkillConfigs(["web-framework-react"]), {
        selectedStackId: BUILT_IN_STACK_ID,
        selectedAgents,
        agentConfigs: buildAgentConfigs(selectedAgents),
      });
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result.config.stack?.["web-developer"]?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react" },
      ]);
      expect(result.config.stack?.["codex-keeper"]?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);

      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      const parsedWebDev = parsedConfig.stack?.["web-developer"] as Record<string, unknown>;
      const parsedKeeper = parsedConfig.stack?.["codex-keeper"] as Record<string, unknown>;
      expect(parsedWebDev["web-framework"]).toStrictEqual(["web-framework-react"]);
      expect(parsedKeeper["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);
    });

    it("stack-picked init filters unselected agents out of the stack", async () => {
      // When the wizard picks a stack but the user deselects some of its agents,
      // the final config.stack must only contain the selected agents. Ownership-driven
      // stack construction (in generateProjectConfigFromSkills) drops agents not in
      // `selectedAgents` even when the stack YAML lists them.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const configGenerator = await vi.importActual<
        typeof import("../configuration/config-generator")
      >("../configuration/config-generator");
      mockGenerateProjectConfig.mockImplementationOnce(
        configGenerator.generateProjectConfigFromSkills,
      );
      mockBuildStackProperty.mockImplementationOnce(configGenerator.buildStackProperty);
      mockLoadStackById.mockResolvedValueOnce({
        id: "fullstack",
        name: "Fullstack",
        description: "Web + API",
        agents: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: true }],
          },
        },
      });

      // User selected only web-developer; api-developer is intentionally absent.
      const selectedAgents: AgentName[] = ["web-developer"];
      const wizardResult = buildWizardResult(
        buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
        {
          selectedStackId: "fullstack",
          selectedAgents,
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      // Only web-developer appears in the final stack — api-developer is filtered
      // because the user did not select it, despite the stack YAML listing it.
      expect(Object.keys(result.config.stack ?? {})).toStrictEqual(["web-developer"]);
      expect(result.config.stack?.["api-developer"]).toBeUndefined();
      // Full content: guards against a silent regression that preserves the key
      // but drops or mutates the SkillAssignment payload.
      expect(result.config.stack?.["web-developer"]?.["web-framework"]).toStrictEqual([
        { id: "web-framework-react", preloaded: true },
      ]);
    });

    it("names the stack id and the source it asked when the stack does not resolve", async () => {
      // A saved config or a shared payload can name a stack the loaded source
      // does not have — a built-in id under a custom marketplace being the case
      // that used to be answered with somebody else's stack. Null is the honest
      // answer, and the install says which id it was and where it looked.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);
      mockLoadStackById.mockResolvedValueOnce(null);

      const selectedAgents: AgentName[] = ["web-developer"];
      const wizardResult = buildWizardResult(buildSkillConfigs(["web-framework-react"]), {
        selectedStackId: BUILT_IN_STACK_ID,
        selectedAgents,
        agentConfigs: buildAgentConfigs(selectedAgents),
      });
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir, {
        sourceConfig: { source: TEST_CUSTOM_SOURCE_URL, sourceOrigin: "flag" },
      });

      const install = installEject({ wizardResult, sourceResult, projectDir: tempDir });
      await expect(install).rejects.toThrow(BUILT_IN_STACK_ID);
      await expect(install).rejects.toThrow(TEST_CUSTOM_SOURCE_URL);

      // The source identity is what scopes the lookup, so it has to reach it.
      expect(mockLoadStackById).toHaveBeenCalledWith(
        BUILT_IN_STACK_ID,
        sourceResult.sourcePath,
        TEST_CUSTOM_SOURCE_URL,
      );
    });

    it("writes a seed payload's assignedStack verbatim, cross-domain rows included", async () => {
      // `init --from` decodes per-(skill, agent) assignments into an
      // `assignedStack` that REPLACES the ownership-derived stack. Those rows
      // are the sharer's explicit choices — the explicit tier — so the
      // relevance rule that scopes NEW derived triples never re-filters them,
      // even where a pair crosses domains.
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const configGenerator = await vi.importActual<
        typeof import("../configuration/config-generator")
      >("../configuration/config-generator");
      mockGenerateProjectConfig.mockImplementationOnce(
        configGenerator.generateProjectConfigFromSkills,
      );

      const selectedAgents: AgentName[] = ["api-developer", "web-developer"];
      const wizardResult = buildWizardResult(
        buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
        {
          selectedAgents,
          agentConfigs: buildAgentConfigs(selectedAgents),
          assignedStack: {
            // The sharer put the web skill on the api agent deliberately.
            "api-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: true }],
            },
            "web-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: false }],
            },
          },
        },
      );
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: tempDir,
      });

      expect(result.config.stack).toStrictEqual({
        "api-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      });

      // And it must be persisted to disk with both rows intact. The writer's
      // canonical form spells a lazy assignment as the bare id string.
      const configPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.stack).toStrictEqual({
        "api-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        "web-developer": {
          "web-framework": ["web-framework-react"],
        },
      });
    });
  });

  describe("config identity and cross-scope curation", () => {
    const fakeHome = useFakeHome(() => tempDir);

    it("a global install is named for the product, never for the home directory", async () => {
      // At $HOME there is no project to name. `path.basename(os.homedir())` is the
      // OS account name — it identifies the user rather than the installation, and
      // it differs per machine for one logical install, so the global config keeps
      // the product constant. Only a project config takes its directory's name.
      initializeMatrix(EMPTY_MATRIX);
      const homeDir = fakeHome.dir;
      const wizardResult = buildWizardResult(
        buildSkillConfigs([TEST_SKILL_ID], { scope: "global" }),
      );
      const sourceResult = buildSourceResult(EMPTY_MATRIX, homeDir);

      const result = await installEject({ wizardResult, sourceResult, projectDir: homeDir });

      const configPath = path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      const config = await readTestTsConfig<ProjectConfig>(configPath);
      expect(config.name).toBe(DEFAULT_PLUGIN_NAME);
      expect(config.name).not.toBe(path.basename(homeDir));
      expect(result.config.name).toBe(DEFAULT_PLUGIN_NAME);

      // Both halves of the global pair land — the config half's
      // `satisfies ProjectConfig` resolves against the types half beside it.
      expect(
        await fileExists(path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TYPES_TS)),
      ).toBe(true);
    });

    it("a sub-agent moved from global to project keeps the catalogue its stack curated", async () => {
      initializeMatrix(FULLSTACK_PAIR_MATRIX);

      const globalScopedSkills = buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
        scope: "global",
      });

      // The global config is the only carrier of a GLOBAL sub-agent's curation: a
      // project config filters its stack down to project-scoped agents, so
      // web-developer's rows never appear there while it lives at global scope.
      // The api row is deliberately cross-domain — the shared resolver never hands
      // an api skill to a web agent, so it can only be there as somebody's choice.
      const globalConfigPath = path.join(fakeHome.dir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(
        buildProjectConfig({
          name: GLOBAL_CONFIG_NAME,
          skills: globalScopedSkills,
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          stack: {
            "web-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: true }],
              "api-api": [{ id: "api-framework-hono" }],
            },
          },
        }),
        globalConfigPath,
      );

      const projectConfigPath = path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });
      await writeConfigFile(
        buildProjectConfig({
          skills: globalScopedSkills,
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
        projectConfigPath,
      );

      const configGenerator = await vi.importActual<
        typeof import("../configuration/config-generator")
      >("../configuration/config-generator");
      mockGenerateProjectConfig.mockImplementationOnce(
        configGenerator.generateProjectConfigFromSkills,
      );

      // The `s` toggle on a global agent: an active project entry paired with a
      // tombstone over the global install. api-developer arrives selected for the
      // first time at either scope — nobody has curated it, so it seeds.
      const selectedAgents: AgentName[] = ["web-developer", "api-developer"];
      const wizardResult = buildWizardResult(globalScopedSkills, {
        selectedAgents,
        agentConfigs: [
          ...buildAgentConfigs(selectedAgents, { scope: "project" }),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });
      const sourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, tempDir);

      const result = await installEject({ wizardResult, sourceResult, projectDir: tempDir });

      // A scope change moves WHERE a sub-agent lives, never WHAT it knows.
      expect(result.config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: true }],
        "api-api": [{ id: "api-framework-hono" }],
      });
      // A sub-agent nobody has curated still seeds from the relevance rule, which
      // targets the api framework at the api agent and no web skill at all.
      expect(result.config.stack?.["api-developer"]).toStrictEqual({
        "api-api": [{ id: "api-framework-hono", preloaded: true }],
      });

      // Boundary cast: the writer spells a flag-less assignment as a bare id, which
      // is narrower than ProjectConfig's declared SkillAssignment[].
      const projectConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
      const writtenWebDeveloper = projectConfig.stack?.["web-developer"] as Record<string, unknown>;
      const writtenApiDeveloper = projectConfig.stack?.["api-developer"] as Record<string, unknown>;
      expect(writtenWebDeveloper).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: true }],
        "api-api": ["api-framework-hono"],
      });
      expect(writtenApiDeveloper).toStrictEqual({
        "api-api": [{ id: "api-framework-hono", preloaded: true }],
      });

      // The global config still owns what it curated: a project-context edit takes
      // the agent into this project, it never migrates global state out.
      const globalConfig = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      const globalWebDeveloper = globalConfig.stack?.["web-developer"] as Record<string, unknown>;
      expect(globalWebDeveloper).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: true }],
        "api-api": ["api-framework-hono"],
      });
    });
  });

  describe("writeScopedConfigs", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir);

    it("should skip project config when no existing project installation and no project-scoped items", async () => {
      // Setup: all items are global-scoped, so project split will be empty.
      // No project installation exists, so project config should be skipped.
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const projectDir = path.join(tempDir, "project-dir");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

      // Ensure project .claude-src/ directory exists but do NOT create config.ts
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false, // no existing project installation
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      expect(await fileExists(globalConfigPath)).toBe(true);

      // Project config should NOT be written (no existing config and no project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(false);
    });

    it("should write project config when project split has skills", async () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"]),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-researcher"]),
        ],
      });

      const projectDir = path.join(tempDir, "project-dir");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false, // no existing project installation, but project-scoped items exist
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      expect(await fileExists(globalConfigPath)).toBe(true);
      // Project config should be written (has project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(true);

      // Verify project config contains the project-scoped skill
      const projectParsed = await readTestTsConfig<ProjectConfig>(projectConfigPath);
      expect(projectParsed.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);

      // Verify global config contains the global-scoped skill
      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);
    });
  });

  describe("resolveInstallPaths", () => {
    it("should resolve project-scope paths relative to projectDir", () => {
      const result = resolveInstallPaths("/my/project", "project");

      expect(result.skillsDir).toBe(`/my/project/${LOCAL_SKILLS_PATH}`);
      expect(result.agentsDir).toBe(`/my/project/${CLAUDE_DIR}/agents`);
      expect(result.configPath).toBe(`/my/project/${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);
    });

    it("should resolve global-scope paths relative to home directory", () => {
      const homeDir = os.homedir();
      const result = resolveInstallPaths("/my/project", "global");

      expect(result.skillsDir).toBe(path.join(homeDir, LOCAL_SKILLS_PATH));
      expect(result.agentsDir).toBe(path.join(homeDir, CLAUDE_DIR, "agents"));
      expect(result.configPath).toBe(path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS));
    });

    it("should default to project scope when no scope argument provided", () => {
      const result = resolveInstallPaths("/my/project");

      expect(result.skillsDir).toBe(`/my/project/${LOCAL_SKILLS_PATH}`);
      expect(result.agentsDir).toBe(`/my/project/${CLAUDE_DIR}/agents`);
      expect(result.configPath).toBe(`/my/project/${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);
    });
  });

  describe("buildEjectSkillsMap", () => {
    it("should map copied skills that exist in the matrix", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);

      const copiedSkills = [createMockCopiedSkill("web-framework-react")];

      const result = buildEjectSkillsMap(copiedSkills);

      expect(result["web-framework-react"]).toStrictEqual({
        id: "web-framework-react",
        description: SINGLE_REACT_MATRIX.skills["web-framework-react"]!.description,
        path: "/project/.claude/skills/web-framework-react",
        content: "",
      });
    });

    it("should filter out copied skills not in the matrix", () => {
      initializeMatrix(EMPTY_MATRIX);

      // web-nonexistent-skill is a deliberately-invalid id (not a matrix member) — cast stays
      const copiedSkills = [createMockCopiedSkill("web-nonexistent-skill" as SkillId)];

      const result = buildEjectSkillsMap(copiedSkills);

      expect(result).toStrictEqual({});
    });

    it("should return empty map when no skills are copied", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);

      const result = buildEjectSkillsMap([]);

      expect(result).toStrictEqual({});
    });

    it("should handle mixed copied skills — some in matrix, some not", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);

      const copiedSkills = [
        createMockCopiedSkill("web-framework-react"),
        // web-nonexistent-skill is a deliberately-invalid id (not a matrix member) — cast stays
        createMockCopiedSkill("web-nonexistent-skill" as SkillId),
      ];

      const result = buildEjectSkillsMap(copiedSkills);

      expect(result).toStrictEqual({
        "web-framework-react": {
          id: "web-framework-react",
          description: SINGLE_REACT_MATRIX.skills["web-framework-react"]!.description,
          path: "/project/.claude/skills/web-framework-react",
          content: "",
        },
      });
    });
  });

  describe("buildCompileAgents", () => {
    it("should build compile agents for agents in the definition record", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const agents: Partial<Record<AgentName, AgentDefinition>> = {
        "web-developer": createMockAgent("web-developer"),
      };

      const result = buildCompileAgents(config, agents);

      expect(result).toStrictEqual({
        "web-developer": { skills: [] },
      });
    });

    it("should skip agents not in the definition record", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer", "api-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
      });
      // Only web-developer has a definition
      const agents: Partial<Record<AgentName, AgentDefinition>> = {
        "web-developer": createMockAgent("web-developer"),
      };

      const result = buildCompileAgents(config, agents);

      expect(result["web-developer"]).toStrictEqual({});
      expect(result["api-developer"]).toBeUndefined();
    });

    it("should return empty skills when agent has no stack mapping", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        // No stack property
      });
      const agents: Partial<Record<AgentName, AgentDefinition>> = {
        "web-developer": createMockAgent("web-developer"),
      };

      const result = buildCompileAgents(config, agents);

      expect(result["web-developer"]).toStrictEqual({});
    });

    it("should filter global agent skills to only global-scoped skills (cross-scope safety net)", async () => {
      // Set up buildSkillRefsFromConfig mock to return both skills
      mockBuildSkillRefs.mockReturnValueOnce([
        { id: "web-framework-react", usage: "when working with web-framework" },
        { id: "web-testing-vitest", usage: "when working with web-testing" },
      ]);

      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global" }),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });
      const agents: Partial<Record<AgentName, AgentDefinition>> = {
        "web-developer": createMockAgent("web-developer"),
      };

      const result = buildCompileAgents(config, agents);

      // Global agent should only see web-testing-vitest (global scope), not web-framework-react (project scope)
      const skills = result["web-developer"]?.skills ?? [];
      const skillIds = skills.map((s) => s.id);
      expect(skillIds).toContain("web-testing-vitest");
      expect(skillIds).not.toContain("web-framework-react");
    });

    it("should not filter project-scoped agent skills", async () => {
      // Set up buildSkillRefsFromConfig mock to return both skills
      mockBuildSkillRefs.mockReturnValueOnce([
        { id: "web-framework-react", usage: "when working with web-framework" },
        { id: "web-testing-vitest", usage: "when working with web-testing" },
      ]);

      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global" }),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });
      const agents: Partial<Record<AgentName, AgentDefinition>> = {
        "web-developer": createMockAgent("web-developer"),
      };

      const result = buildCompileAgents(config, agents);

      // Project agent should see all skills regardless of scope
      const skills = result["web-developer"]?.skills ?? [];
      const skillIds = skills.map((s) => s.id);
      expect(skillIds).toContain("web-framework-react");
      expect(skillIds).toContain("web-testing-vitest");
    });

    describe("excluded filtering", () => {
      it("should exclude skills with excluded: true from compilation", async () => {
        mockBuildSkillRefs.mockReturnValueOnce([
          { id: "web-framework-react", usage: "when working with web-framework" },
          { id: "web-testing-vitest", usage: "when working with web-testing" },
        ]);

        const config = buildProjectConfig({
          agents: buildAgentConfigs(["web-developer"]),
          skills: [
            ...buildSkillConfigs(["web-framework-react"]),
            ...buildSkillConfigs(["web-testing-vitest"], { excluded: true }),
          ],
          stack: {
            "web-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: false }],
              "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
            },
          },
        });
        const agents: Partial<Record<AgentName, AgentDefinition>> = {
          "web-developer": createMockAgent("web-developer"),
        };

        const result = buildCompileAgents(config, agents);

        const skills = result["web-developer"]?.skills ?? [];
        const skillIds = skills.map((s) => s.id);
        expect(skillIds).toContain("web-framework-react");
        expect(skillIds).not.toContain("web-testing-vitest");
      });

      it("should exclude agents with excluded: true from compilation", () => {
        const config = buildProjectConfig({
          agents: [
            ...buildAgentConfigs(["web-developer"]),
            ...buildAgentConfigs(["api-developer"], { excluded: true }),
          ],
          skills: buildSkillConfigs(["web-framework-react"]),
        });
        const agents: Partial<Record<AgentName, AgentDefinition>> = {
          "web-developer": createMockAgent("web-developer"),
          "api-developer": createMockAgent("api-developer"),
        };

        const result = buildCompileAgents(config, agents);

        expect(result["web-developer"]).toStrictEqual({});
        expect(result["api-developer"]).toBeUndefined();
      });

      it("should handle mixed active and excluded entries for the same skill ID", async () => {
        mockBuildSkillRefs.mockReturnValueOnce([
          { id: "web-framework-react", usage: "when working with web-framework" },
        ]);

        const config = buildProjectConfig({
          agents: buildAgentConfigs(["web-developer"]),
          skills: [
            ...buildSkillConfigs(["web-framework-react"]),
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              source: "agents-inc",
              excluded: true,
            }),
          ],
          stack: {
            "web-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: false }],
            },
          },
        });
        const agents: Partial<Record<AgentName, AgentDefinition>> = {
          "web-developer": createMockAgent("web-developer"),
        };

        const result = buildCompileAgents(config, agents);

        // The active (non-excluded) entry should still produce skills
        const skills = result["web-developer"]?.skills ?? [];
        expect(skills.map((s) => s.id)).toContain("web-framework-react");
      });
    });
  });

  describe("buildAgentScopeMap", () => {
    it("should build a map from agent names to their scopes", () => {
      const config = buildProjectConfig({
        agents: [
          ...buildAgentConfigs(["web-developer"]),
          ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ],
      });

      const result = buildAgentScopeMap(config);

      expect(result.get("web-developer")).toBe("project");
      expect(result.get("api-developer")).toBe("global");
    });

    it("should return empty map for config with no agents", () => {
      const config = buildProjectConfig({ agents: [] });

      const result = buildAgentScopeMap(config);

      expect(result.size).toBe(0);
    });

    it("should handle single agent", () => {
      const config = buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
      });

      const result = buildAgentScopeMap(config);

      expect(result.size).toBe(1);
      expect(result.get("web-developer")).toBe("project");
    });
  });

  describe("mergeGlobalConfigs", () => {
    it("adds new category to existing agent's stack, preserving existing categories", () => {
      // Scenario: global has web-developer.web-framework. User adds a new global skill in
      // web-styling owned by web-developer. Incoming carries both categories. Additive merge:
      // the new category is appended, the existing category is preserved as-is.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-styling-scss-modules"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        // Existing category preserved (preloaded: false kept, NOT overwritten to true)
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        // New category appended from incoming
        "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
      });
      expect(changed).toBe(true);
    });

    it("preserves existing per-agent stack entry when incoming omits the agent", () => {
      // Scenario: an agent lives in existing global stack but has moved to project scope,
      // so splitConfigByScope omits it from incoming.stack. The existing entry must survive.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-styling-scss-modules"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
          // api-developer intentionally absent (moved to project scope)
        },
      });

      const { config } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["api-developer"]).toStrictEqual({
        "api-api": [{ id: "api-framework-hono", preloaded: false }],
      });
      // Existing entry survives unchanged (not replaced, not merged)
      expect(config.stack?.["api-developer"]).toStrictEqual(existing.stack?.["api-developer"]);
      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
      });
    });

    it("appends new skill under existing category, preserving existing skill", () => {
      // Additive-per-skill: react stays, vue is appended. Project-context edits cannot
      // remove vue from global; they'd tombstone it in the project config instead.
      const sharedSkills = buildSkillConfigs(
        ["web-framework-react", "web-framework-vue-composition-api"],
        { scope: "global" },
      );
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-vue-composition-api", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [
          { id: "web-framework-react", preloaded: false },
          { id: "web-framework-vue-composition-api", preloaded: false },
        ],
      });
      expect(changed).toBe(true);
    });

    it("adds skill to new agent while preserving it on existing agent", () => {
      // Additive across agents: react stays on web-developer AND is added to web-researcher.
      // Project-context edits cannot remove web-developer's assignment from global.
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer", "web-researcher"], {
        scope: "global",
      });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: {
          "web-researcher": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
      });
      expect(config.stack?.["web-researcher"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
      });
      expect(changed).toBe(true);
    });

    it("leaves changed false for a fully identical merge", () => {
      // Guards against Approach C creep — identical configs must not be flagged dirty.
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const sharedStack: NonNullable<ProjectConfig["stack"]> = {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      };
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: sharedStack,
        selectedDomains: ["web"],
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        stack: sharedStack,
        selectedDomains: ["web"],
      });

      const { changed } = mergeGlobalConfigs(existing, incoming);

      expect(changed).toBe(false);
    });

    it("preserves existing skills when incoming omits a skill under an existing category", () => {
      // Tombstone scenario: existing global has [react, vue]; user tombstones vue in the
      // PROJECT config so splitConfigByScope emits incoming global with [react] only.
      // Additive merge must preserve vue on the global side — the project's tombstone is
      // expressed in the project config, never by rewriting global state.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-framework-vue-composition-api"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [
              { id: "web-framework-react", preloaded: false },
              { id: "web-framework-vue-composition-api", preloaded: false },
            ],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [
          { id: "web-framework-react", preloaded: false },
          { id: "web-framework-vue-composition-api", preloaded: false },
        ],
      });
      expect(changed).toBe(false);
    });

    it("preserves existing preloaded flag when incoming has different preloaded for same triple", () => {
      // Additive-only: existing `preloaded: true` is authoritative. Project-context edits
      // cannot flip a global skill's preloaded flag; the existing entry wins.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: true }],
      });
      expect(changed).toBe(false);
    });

    it("preserves existing category when incoming omits it entirely for an existing agent", () => {
      // Whole-category tombstone: project tombstones every hono skill so incoming global
      // for web-developer has web-framework only. The api-api category (only in existing)
      // must survive.
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.stack?.["web-developer"]).toStrictEqual({
        "web-framework": [{ id: "web-framework-react", preloaded: false }],
        "api-api": [{ id: "api-framework-hono", preloaded: false }],
      });
      expect(changed).toBe(false);
    });

    it("does not mutate inputs and returns unaliased stack references", () => {
      // Rich overlap scenario: exercises every clone path in additiveMergeStack.
      //   - web-developer / web-framework:  react overlaps (existing wins), vue omitted from
      //     incoming (existing preserved), preloaded flag dedup path hit.
      //   - web-developer / web-styling:    existing-only category (untouched by incoming).
      //   - web-developer / web-testing:    incoming-only new category (append-clone path).
      //   - api-developer:                  existing-only agent (must survive absence in incoming).
      //   - web-researcher:                   incoming-only agent (full structuredClone path).
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(
          [
            "web-framework-react",
            "web-framework-vue-composition-api",
            "web-styling-scss-modules",
            "api-framework-hono",
          ],
          { scope: "global" },
        ),
        agents: buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [
              { id: "web-framework-react", preloaded: false },
              { id: "web-framework-vue-composition-api", preloaded: true },
            ],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer", "web-researcher"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
          "web-researcher": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      // Snapshot inputs before the call — deep clone detaches snapshots from live refs.
      const existingSnapshot = structuredClone(existing);
      const incomingSnapshot = structuredClone(incoming);

      const { config } = mergeGlobalConfigs(existing, incoming);

      // 1. Structural immutability — neither input's deep structure changed.
      expect(existing).toStrictEqual(existingSnapshot);
      expect(incoming).toStrictEqual(incomingSnapshot);

      // 2. Reference non-sharing at the stack level. Mutating the merged output's nested
      //    array must NOT bleed into `existing`. We use an overlapping (agent, category)
      //    pair so the merged array was cloned out of `existing.stack` — the exact path
      //    that a shallow clone would corrupt.
      const mergedWebFramework = config.stack?.["web-developer"]?.["web-framework"];
      const existingWebFramework = existing.stack?.["web-developer"]?.["web-framework"];
      expect(mergedWebFramework).toBeDefined();
      expect(existingWebFramework).toBeDefined();
      const existingWebFrameworkLengthBefore = existingWebFramework!.length;
      const SENTINEL = { id: "web-framework-react" as SkillId, preloaded: true as const };
      mergedWebFramework!.push(SENTINEL);
      // Existing array untouched — same length, no sentinel leaked in.
      expect(existing.stack?.["web-developer"]?.["web-framework"]).toHaveLength(
        existingWebFrameworkLengthBefore,
      );
      expect(existing.stack?.["web-developer"]?.["web-framework"]).not.toContain(SENTINEL);
      // And the input still matches its pre-call snapshot after the sentinel push to the output.
      expect(existing).toStrictEqual(existingSnapshot);

      // 3. Reference non-sharing for incoming-only agents — `web-researcher` was cloned out
      //    of `incoming.stack`, so mutating the merged entry must not corrupt incoming.
      const mergedWebReviewer = config.stack?.["web-researcher"]?.["web-framework"];
      expect(mergedWebReviewer).toBeDefined();
      mergedWebReviewer!.push(SENTINEL);
      expect(incoming).toStrictEqual(incomingSnapshot);
    });

    it("records the incoming marketplace and source when the global config has none", () => {
      // Project init: ensureBlankGlobalConfig() creates `existing` moments earlier, so it
      // carries no source identity. The global config is the only record tying globally
      // installed plugins back to their marketplace — uninstall builds its `<id>@<marketplace>`
      // registry key from it.
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
        marketplace: "e2e-test-marketplace",
        source: "/path/to/skills",
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.marketplace).toBe("e2e-test-marketplace");
      expect(config.source).toBe("/path/to/skills");
      // Newly-filled source identity must mark the merge dirty — `needsGlobalWrite` is gated
      // on this flag, so a false here would skip the global write and drop the fields again.
      expect(changed, "newly recorded source identity must trigger the global write").toBe(true);
    });

    it("keeps the existing marketplace and source when the incoming init came from a different one", () => {
      // Fill-only precedence. The merge never removes skills, so after this merge the global
      // config holds plugins from BOTH marketplaces and the scalar label can only name one.
      // Repointing it from a project context would rewrite global state on behalf of every
      // other registered project, so the already-recorded value wins.
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: sharedAgents,
        marketplace: "first-marketplace",
        source: "/path/to/first",
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: sharedAgents,
        marketplace: "second-marketplace",
        source: "/path/to/second",
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.marketplace).toBe("first-marketplace");
      expect(config.source).toBe("/path/to/first");
      // No delta at all — the global config must not be rewritten for an identical merge.
      expect(changed).toBe(false);
    });

    it("leaves marketplace and source undefined when neither config records one", () => {
      const sharedSkills = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      const sharedAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
      const existing: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
      });
      const incoming: ProjectConfig = buildProjectConfig({
        name: "global",
        skills: sharedSkills,
        agents: sharedAgents,
      });

      const { config, changed } = mergeGlobalConfigs(existing, incoming);

      expect(config.marketplace).toBeUndefined();
      expect(config.source).toBeUndefined();
      expect(changed).toBe(false);
    });
  });

  describe("setConfigMetadata", () => {
    it("should return a new config with selectedDomains when the wizard selected domains", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedDomains: ["web", "api"],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir);

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.selectedDomains).toStrictEqual(["web", "api"]);
    });

    it("should not set selectedDomains when the wizard selected none", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedDomains: [],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir);

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.selectedDomains).toBeUndefined();
    });

    it("never persists a flat agent list — agents[] is the only record of who is selected", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedAgents: ["web-developer", "api-developer"],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir);

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(Object.keys(result)).not.toContain("selectedAgents");
    });

    it("should prefer sourceFlag over sourceResult.sourceConfig.source", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir, {
        sourceConfig: { source: "github:default/source", sourceOrigin: "project" },
      });

      const result = setConfigMetadata(config, wizardResult, sourceResult, "github:my-org/skills");

      expect(result.source).toBe("github:my-org/skills");
    });

    it("should use sourceResult.sourceConfig.source when no sourceFlag", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir, {
        sourceConfig: { source: "github:default/source", sourceOrigin: "project" },
      });

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.source).toBe("github:default/source");
    });

    it("should set marketplace when available", () => {
      const config = buildProjectConfig();
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]));
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir, {
        marketplace: "my-marketplace",
      });

      const result = setConfigMetadata(config, wizardResult, sourceResult);

      expect(result.marketplace).toBe("my-marketplace");
    });

    it("should not mutate the original config object", () => {
      const config = buildProjectConfig();
      const originalName = config.name;
      const wizardResult = buildWizardResult(buildSkillConfigs([TEST_SKILL_ID]), {
        selectedDomains: ["web"],
        selectedAgents: ["web-developer"],
      });
      const sourceResult = buildSourceResult(EMPTY_MATRIX, tempDir, {
        marketplace: "my-marketplace",
      });

      const result = setConfigMetadata(config, wizardResult, sourceResult, "github:my/repo");

      // Original config should not be mutated
      expect(config.selectedDomains).toBeUndefined();
      expect(config.source).toBeUndefined();
      expect(config.marketplace).toBeUndefined();
      expect(config.name).toBe(originalName);

      // Result should have the new values
      expect(result.selectedDomains).toStrictEqual(["web"]);
      expect(result.source).toBe("github:my/repo");
      expect(result.marketplace).toBe("my-marketplace");
    });
  });

  describe("writeScopedConfigs with HOME isolation", () => {
    // Moved from e2e/lifecycle/unified-config-view.e2e.test.ts — these are unit tests
    // that call writeScopedConfigs directly, not E2E tests.
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir, { setHome: false });

    it("should skip project config file when no existing config on disk and no project-scoped items", async () => {
      const projectDir = path.join(tempDir, "project");

      process.env.HOME = fakeHomeHandle.dir;

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      expect(await fileExists(globalConfigPath)).toBe(true);

      // Verify global config contains the global-scoped skill
      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);

      // Project config should NOT be written (no existing project installation and no project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(false);
    });

    it("should write project config when project split has project-scoped items", async () => {
      const projectDir = path.join(tempDir, "project");

      process.env.HOME = fakeHomeHandle.dir;

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"]),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-researcher"]),
        ],
      });

      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      await writeScopedConfigs(
        config,
        EMPTY_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      // Global config should be written (blank existing global + has global-scoped items)
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      expect(await fileExists(globalConfigPath)).toBe(true);
      // Project config should be written (has project-scoped items)
      expect(await fileExists(projectConfigPath)).toBe(true);

      // Verify project config contains the project-scoped skill (parsed, not just string check)
      const projectParsed = await readTestTsConfig<ProjectConfig>(projectConfigPath);
      expect(projectParsed.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);

      // Project config should inline global data (no import globalConfig)
      const projectContent = await readFile(projectConfigPath, "utf-8");
      expect(projectContent).not.toContain("import globalConfig");
      expect(projectContent).toContain("// global");
      expect(projectContent).toContain("web-framework-react");

      // Verify global config contains the global-scoped skill
      const globalParsed = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(globalParsed.skills.some((s) => s.id === "web-framework-react")).toBe(true);
    });
  });

  // D-216 / D-228: writeScopedConfigs must emit project config-types.ts that
  // imports from the global install's config-types.ts (not an inlined standalone
  // union). Requires overriding GLOBAL_INSTALL_ROOT so getGlobalConfigTypesPath()
  // points at a test-controlled global dir.
  describe("writeScopedConfigs — project config-types imports from global", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    let savedHome: string | undefined;
    let fakeHome: string;
    let consts: typeof import("../../consts");

    beforeEach(async () => {
      savedHome = process.env.HOME;
      fakeHome = path.join(tempDir, "fake-home");
      await mkdir(fakeHome, { recursive: true });
      process.env.HOME = fakeHome;

      // Point GLOBAL_INSTALL_ROOT at the fake home so getGlobalConfigTypesPath()
      // detects the seeded global config-types.ts file inside the test's tempDir.
      consts = await import("../../consts");
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: fakeHome,
        writable: true,
      });
    });

    afterEach(() => {
      // Restore the default mocked GLOBAL_INSTALL_ROOT so other tests don't pick
      // up the fake home after this block finishes.
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: "/tmp/nonexistent-global-root",
        writable: true,
      });
      if (savedHome !== undefined) {
        process.env.HOME = savedHome;
      } else {
        delete process.env.HOME;
      }
    });

    it("emits project config-types.ts with import from global and extended SkillId union", async () => {
      // Seed a global config-types.ts so getGlobalConfigTypesPath() returns non-null
      const globalClaudeSrc = path.join(fakeHome, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      await writeFile(
        path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
        "// global config-types placeholder",
      );

      const projectDir = path.join(tempDir, "project");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
        ],
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const projectTypesPath = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      expect(await fileExists(projectTypesPath)).toBe(true);

      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Must be the import-and-extend form — not the standalone/inlined form
      expect(typesContent).toContain("import type {");
      expect(typesContent).toContain("SkillId as GlobalSkillId");
      expect(typesContent).toContain("AgentName as GlobalAgentName");
      expect(typesContent).toContain("Domain as GlobalDomain");
      expect(typesContent).toContain("Category as GlobalCategory");

      // Every active entry extends the global union — the project-scoped ones and the
      // global-scoped ones the sibling config.ts inlines, which the imported aliases would
      // otherwise cover only until the next global-scope run narrows them.
      expect(typesContent).toContain(
        'export type SkillId = GlobalSkillId | "web-framework-react" | "web-testing-vitest"',
      );
      expect(typesContent).toContain(
        'export type AgentName = GlobalAgentName | "web-developer" | "web-researcher"',
      );
    });

    it("extends the global alias even when every item is global-scoped (pure propagation case)", async () => {
      // Seed a global config-types.ts so getGlobalConfigTypesPath() returns non-null
      const globalClaudeSrc = path.join(fakeHome, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      await writeFile(
        path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
        "// global config-types placeholder",
      );

      const projectDir = path.join(tempDir, "project");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      // All items are global-scoped; the only reason writeScopedConfigs writes the
      // project config here is projectInstallationExists=true (pre-existing project
      // install, e.g., the user ran `cc edit` in a project after a global install).
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        true, // projectInstallationExists — forces project config write
      );

      const projectTypesPath = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      expect(await fileExists(projectTypesPath)).toBe(true);

      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Import form is still used — the project types extend the global ones rather
      // than restating them
      expect(typesContent).toContain("SkillId as GlobalSkillId");

      // The project owns nothing at project scope, yet its config.ts inlines both global
      // rows, so its own unions still have to name them: covered by the import alone, this
      // file goes red the moment a global-scope run drops either entry.
      expect(typesContent).toContain('export type SkillId = GlobalSkillId | "web-framework-react"');
      expect(typesContent).toContain('export type AgentName = GlobalAgentName | "web-developer"');
    });

    it("falls back to standalone config-types when no global install exists", async () => {
      // Intentionally do NOT create fakeHome/.claude-src/config-types.ts. With the
      // default GLOBAL_INSTALL_ROOT override in place, getGlobalConfigTypesPath()
      // returns null and regenerateConfigTypes falls back to the standalone path.
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: "/tmp/nonexistent-global-root",
        writable: true,
      });

      const projectDir = path.join(tempDir, "project-standalone");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });

      await writeScopedConfigs(
        config,
        SINGLE_REACT_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const projectTypesPath = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Standalone form: inlined unions, no "as GlobalSkillId" import
      expect(typesContent).not.toContain("as GlobalSkillId");
      expect(typesContent).toContain('"web-framework-react"');
    });

    /**
     * The project's config.ts and its config-types.ts are written from the SAME
     * merged config but disagree about which scopes they cover.
     * `generateProjectConfigWithInlinedGlobal` inlines every active global row
     * verbatim, while `buildProjectTypesExtras` only widens the imported unions
     * with entries active at PROJECT scope. The two agree for exactly as long as
     * the global unions still happen to contain the inlined rows — and a later
     * global-scope run that narrows them ends that, leaving a project config.ts
     * that names skills, categories and domains its own types reject.
     *
     * That is not hypothetical: it is the live state of a real installation,
     * where a `scope: "global"` row, its stack category key and its domain each
     * fail `tsc` against the narrowed global unions (TS2322 / TS2353).
     *
     * The two skills sit in distinct categories AND distinct domains so a single
     * assertion cannot pass by accident: the project-scoped skill contributes
     * nothing that would cover the global one's category or domain.
     */
    it("extends the global unions with the global-scoped entries config.ts inlines", async () => {
      const globalClaudeSrc = path.join(fakeHome, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      await writeFile(
        path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
        "// global config-types placeholder",
      );

      const projectDir = path.join(tempDir, "project-scope-pairing");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: [
          // Global: web-framework / web
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          // Project: api-api / api
          ...buildSkillConfigs(["api-framework-hono"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
        ],
      });

      await writeScopedConfigs(
        config,
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const projectTypesPath = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TYPES_TS,
      );
      const typesContent = await readFile(projectTypesPath, "utf-8");

      // The sibling config.ts really does inline the global row — without this the
      // assertions below would be asking the types to cover something nobody wrote.
      const projectConfigContent = await readFile(projectConfigPath, "utf-8");
      expect(projectConfigContent).toContain(
        '{"id":"web-framework-react","scope":"global","source":"agents-inc"}',
      );

      // Control: the project-scoped entry is in the extras today.
      expect(readGeneratedUnion(typesContent, "SkillId")).toContain('"api-framework-hono"');
      expect(readGeneratedUnion(typesContent, "Category")).toContain('"api-api"');
      expect(readGeneratedUnion(typesContent, "Domain")).toContain('"api"');

      // The defect: the inlined global entry must be covered by the project's own
      // unions, not merely by whatever the global unions happen to hold right now.
      expect(readGeneratedUnion(typesContent, "SkillId")).toContain('"web-framework-react"');
      expect(readGeneratedUnion(typesContent, "Category")).toContain('"web-framework"');
      expect(readGeneratedUnion(typesContent, "Domain")).toContain('"web"');
    });

    /**
     * The `domains` array is the one thing in a project config.ts that no skill row
     * has to back. It is a wizard preference, passed through verbatim by every write
     * and never pruned when the last skill of a domain leaves — so a union derived
     * only from the surviving skills' categories can be narrower than the array the
     * same writer just emitted. That is the live TS2322 on `"infra"`.
     *
     * `meta` here is named by the config and by nothing else: neither skill resolves
     * to it, so only the domains array itself can put it in the union.
     */
    it("covers a domain the config still names after its last skill row is gone", async () => {
      const globalClaudeSrc = path.join(fakeHome, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      await writeFile(
        path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
        "// global config-types placeholder",
      );

      const projectDir = path.join(tempDir, "project-orphaned-domain");
      const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      await mkdir(path.dirname(projectConfigPath), { recursive: true });

      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          ...buildSkillConfigs(["api-framework-hono"], { scope: "project" }),
        ],
        agents: buildAgentConfigs(["web-researcher"], { scope: "project" }),
        selectedDomains: ["api", "meta"],
      });

      await writeScopedConfigs(
        config,
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
        emptyAgents,
        projectDir,
        projectConfigPath,
        false,
      );

      const typesContent = await readFile(
        path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TYPES_TS),
        "utf-8",
      );

      // The sibling config.ts really does name the domain — without this the
      // assertion below would be asking the types to cover something nobody wrote.
      const projectConfigContent = await readFile(projectConfigPath, "utf-8");
      expect(projectConfigContent).toContain('const selectedDomains: Domain[] = ["api", "meta"];');

      expect(readGeneratedUnion(typesContent, "Domain")).toContain('"meta"');
    });
  });

  // Compile-command wiring: after a compile pass, regenerateScopeConfigTypes must
  // reproduce the wizard write path's config-types.ts for the scope it compiled —
  // standalone narrowed unions at global scope, import-and-extend at project scope.
  describe("regenerateScopeConfigTypes", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    const fakeHomeHandle = useFakeHome(() => tempDir);

    it("rewrites standalone unions narrowed to the config's entries at global scope", async () => {
      const globalClaudeSrc = path.join(fakeHomeHandle.dir, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      const typesPath = path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS);
      // Stale unions from before a hand-edit of config.ts: a removed skill is
      // still present, the newly added react is absent.
      await writeFile(typesPath, 'export type SkillId = "api-framework-hono";\n');

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      await regenerateScopeConfigTypes(
        fakeHomeHandle.dir,
        config,
        FULLSTACK_PAIR_MATRIX,
        emptyAgents,
      );

      const typesContent = await readFile(typesPath, "utf-8");
      // Standalone form: no import from a global types file
      expect(typesContent).not.toContain("as GlobalSkillId");
      // Unions narrowed to the config's entries — the added skill is in, the
      // removed one is out even though the matrix still knows it
      expect(typesContent).toContain('export type SkillId = "web-framework-react";');
      expect(typesContent).toContain('export type AgentName = "web-developer";');
      expect(typesContent).not.toContain('"api-framework-hono"');
    });

    describe("project scope with a global install present", () => {
      let consts: typeof import("../../consts");

      beforeEach(async () => {
        // Point GLOBAL_INSTALL_ROOT at the fake home so getGlobalConfigTypesPath()
        // detects the seeded global config-types.ts file inside the test's tempDir.
        consts = await import("../../consts");
        Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
          value: fakeHomeHandle.dir,
          writable: true,
        });
      });

      afterEach(() => {
        // Restore the default mocked GLOBAL_INSTALL_ROOT so other tests don't pick
        // up the fake home after this block finishes.
        Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
          value: "/tmp/nonexistent-global-root",
          writable: true,
        });
      });

      it("writes the import-and-extend form and leaves config.ts untouched", async () => {
        const globalClaudeSrc = path.join(fakeHomeHandle.dir, CLAUDE_SRC_DIR);
        await mkdir(globalClaudeSrc, { recursive: true });
        await writeFile(
          path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
          "// global config-types placeholder",
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        // The shape compile loads at project scope: project-scoped entries plus
        // the inlined global-scoped rows the config writer emits.
        const config = buildProjectConfig({
          skills: [
            ...buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              source: "agents-inc",
            }),
            ...buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
          ],
          agents: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["web-researcher"], { scope: "project" }),
          ],
        });
        await writeConfigFile(config, projectConfigPath);
        const configBefore = await readFile(projectConfigPath, "utf-8");

        await regenerateScopeConfigTypes(projectDir, config, FULLSTACK_TRIO_MATRIX, emptyAgents);

        const projectTypesPath = path.join(
          projectDir,
          CLAUDE_SRC_DIR,
          STANDARD_FILES.CONFIG_TYPES_TS,
        );
        const typesContent = await readFile(projectTypesPath, "utf-8");

        // Import-and-extend form — not the standalone/inlined form
        expect(typesContent).toContain("import type {");
        expect(typesContent).toContain("SkillId as GlobalSkillId");

        // Extended with every active entry the compiled config carries, global rows
        // included: config.ts names them, so the types beside it must accept them
        expect(typesContent).toContain(
          'export type SkillId = GlobalSkillId | "web-framework-react" | "web-testing-vitest"',
        );
        expect(typesContent).toContain(
          'export type AgentName = GlobalAgentName | "web-developer" | "web-researcher"',
        );

        // Regeneration touches only config-types.ts — config.ts stays byte-identical
        expect(await readFile(projectConfigPath, "utf-8")).toBe(configBefore);
      });
    });

    it("falls back to standalone unions at project scope when no global types exist", async () => {
      // GLOBAL_INSTALL_ROOT keeps its default mocked value (/tmp/nonexistent-global-root),
      // so getGlobalConfigTypesPath() returns null and the standalone path runs.
      const projectDir = path.join(tempDir, "project-standalone");
      await mkdir(path.join(projectDir, CLAUDE_SRC_DIR), { recursive: true });

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });

      await regenerateScopeConfigTypes(projectDir, config, SINGLE_REACT_MATRIX, emptyAgents);

      const typesContent = await readFile(
        path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TYPES_TS),
        "utf-8",
      );
      expect(typesContent).not.toContain("as GlobalSkillId");
      expect(typesContent).toContain('"web-framework-react"');
    });

    // The compile/uninstall refresh paths load the matrix with
    // skipExtraSources: true while the wizard write path uses the fully tagged
    // matrix. The tagging pass only annotates each skill's
    // availableSources/activeSource (wizard UI tagging) — it never adds skills
    // or categories — and the config-types writer never reads those
    // annotations, so both matrices must emit byte-identical config-types.ts.
    // This pins the parity claim documented at both skipExtraSources call sites.
    it("emits byte-identical config-types from an untagged and a source-tagged matrix", async () => {
      const globalClaudeSrc = path.join(fakeHomeHandle.dir, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      const typesPath = path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS);

      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });
      await writeConfigFile(config, path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TS));

      await regenerateScopeConfigTypes(
        fakeHomeHandle.dir,
        config,
        createMockMatrix({ ...SKILLS.react }, { ...SKILLS.hono }),
        emptyAgents,
      );
      const untaggedTypes = await readFile(typesPath, "utf-8");
      expect(untaggedTypes).toContain('"web-framework-react"');
      expect(untaggedTypes).toContain('"api-framework-hono"');

      // Tag a fresh copy of the same matrix exactly as the wizard load does
      const taggedMatrix = createMockMatrix({ ...SKILLS.react }, { ...SKILLS.hono });
      await loadSkillsFromAllSources(
        taggedMatrix,
        { source: DEFAULT_SOURCE, sourceOrigin: "default" },
        fakeHomeHandle.dir,
      );
      const taggedReact = taggedMatrix.skills["web-framework-react"];
      expect(
        taggedReact?.availableSources?.map((source) => source.name),
        "the marketplace must annotate the skill — otherwise this test proves nothing",
      ).toContain(DEFAULT_PUBLIC_SOURCE_NAME);

      await regenerateScopeConfigTypes(fakeHomeHandle.dir, config, taggedMatrix, emptyAgents);
      const taggedTypes = await readFile(typesPath, "utf-8");

      expect(taggedTypes).toBe(untaggedTypes);
    });
  });

  describe("deregisterProjectPath", () => {
    const fakeHomeHandle = useFakeHome(() => tempDir);
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};

    it("should remove project from global config's projects array", async () => {
      const projectDir = path.join(tempDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      // Write a global config that lists projectDir in projects
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

      await deregisterProjectPath(projectDir);

      const updatedConfig = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(updatedConfig.projects ?? []).toStrictEqual([]);
    });

    it("should not modify config when project not in list", async () => {
      const otherPath = path.join(tempDir, "other-project");
      await mkdir(otherPath, { recursive: true });

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [otherPath],
      });
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

      // Deregister a path that isn't in the list
      const nonexistentDir = path.join(tempDir, "nonexistent");
      await mkdir(nonexistentDir, { recursive: true });
      await deregisterProjectPath(nonexistentDir);

      const updatedConfig = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(updatedConfig.projects).toStrictEqual([otherPath]);
    });

    it("should do nothing when global config has no projects field", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });
      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeConfigFile(globalConfig, globalConfigPath);

      const anyDir = path.join(tempDir, "any-dir");
      await mkdir(anyDir, { recursive: true });

      // Should not throw
      await expect(deregisterProjectPath(anyDir)).resolves.toBeUndefined();
    });

    it("should do nothing when no global config exists", async () => {
      const anyDir = path.join(tempDir, "any-dir");
      await mkdir(anyDir, { recursive: true });

      // No global config on disk — should not throw
      await expect(deregisterProjectPath(anyDir)).resolves.toBeUndefined();
    });

    /**
     * Registration and deregistration must normalize the project path the SAME way. Registration
     * has always resolved symlinks; deregistration used to look the entry up under
     * `path.resolve`, which is a no-op on an already-canonical absolute path and therefore agrees
     * with registration everywhere EXCEPT a symlinked layout — where it silently matched nothing
     * and left the project registered forever.
     *
     * A symlinked ancestor is the only fixture that can tell the two rules apart, so the whole
     * round trip runs through `<sandbox>/link/project` while the real directory is
     * `<sandbox>/real/project`. The sandbox root itself is canonicalized first so the expected
     * value is not built on an assumption about the temp root.
     */
    it("should deregister a project reached through a symlinked ancestor", async () => {
      const sandbox = await realpath(tempDir);
      const realProjectDir = path.join(sandbox, "real", "project");
      const linkedProjectDir = path.join(sandbox, "link", "project");
      const projectConfigPath = path.join(
        linkedProjectDir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );

      await mkdir(path.join(realProjectDir, CLAUDE_SRC_DIR), { recursive: true });
      await symlink(path.join(sandbox, "real"), path.join(sandbox, "link"), "dir");

      // Install through the symlinked path — the same entry point production takes.
      await writeScopedConfigs(
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
        EMPTY_MATRIX,
        emptyAgents,
        linkedProjectDir,
        projectConfigPath,
        true,
      );

      const globalConfigPath = path.join(
        fakeHomeHandle.dir,
        CLAUDE_SRC_DIR,
        STANDARD_FILES.CONFIG_TS,
      );
      const registered = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(
        registered.projects,
        "registration must store the resolved path, never the symlinked one",
      ).toStrictEqual([realProjectDir]);

      await deregisterProjectPath(linkedProjectDir);

      const deregistered = await readTestTsConfig<ProjectConfig>(globalConfigPath);
      expect(
        deregistered.projects ?? [],
        "deregistering through the symlink must clear the entry registration stored",
      ).toStrictEqual([]);
    });
  });

  describe("propagateGlobalChangesToProjects", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};

    it("should return empty arrays when no projects registered", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });

      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents,
      );

      expect(result).toStrictEqual({ updated: [], skipped: [] });
    });

    it("should skip stale project paths", async () => {
      const stalePath = path.join(tempDir, "nonexistent-project");

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [stalePath],
      });

      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents,
      );

      expect(result).toStrictEqual({ updated: [], skipped: [stalePath] });
    });

    it("should skip current project dir", async () => {
      // Set up two project dirs with configs on disk
      const projectA = path.join(tempDir, "project-a");
      const projectB = path.join(tempDir, "project-b");

      for (const dir of [projectA, projectB]) {
        const configDir = path.join(dir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const projectConfig = buildProjectConfig({
          name: path.basename(dir),
          skills: [],
          agents: [],
        });
        await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));
      }

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectA, projectB],
      });

      // Pass projectA as currentProjectDir — only projectB should be updated
      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents,
        projectA,
      );

      expect(result.updated).toStrictEqual([projectB]);
      expect(result.skipped).toStrictEqual([]);
    });

    it("should update config-types.ts in registered projects", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [],
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, SINGLE_REACT_MATRIX, emptyAgents);

      const typesPath = path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS);
      expect(await fileExists(typesPath)).toBe(true);

      const typesContent = await readFile(typesPath, "utf-8");
      expect(typesContent).toContain("web-framework-react");
    });

    it("should update config.ts in registered projects", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: buildSkillConfigs(["web-testing-vitest"]),
        agents: buildAgentConfigs(["web-researcher"]),
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, SINGLE_REACT_MATRIX, emptyAgents);

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      // Verify the config file was updated with global data
      const configContent = await readFile(configPath, "utf-8");
      expect(configContent).toContain("web-framework-react");

      // Parse config and verify project-scoped skill is preserved
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
    });

    it("should handle empty projects list", async () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: [],
        projects: [],
      });

      const result = await propagateGlobalChangesToProjects(
        globalConfig,
        EMPTY_MATRIX,
        emptyAgents,
      );

      expect(result).toStrictEqual({ updated: [], skipped: [] });
    });

    it("drops a skill tombstone when the global skill has been removed", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"]),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      // Global no longer installs react — the tombstone is now stale.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, SINGLE_REACT_MATRIX, emptyAgents);

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills.every((s) => s.id !== "web-framework-react")).toBe(true);
      expect(parsedConfig.skills.some((s) => s.id === "web-testing-vitest")).toBe(true);
    });

    it("preserves the dual-scope pair's tombstone while the global skill still exists", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      // Dual-scope [P][G] pair: the active project-scoped react entry is the identity
      // collision that justifies masking the live global install of the same id. A bare
      // tombstone with no such collision is orphaned by definition and gets self-healed.
      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"]),
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
        agents: [],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      // Global still installs react — the tombstone must survive.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, SINGLE_REACT_MATRIX, emptyAgents);

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(
        parsedConfig.skills,
        "a tombstone whose global entry still exists must survive the write",
      ).toStrictEqual([
        { id: "web-framework-react", scope: "global", source: "agents-inc", excluded: true },
        { id: "web-testing-vitest", scope: "project", source: "eject" },
        { id: "web-framework-react", scope: "project", source: "eject" },
      ]);
    });

    it("drops an agent tombstone when the global agent has been removed", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-researcher"]),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      // Global no longer installs web-developer — the tombstone is now stale.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, EMPTY_MATRIX, emptyAgents);

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.agents.every((a) => a.name !== "web-developer")).toBe(true);
      expect(parsedConfig.agents.some((a) => a.name === "web-researcher")).toBe(true);
    });

    it("preserves the dual-scope pair's tombstone while the global agent still exists", async () => {
      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      // Dual-scope [P][G] pair: agents have no categories, so the active project-scoped
      // sibling of the same name is the only collision an agent mask can rest on.
      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-researcher"]),
          ...buildAgentConfigs(["web-developer"]),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      // Global still installs web-developer — the tombstone must survive.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, EMPTY_MATRIX, emptyAgents);

      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(
        parsedConfig.agents,
        "a tombstone whose global entry still exists must survive the write",
      ).toStrictEqual([
        { name: "web-developer", scope: "global", excluded: true },
        { name: "web-researcher", scope: "project" },
        { name: "web-developer", scope: "project" },
      ]);
    });
  });

  // D-216 / D-228: propagateGlobalChangesToProjects writes PROJECT config-types.ts
  // for every registered project when a global-scope change happens. Those project
  // types files must use the same global-aware import-and-extend form that
  // writeScopedConfigs uses during project init/edit — otherwise a global edit
  // would flip every project's types file from import-form back to standalone.
  describe("propagateGlobalChangesToProjects — project config-types imports from global", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};
    let fakeHome: string;
    let consts: typeof import("../../consts");

    beforeEach(async () => {
      fakeHome = path.join(tempDir, "fake-home");
      await mkdir(fakeHome, { recursive: true });

      consts = await import("../../consts");
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: fakeHome,
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", {
        value: "/tmp/nonexistent-global-root",
        writable: true,
      });
    });

    it("emits import-and-extend project config-types when global install exists", async () => {
      // Seed a global config-types.ts so the global-aware branch kicks in
      const globalClaudeSrc = path.join(fakeHome, CLAUDE_SRC_DIR);
      await mkdir(globalClaudeSrc, { recursive: true });
      await writeFile(
        path.join(globalClaudeSrc, STANDARD_FILES.CONFIG_TYPES_TS),
        "// global config-types placeholder",
      );

      const projectDir = path.join(tempDir, "target-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      // Project owns a project-scoped skill/agent before propagation runs
      const projectConfig = buildProjectConfig({
        name: "target",
        skills: buildSkillConfigs(["web-testing-vitest"], { scope: "project" }),
        agents: buildAgentConfigs(["web-researcher"], { scope: "project" }),
      });
      await writeConfigFile(projectConfig, path.join(configDir, STANDARD_FILES.CONFIG_TS));

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      await propagateGlobalChangesToProjects(globalConfig, SINGLE_REACT_MATRIX, emptyAgents);

      const projectTypesPath = path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS);
      const typesContent = await readFile(projectTypesPath, "utf-8");

      // Must be the import-and-extend form
      expect(typesContent).toContain("SkillId as GlobalSkillId");
      expect(typesContent).toContain("AgentName as GlobalAgentName");

      // The extension covers every row the sibling config.ts names: the project's
      // own entries AND the active global rows the writer inlines into it. The
      // imported unions alone cover the global rows only for as long as the
      // global config still holds them, so a project this propagation cannot
      // reach on a later narrowing run would stop type-checking against a
      // config.ts it still names them in.
      expect(typesContent).toContain(
        'export type SkillId = GlobalSkillId | "web-framework-react" | "web-testing-vitest"',
      );
      expect(typesContent).toContain(
        'export type AgentName = GlobalAgentName | "web-developer" | "web-researcher"',
      );
    });
  });

  // Global uninstall: every inlined global-scoped entry a registered project
  // carries must be pruned (skills, agents, selectedAgents, stack refs) while
  // project-scoped entries survive untouched. The mocked GLOBAL_INSTALL_ROOT
  // points at a nonexistent path, matching the post-uninstall state where the
  // global config-types.ts is already gone — regenerated project types must be
  // the standalone form.
  describe("pruneGlobalEntriesFromRegisteredProjects", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};

    it("prunes inlined global skills, agents, and stack refs while keeping project-scoped entries", async () => {
      const projectDir = path.join(tempDir, "registered-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"]),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
        ],
        agents: [
          ...buildAgentConfigs(["web-researcher"]),
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
        ],
        stack: {
          "web-researcher": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });
      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      await writeConfigFile(projectConfig, configPath);

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        projects: [projectDir],
      });

      const result = await pruneGlobalEntriesFromRegisteredProjects(
        globalConfig,
        SINGLE_REACT_MATRIX,
        emptyAgents,
      );

      expect(result).toStrictEqual({ updated: [projectDir], skipped: [] });

      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills).toStrictEqual([
        { id: "web-testing-vitest", scope: "project", source: "eject" },
      ]);
      expect(parsedConfig.agents).toStrictEqual([{ name: "web-researcher", scope: "project" }]);
      // The react ref is pruned from the stack; the emptied web-framework
      // category is dropped; the project-owned vitest ref is kept.
      expect(parsedConfig.stack).toStrictEqual({
        "web-researcher": { "web-testing": ["web-testing-vitest"] },
      });

      // config-types.ts is regenerated in standalone form — the global
      // config-types.ts it previously imported from no longer exists.
      const typesContent = await readFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS),
        "utf-8",
      );
      expect(typesContent).toContain('"web-testing-vitest"');
      expect(typesContent).not.toContain("GlobalSkillId");
      expect(typesContent).not.toContain("GlobalAgentName");
    });

    it("collapses a dual-scope pair to project-only by dropping the global tombstone", async () => {
      const projectDir = path.join(tempDir, "registered-project");
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });

      // Dual-scope [P][G] pair: active project entry + global tombstone masking
      // the (about to be uninstalled) global install of the same skill.
      const projectConfig = buildProjectConfig({
        name: "target",
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
        agents: buildAgentConfigs(["web-researcher"]),
      });
      const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
      await writeConfigFile(projectConfig, configPath);

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: [],
        projects: [projectDir],
      });

      await pruneGlobalEntriesFromRegisteredProjects(
        globalConfig,
        SINGLE_REACT_MATRIX,
        emptyAgents,
      );

      const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
      expect(parsedConfig.skills).toStrictEqual([
        { id: "web-framework-react", scope: "project", source: "eject" },
      ]);
    });

    it("reports unreachable registered project dirs as skipped", async () => {
      const ghostDir = path.join(tempDir, "deleted-project");

      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: [],
        projects: [ghostDir],
      });

      const result = await pruneGlobalEntriesFromRegisteredProjects(
        globalConfig,
        SINGLE_REACT_MATRIX,
        emptyAgents,
      );

      expect(result).toStrictEqual({ updated: [], skipped: [ghostDir] });
    });
  });

  /**
   * Category exclusivity ("at most one skill selected in this category") must
   * hold on the persisted project config, not only inside the build step's
   * keypress handler. Both cross-scope write paths reconcile on identity alone
   * (skill id / agent name), so a project owning ONE skill of an exclusive
   * category while a DIFFERENT skill of that same category is active at global
   * scope ends up with two active skills in one exclusive category. The global
   * side must be masked with a `{ scope: "global", excluded: true }` tombstone —
   * the project's own skill wins locally and the pair renders dual-scope.
   *
   * The two write paths are covered separately because either one alone
   * reproduces the malformed shape:
   *   - `propagateGlobalChangesToProjects` — a global install/edit fanning out
   *     to an already-registered project.
   *   - the project-scope save branch of `writeScopedConfigs` — an ordinary
   *     project `init`/`edit` performed while the colliding skill is already
   *     active globally, with the project NOT registered in `projects[]` so
   *     propagation never runs.
   */
  describe("cross-scope category exclusivity", () => {
    const emptyAgents: Partial<Record<AgentName, AgentDefinition>> = {};

    describe("propagateGlobalChangesToProjects", () => {
      it("masks the global skill that collides with a project-owned skill in an exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // The project owns Vue at project scope; web-framework is exclusive.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-vue-composition-api"]),
            agents: [],
          }),
          configPath,
        );

        // A global install just made React active in that same exclusive category.
        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "an exclusive category must hold exactly one active skill per project",
        ).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "global",
            source: "agents-inc",
            excluded: true,
          },
          { id: "web-framework-vue-composition-api", scope: "project", source: "eject" },
        ]);
      });

      it("reactivates the masked global skill once the project owns nothing in that exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // Post-masking state with the project's own framework skill removed:
        // the mask has nothing left to mask, so it must not survive.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              source: "agents-inc",
              excluded: true,
            }),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "a mask must not outlive the collision that produced it",
        ).toStrictEqual([{ id: "web-framework-react", scope: "global", source: "agents-inc" }]);
      });

      it("reactivates the masked global skill once the project owns nothing in an optional exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // web-client-state is exclusive but NOT required. The project's own
        // client-state skill is gone, so the mask no longer masks anything and
        // must not survive the next reconciled write.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-state-zustand"], {
              scope: "global",
              source: "agents-inc",
              excluded: true,
            }),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-state-zustand"], {
            scope: "global",
            source: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "a mask must not outlive its collision, exclusive category required or not",
        ).toStrictEqual([{ id: "web-state-zustand", scope: "global", source: "agents-inc" }]);
      });

      it("retains the mask while the project still owns a colliding skill in an optional exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // Pinia at project scope still collides with the global zustand install
        // in the same exclusive category, so the mask is still warranted.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: [
              ...buildSkillConfigs(["web-state-pinia"]),
              ...buildSkillConfigs(["web-state-zustand"], {
                scope: "global",
                source: "agents-inc",
                excluded: true,
              }),
            ],
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-state-zustand"], {
            scope: "global",
            source: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "an exclusive category must hold exactly one active skill per project",
        ).toStrictEqual([
          { id: "web-state-zustand", scope: "global", source: "agents-inc", excluded: true },
          { id: "web-state-pinia", scope: "project", source: "eject" },
        ]);
      });

      it("drops an orphaned agent mask once the project no longer owns that agent", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // Agent mirror of the identity self-heal: the project-scoped sibling that
        // justified the mask is gone, so the global agent must become visible again.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: [],
            agents: buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.agents,
          "an agent mask must not outlive the project-owned sibling that produced it",
        ).toStrictEqual([{ name: "web-developer", scope: "global" }]);
      });

      it("keeps exactly one tombstone when the same global change propagates twice", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-vue-composition-api"]),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );
        const afterFirstRun = await readFile(configPath, "utf-8");

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );
        const afterSecondRun = await readFile(configPath, "utf-8");

        expect(afterSecondRun, "propagation must be idempotent").toBe(afterFirstRun);

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(parsedConfig.skills).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "global",
            source: "agents-inc",
            excluded: true,
          },
          { id: "web-framework-vue-composition-api", scope: "project", source: "eject" },
        ]);
      });

      it("leaves a project-owned skill unmasked when the colliding global skill is in a non-exclusive category", async () => {
        const projectDir = path.join(tempDir, "registered-project");
        const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
        await mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);

        // web-styling is non-exclusive: SCSS at project scope and Tailwind at
        // global scope coexist, so neither side may gain a tombstone.
        await writeConfigFile(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-styling-scss-modules"]),
            agents: [],
          }),
          configPath,
        );

        const globalConfig = buildProjectConfig({
          name: "global",
          skills: buildSkillConfigs(["web-styling-tailwind"], {
            scope: "global",
            source: "agents-inc",
          }),
          agents: [],
          projects: [projectDir],
        });

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );
        const afterFirstRun = await readFile(configPath, "utf-8");

        await propagateGlobalChangesToProjects(
          globalConfig,
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
        );

        expect(await readFile(configPath, "utf-8")).toBe(afterFirstRun);

        const parsedConfig = await readTestTsConfig<ProjectConfig>(configPath);
        expect(
          parsedConfig.skills,
          "a non-exclusive category must keep both scopes active",
        ).toStrictEqual([
          { id: "web-styling-tailwind", scope: "global", source: "agents-inc" },
          { id: "web-styling-scss-modules", scope: "project", source: "eject" },
        ]);
      });
    });

    /**
     * The project-scope save branch performs no reconciliation at all: it splits
     * `finalConfig` by scope and hands the project half straight to the inlining
     * writer alongside the live global config. Propagation only escapes the bug
     * because it pre-synthesizes tombstones before calling the same writer, so
     * every case below is reproduced with the project deliberately absent from
     * the global config's `projects[]` — propagation never runs.
     */
    describe("writeScopedConfigs — project-scope save", () => {
      const fakeHomeHandle = useFakeHome(() => tempDir);

      it("masks the live global skill that collides with the project's own skill in an exclusive category", async () => {
        const globalConfigPath = path.join(
          fakeHomeHandle.dir,
          CLAUDE_SRC_DIR,
          STANDARD_FILES.CONFIG_TS,
        );
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              source: "agents-inc",
            }),
            agents: [],
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-vue-composition-api"]),
            agents: [],
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
        expect(
          parsedConfig.skills,
          "an exclusive category must hold exactly one active skill per project",
        ).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "global",
            source: "agents-inc",
            excluded: true,
          },
          { id: "web-framework-vue-composition-api", scope: "project", source: "eject" },
        ]);
      });

      it("masks the live global install of a skill the project also owns at project scope", async () => {
        const globalConfigPath = path.join(
          fakeHomeHandle.dir,
          CLAUDE_SRC_DIR,
          STANDARD_FILES.CONFIG_TS,
        );
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: buildSkillConfigs(["web-testing-vitest"], { scope: "global" }),
            agents: [],
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-testing-vitest"]),
            agents: [],
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
        expect(
          parsedConfig.skills,
          "one id must never be active at both scopes in the same project",
        ).toStrictEqual([
          { id: "web-testing-vitest", scope: "global", source: "eject", excluded: true },
          { id: "web-testing-vitest", scope: "project", source: "eject" },
        ]);
      });

      it("masks the live global install of an agent the project also owns at project scope", async () => {
        const globalConfigPath = path.join(
          fakeHomeHandle.dir,
          CLAUDE_SRC_DIR,
          STANDARD_FILES.CONFIG_TS,
        );
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: [],
            agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: [],
            agents: buildAgentConfigs(["web-developer"]),
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
        expect(
          parsedConfig.agents,
          "one agent name must never be active at both scopes in the same project",
        ).toStrictEqual([
          { name: "web-developer", scope: "global", excluded: true },
          { name: "web-developer", scope: "project" },
        ]);
      });

      it("reconciles an unpaired ownership alongside an already-paired one in the same write", async () => {
        const globalConfigPath = path.join(
          fakeHomeHandle.dir,
          CLAUDE_SRC_DIR,
          STANDARD_FILES.CONFIG_TS,
        );
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: [
              ...buildSkillConfigs(["web-framework-react"], {
                scope: "global",
                source: "agents-inc",
              }),
              ...buildSkillConfigs(["web-testing-vitest"], { scope: "global" }),
            ],
            agents: [],
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        // React arrives already paired (an earlier scope toggle wrote its
        // tombstone); vitest arrives owned at project scope with no tombstone.
        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: [
              ...buildSkillConfigs(["web-framework-react"]),
              ...buildSkillConfigs(["web-framework-react"], {
                scope: "global",
                source: "agents-inc",
                excluded: true,
              }),
              ...buildSkillConfigs(["web-testing-vitest"]),
            ],
            agents: [],
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedConfig = await readTestTsConfig<ProjectConfig>(projectConfigPath);
        expect(
          parsedConfig.skills.filter((s) => s.id === "web-framework-react"),
          "an already-paired entry must survive the write unchanged",
        ).toStrictEqual([
          {
            id: "web-framework-react",
            scope: "global",
            source: "agents-inc",
            excluded: true,
          },
          { id: "web-framework-react", scope: "project", source: "eject" },
        ]);
        expect(
          parsedConfig.skills.filter((s) => s.id === "web-testing-vitest"),
          "an unpaired ownership must be reconciled by the same write",
        ).toStrictEqual([
          { id: "web-testing-vitest", scope: "global", source: "eject", excluded: true },
          { id: "web-testing-vitest", scope: "project", source: "eject" },
        ]);
      });

      it("never writes a tombstone into the global config", async () => {
        const globalConfigPath = path.join(
          fakeHomeHandle.dir,
          CLAUDE_SRC_DIR,
          STANDARD_FILES.CONFIG_TS,
        );
        await mkdir(path.dirname(globalConfigPath), { recursive: true });
        await writeConfigFile(
          buildProjectConfig({
            name: "global",
            skills: buildSkillConfigs(["web-framework-react"], {
              scope: "global",
              source: "agents-inc",
            }),
            agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          }),
          globalConfigPath,
        );

        const projectDir = path.join(tempDir, "project");
        const projectConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
        await mkdir(path.dirname(projectConfigPath), { recursive: true });

        await writeScopedConfigs(
          buildProjectConfig({
            name: "target",
            skills: buildSkillConfigs(["web-framework-vue-composition-api"]),
            agents: buildAgentConfigs(["web-developer"]),
          }),
          CATEGORY_EXCLUSIVITY_MATRIX,
          emptyAgents,
          projectDir,
          projectConfigPath,
          true,
        );

        const parsedGlobal = await readTestTsConfig<ProjectConfig>(globalConfigPath);
        expect(
          parsedGlobal.skills,
          "masking is project-local — the global config must stay untouched",
        ).toStrictEqual([{ id: "web-framework-react", scope: "global", source: "agents-inc" }]);
        expect(parsedGlobal.agents).toStrictEqual([{ name: "web-developer", scope: "global" }]);
      });
    });
  });
});
