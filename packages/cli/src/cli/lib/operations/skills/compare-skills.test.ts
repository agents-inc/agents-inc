import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MergedSkillsMatrix, SkillId } from "../../../types/index.js";
import { createMockSkill } from "../../__tests__/factories/skill-factories.js";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories.js";
import type { SkillComparisonResult } from "../../skills/index.js";
import type { ScopedSkillDirsResult } from "./collect-scoped-skill-dirs.js";

vi.mock("../../skills/index.js", () => ({
  compareLocalSkillsWithSource: vi.fn(),
}));

vi.mock("./collect-scoped-skill-dirs.js", () => ({
  collectScopedSkillDirs: vi.fn(),
}));

vi.mock("os", () => ({
  default: { homedir: () => "/home/user" },
}));

import { compareSkillsWithSource } from "./compare-skills";
import { compareLocalSkillsWithSource } from "../../skills/index.js";
import { collectScopedSkillDirs } from "./collect-scoped-skill-dirs.js";

const mockCompareLocalSkills = vi.mocked(compareLocalSkillsWithSource);
const mockCollectScopedSkillDirs = vi.mocked(collectScopedSkillDirs);

function makeScopedResult(hasProject: boolean, hasGlobal: boolean): ScopedSkillDirsResult {
  return {
    dirs: [],
    hasProject,
    hasGlobal,
    projectLocalPath: "",
    globalLocalPath: "",
  };
}

const SOURCE_PATH = "/tmp/test-source";

function makeMatrix(skills: Record<string, { path: string; local?: boolean }>): MergedSkillsMatrix {
  const resolvedSkills = Object.entries(skills).map(([id, skill]) =>
    // Boundary cast: fixtures include custom (non-union) skill ids like "web-custom-skill"
    createMockSkill(id as SkillId, { path: skill.path, local: skill.local }),
  );
  return createMockMatrix(...resolvedSkills);
}

function makeComparisonResult(
  id: string,
  status: "current" | "outdated" | "local-only",
): SkillComparisonResult {
  return {
    id: id as SkillId,
    localHash: "abc1234",
    sourceHash: status === "local-only" ? null : "def5678",
    status,
    dirName: id,
    sourcePath: status === "local-only" ? undefined : `skills/${id}`,
  };
}

describe("compareSkillsWithSource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should compare project and global skills and merge with project precedence", async () => {
    const matrix = makeMatrix({
      "web-framework-react": { path: "skills/web/framework/react" },
      "api-framework-hono": { path: "skills/api/hono" },
    });

    mockCollectScopedSkillDirs.mockResolvedValueOnce(makeScopedResult(true, true));

    const projectResults = [makeComparisonResult("web-framework-react", "current")];
    const globalResults = [
      makeComparisonResult("web-framework-react", "outdated"),
      makeComparisonResult("api-framework-hono", "current"),
    ];

    mockCompareLocalSkills
      .mockResolvedValueOnce(projectResults)
      .mockResolvedValueOnce(globalResults);

    const result = await compareSkillsWithSource("/tmp/project", SOURCE_PATH, matrix);

    expect(result.projectResults).toStrictEqual(projectResults);
    expect(result.globalResults).toStrictEqual(globalResults);
    // Project takes precedence: web-framework-react from project wins over global
    expect(result.merged).toStrictEqual([
      makeComparisonResult("web-framework-react", "current"),
      makeComparisonResult("api-framework-hono", "current"),
    ]);
  });

  it("should skip global comparison when projectDir equals homedir", async () => {
    const matrix = makeMatrix({
      "web-framework-react": { path: "skills/web/framework/react" },
    });

    mockCollectScopedSkillDirs.mockResolvedValueOnce(makeScopedResult(true, false));

    const projectResults = [makeComparisonResult("web-framework-react", "current")];
    mockCompareLocalSkills.mockResolvedValueOnce(projectResults);

    const result = await compareSkillsWithSource("/home/user", SOURCE_PATH, matrix);

    // Only called once (project), not for global
    expect(mockCompareLocalSkills).toHaveBeenCalledTimes(1);
    expect(mockCompareLocalSkills).toHaveBeenCalledWith(
      "/home/user",
      SOURCE_PATH,
      expect.any(Object),
    );
    expect(result.globalResults).toStrictEqual([]);
  });

  it("should return empty results when no local skills directories exist", async () => {
    const matrix = makeMatrix({
      "web-framework-react": { path: "skills/web/framework/react" },
    });

    mockCollectScopedSkillDirs.mockResolvedValueOnce(makeScopedResult(false, false));

    const result = await compareSkillsWithSource("/tmp/project", SOURCE_PATH, matrix);

    expect(mockCompareLocalSkills).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      projectResults: [],
      globalResults: [],
      merged: [],
    });
  });

  it("should build sourceSkills map excluding local skills", async () => {
    const matrix = makeMatrix({
      "web-framework-react": { path: "skills/web/framework/react", local: false },
      "web-custom-skill": { path: ".claude/skills/custom", local: true },
      "api-framework-hono": { path: "skills/api/hono", local: false },
    });

    mockCollectScopedSkillDirs.mockResolvedValueOnce(makeScopedResult(true, false));

    mockCompareLocalSkills.mockResolvedValueOnce([]);

    await compareSkillsWithSource("/tmp/project", SOURCE_PATH, matrix);

    // The sourceSkills map should exclude local skills
    expect(mockCompareLocalSkills).toHaveBeenCalledWith("/tmp/project", SOURCE_PATH, {
      "web-framework-react": { path: "skills/web/framework/react" },
      "api-framework-hono": { path: "skills/api/hono" },
    });
  });
});
