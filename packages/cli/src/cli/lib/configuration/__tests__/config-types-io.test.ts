import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../utils/fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../utils/fs")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

vi.mock("../../../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../utils/logger")>()),
  verbose: vi.fn(),
}));

import { buildConfigTypesBackgroundData, regenerateConfigTypes } from "../config-types-io";
import { GlobalPairWriteViolation } from "../../config-gate/gate-token.js";
import { writeFile as productWriteFile } from "../../../utils/fs";
import { verbose } from "../../../utils/logger";
import { createMockAgent } from "../../__tests__/factories/agent-factories.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { SKILLS } from "../../__tests__/test-fixtures.js";

/** Literal paths: a test reading the folder names off the product would move with them. */
const CLAUDE_SOURCE_FOLDER = path.join(".agents-inc", "claude");
const CONFIG_TYPES_TS = "config-types.ts";

describe("regenerateConfigTypes", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir("cc-config-types-io-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  const backgroundData = () =>
    Promise.resolve(buildConfigTypesBackgroundData(createMockMatrix(SKILLS.react), {}));

  async function globalTypesExist(): Promise<void> {
    await mkdir(path.join(home.dir, CLAUDE_SOURCE_FOLDER), { recursive: true });
    await writeFile(path.join(home.dir, CLAUDE_SOURCE_FOLDER, CONFIG_TYPES_TS), "export {}\n");
  }

  function projectTypes(): Promise<string> {
    return readFile(path.join(projectDir, CLAUDE_SOURCE_FOLDER, CONFIG_TYPES_TS), "utf-8");
  }

  describe("beside a global installation's types", () => {
    beforeEach(async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          agents: [
            ...buildAgentConfigs(["web-developer"]),
            ...buildAgentConfigs(["pm"], { scope: "global" }),
          ],
        }),
      );
      await globalTypesExist();
    });

    it("imports the global types by a relative POSIX path and adds no names of its own", async () => {
      await regenerateConfigTypes(projectDir, backgroundData());

      const written = await projectTypes();
      expect(written).toContain("} from '../../../fake-home/.agents-inc/claude/config-types'");
      expect(written).toContain("export type SkillId = GlobalSkillId\n");
      expect(written).toContain("export type AgentName = GlobalAgentName\n");
      expect(written).toContain("export type Domain = GlobalDomain\n");
      expect(written).toContain("export type Category = GlobalCategory\n");
    });

    it("narrows the selected and the project's own sub-agents to the configuration's", async () => {
      await regenerateConfigTypes(projectDir, backgroundData());

      const written = await projectTypes();
      expect(written).toContain("export type SelectedAgentName = 'web-developer' | 'pm'\n");
      expect(written).toContain("export type ProjectAgentName = 'web-developer'\n");
    });

    it("says it extends the global types, and that it regenerated the file", async () => {
      await regenerateConfigTypes(projectDir, backgroundData());

      expect(verbose).toHaveBeenCalledWith(
        "Using project config-types.ts that imports from global",
      );
      expect(verbose).toHaveBeenCalledWith("Regenerated config-types.ts");
    });
  });

  it("refuses the home directory before reading or writing anything", async () => {
    vi.mocked(productWriteFile).mockResolvedValueOnce(undefined);

    await expect(regenerateConfigTypes(home.dir, backgroundData())).rejects.toThrow(
      new GlobalPairWriteViolation(path.join(home.dir, CLAUDE_SOURCE_FOLDER, CONFIG_TYPES_TS)),
    );
    expect(productWriteFile).not.toHaveBeenCalled();
  });
});

describe("buildConfigTypesBackgroundData", () => {
  it("names as custom only the sub-agents whose definition says so", () => {
    const data = buildConfigTypesBackgroundData(createMockMatrix(SKILLS.react), {
      "web-developer": createMockAgent("web-developer", { custom: true }),
      pm: createMockAgent("pm"),
    });

    expect(data.agentNames).toStrictEqual(["web-developer", "pm"]);
    expect(data.customAgentNames).toStrictEqual(["web-developer"]);
  });
});
