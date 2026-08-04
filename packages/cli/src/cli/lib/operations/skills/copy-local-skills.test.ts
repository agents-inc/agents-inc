import os from "os";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SourceLoadResult } from "../../loading/source-loader.js";
import { buildSourceResult } from "../../__tests__/factories/config-factories.js";
import { createMockCopiedSkill } from "../../__tests__/factories/index.js";
import { EMPTY_MATRIX } from "../../__tests__/mock-data/mock-matrices.js";
import { buildSkillConfig } from "../../__tests__/helpers/index.js";

vi.mock("../../installation/index.js", () => ({
  resolveInstallPaths: vi.fn(),
}));

vi.mock("../../skills/index.js", () => ({
  copySkillsToLocalFlattened: vi.fn(),
  deleteLocalSkill: vi.fn(),
}));

vi.mock("../../../utils/fs.js", () => ({
  ensureDir: vi.fn(),
}));

import { copyLocalSkills } from "./copy-local-skills";
import { resolveInstallPaths } from "../../installation/index.js";
import { copySkillsToLocalFlattened, deleteLocalSkill } from "../../skills/index.js";
import { ensureDir } from "../../../utils/fs.js";

const mockResolveInstallPaths = vi.mocked(resolveInstallPaths);
const mockCopySkillsToLocalFlattened = vi.mocked(copySkillsToLocalFlattened);
const mockEnsureDir = vi.mocked(ensureDir);
const mockDeleteLocalSkill = vi.mocked(deleteLocalSkill);

const PROJECT_DIR = "/tmp/test-project";

const MOCK_SOURCE_RESULT: SourceLoadResult = buildSourceResult(EMPTY_MATRIX, "/tmp/test-source", {
  sourceConfig: { source: "github:test/source", sourceOrigin: "flag" },
  isLocal: false,
});

