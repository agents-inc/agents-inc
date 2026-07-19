import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SkillConfig } from "../../../types/config.js";
import type { SkillId } from "../../../types/index.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";
import type { CopiedSkill } from "../../skills/index.js";
import { buildSourceResult } from "../../__tests__/factories/config-factories.js";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories.js";

vi.mock("../../installation/index.js", () => ({
  resolveInstallPaths: vi.fn(),
}));

vi.mock("../../skills/index.js", () => ({
  copySkillsToLocalFlattened: vi.fn(),
}));

vi.mock("../../../utils/fs.js", () => ({
  ensureDir: vi.fn(),
}));

import { copyLocalSkills } from "./copy-local-skills";
import { resolveInstallPaths } from "../../installation/index.js";
import { copySkillsToLocalFlattened } from "../../skills/index.js";
import { ensureDir } from "../../../utils/fs.js";

const mockResolveInstallPaths = vi.mocked(resolveInstallPaths);
const mockCopySkillsToLocalFlattened = vi.mocked(copySkillsToLocalFlattened);
const mockEnsureDir = vi.mocked(ensureDir);

const PROJECT_DIR = "/tmp/test-project";

const MOCK_SOURCE_RESULT: SourceLoadResult = buildSourceResult(
  createMockMatrix(),
  "/tmp/test-source",
  {
    sourceConfig: { source: "github:test/source", sourceOrigin: "flag" },
    isLocal: false,
  },
);

function makeSkillConfig(id: SkillId, scope: "project" | "global", source = "eject"): SkillConfig {
  return { id, scope, source };
}

function makeCopiedSkill(id: SkillId): CopiedSkill {
  return {
    skillId: id,
    contentHash: "abc1234",
    sourcePath: `/tmp/source/${id}`,
    destPath: `/tmp/dest/${id}`,
  };
}

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
      makeSkillConfig("web-framework-react", "project"),
      makeSkillConfig("api-framework-hono", "global"),
      makeSkillConfig("web-styling-tailwind", "project"),
    ];

    const projectCopied = [
      makeCopiedSkill("web-framework-react"),
      makeCopiedSkill("web-styling-tailwind"),
    ];
    const globalCopied = [makeCopiedSkill("api-framework-hono")];

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
      makeSkillConfig("web-framework-react", "project"),
      makeSkillConfig("web-styling-tailwind", "project"),
    ];

    const projectCopied = [
      makeCopiedSkill("web-framework-react"),
      makeCopiedSkill("web-styling-tailwind"),
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
      makeSkillConfig("api-framework-hono", "global"),
      makeSkillConfig("api-database-drizzle", "global"),
    ];

    const globalCopied = [
      makeCopiedSkill("api-framework-hono"),
      makeCopiedSkill("api-database-drizzle"),
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
      makeSkillConfig("web-framework-react", "project"),
      makeSkillConfig("api-framework-hono", "global"),
    ];

    mockCopySkillsToLocalFlattened
      .mockResolvedValueOnce([makeCopiedSkill("web-framework-react")])
      .mockResolvedValueOnce([makeCopiedSkill("api-framework-hono")]);

    const result = await copyLocalSkills(skills, PROJECT_DIR, MOCK_SOURCE_RESULT);

    expect(result.totalCopied).toBe(2);
    expect(result.totalCopied).toBe(result.projectCopied.length + result.globalCopied.length);
  });
});