describe("copyLocalSkills", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveInstallPaths.mockImplementation((_projectDir, scope) => ({
      skillsDir: scope === "global" ? "/home/user/.claude/skills" : `${PROJECT_DIR}/.claude/skills`,
      agentsDir: scope === "global" ? "/home/user/.claude/agents" : `${PROJECT_DIR}/.claude/agents`,
      configPath:
        scope === "global"
          ? "/home/user/.claude-src/config.ts"
          : `${PROJECT_DIR}/.claude-src/config.ts`,
    }));
    mockCopySkillsToLocalFlattened.mockResolvedValue([]);
  });

  it("should split skills by scope and copy to correct directories", async () => {
    const skills = [
      buildSkillConfig("web-framework-react", { scope: "project" }),
      buildSkillConfig("api-framework-hono", { scope: "global" }),
      buildSkillConfig("web-styling-tailwind", { scope: "project" }),
    ];

    const projectCopied = [
      createMockCopiedSkill("web-framework-react"),
      createMockCopiedSkill("web-styling-tailwind"),
    ];
    const globalCopied = [createMockCopiedSkill("api-framework-hono")];

    mockCopySkillsToLocalFlattened
      .mockResolvedValueOnce(projectCopied)
      .mockResolvedValueOnce(globalCopied);

    const result = await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT);

    expect(mockResolveInstallPaths).toHaveBeenCalledWith(PROJECT_DIR, "project");
    expect(mockResolveInstallPaths).toHaveBeenCalledWith(PROJECT_DIR, "global");

    expect(mockEnsureDir).toHaveBeenCalledWith(`${PROJECT_DIR}/.claude/skills`);
    expect(mockEnsureDir).toHaveBeenCalledWith("/home/user/.claude/skills");

    expect(mockCopySkillsToLocalFlattened).toHaveBeenCalledTimes(2);
    expect(mockCopySkillsToLocalFlattened).toHaveBeenCalledWith(
      ["web-framework-react", "web-styling-tailwind"],
      `${PROJECT_DIR}/.claude/skills`,
      MOCK_SOURCE_RESULT,
    );
    expect(mockCopySkillsToLocalFlattened).toHaveBeenCalledWith(
      ["api-framework-hono"],
      "/home/user/.claude/skills",
      MOCK_SOURCE_RESULT,
    );

    expect(result).toStrictEqual({
      projectCopied,
      globalCopied,
      totalCopied: 3,
    });
  });

  it("should return empty results when no skills provided", async () => {
    const result = await copyLocalSkills([], PROJECT_DIR, MOCK_SOURCE_RESULT);

    expect(mockCopySkillsToLocalFlattened).not.toHaveBeenCalled();
    expect(mockEnsureDir).not.toHaveBeenCalled();

    expect(result).toStrictEqual({
      projectCopied: [],
      globalCopied: [],
      totalCopied: 0,
    });
  });

  it("should only copy project skills when no global skills", async () => {
    const skills = [
      buildSkillConfig("web-framework-react", { scope: "project" }),
      buildSkillConfig("web-styling-tailwind", { scope: "project" }),
    ];

    const projectCopied = [
      createMockCopiedSkill("web-framework-react"),
      createMockCopiedSkill("web-styling-tailwind"),
    ];
    mockCopySkillsToLocalFlattened.mockResolvedValueOnce(projectCopied);

    const result = await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT);

    expect(mockCopySkillsToLocalFlattened).toHaveBeenCalledTimes(1);
    expect(mockEnsureDir).toHaveBeenCalledTimes(1);
    expect(mockEnsureDir).toHaveBeenCalledWith(`${PROJECT_DIR}/.claude/skills`);

    expect(result).toStrictEqual({
      projectCopied,
      globalCopied: [],
      totalCopied: 2,
    });
  });

  it("should only copy global skills when all are global-scoped", async () => {
    const skills = [
      buildSkillConfig("api-framework-hono", { scope: "global" }),
      buildSkillConfig("api-database-drizzle", { scope: "global" }),
    ];

    const globalCopied = [
      createMockCopiedSkill("api-framework-hono"),
      createMockCopiedSkill("api-database-drizzle"),
    ];
    mockCopySkillsToLocalFlattened.mockResolvedValueOnce(globalCopied);

    const result = await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT);

    expect(mockCopySkillsToLocalFlattened).toHaveBeenCalledTimes(1);
    expect(mockEnsureDir).toHaveBeenCalledTimes(1);
    expect(mockEnsureDir).toHaveBeenCalledWith("/home/user/.claude/skills");

    expect(result).toStrictEqual({
      projectCopied: [],
      globalCopied,
      totalCopied: 2,
    });
  });

  it("should calculate totalCopied correctly", async () => {
    const skills = [
      buildSkillConfig("web-framework-react", { scope: "project" }),
      buildSkillConfig("api-framework-hono", { scope: "global" }),
    ];

    mockCopySkillsToLocalFlattened
      .mockResolvedValueOnce([createMockCopiedSkill("web-framework-react")])
      .mockResolvedValueOnce([createMockCopiedSkill("api-framework-hono")]);

    const result = await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT);

    expect(result.totalCopied).toBe(2);
    expect(result.totalCopied).toBe(result.projectCopied.length + result.globalCopied.length);
  });

  describe("deleteAlternateSourceSkills", () => {
    it("deletes only the skills whose source is not eject", async () => {
      const skills = [
        buildSkillConfig("web-framework-react", { scope: "project", source: "agents-inc" }),
        buildSkillConfig("web-styling-tailwind", { scope: "project", source: "eject" }),
      ];

      await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT, {
        deleteAlternateSourceSkills: true,
      });

      expect(mockDeleteLocalSkill).toHaveBeenCalledTimes(1);
      expect(mockDeleteLocalSkill).toHaveBeenCalledWith(PROJECT_DIR, "web-framework-react");
    });

    it("treats an empty source as an alternate source rather than silently skipping it", async () => {
      const skills = [buildSkillConfig("web-framework-react", { scope: "project", source: "" })];

      await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT, {
        deleteAlternateSourceSkills: true,
      });

      expect(mockDeleteLocalSkill).toHaveBeenCalledWith(PROJECT_DIR, "web-framework-react");
    });

    it("deletes global-scoped skills relative to the home directory", async () => {
      const skills = [
        buildSkillConfig("api-framework-hono", { scope: "global", source: "agents-inc" }),
      ];

      await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT, {
        deleteAlternateSourceSkills: true,
      });

      expect(mockDeleteLocalSkill).toHaveBeenCalledWith(os.homedir(), "api-framework-hono");
    });

    it("deletes nothing when the option is off", async () => {
      const skills = [
        buildSkillConfig("web-framework-react", { scope: "project", source: "agents-inc" }),
      ];

      await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT);

      expect(mockDeleteLocalSkill).not.toHaveBeenCalled();
    });
  });
});
