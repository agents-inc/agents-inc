import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./compile-agents.js", () => ({ compileAgents: vi.fn() }));

import { compileAgents } from "./compile-agents.js";
import { recompilePropagatedProjectAgents } from "./recompile-project-agents.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { buildRecompileAgentsResult } from "../../__tests__/factories/recompile-factories.js";
import { elementAt, firstElement } from "../../__tests__/helpers/element-at.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";

const mockCompileAgents = vi.mocked(compileAgents);

/**
 * Each registered project is recompiled for real up to the compile itself, which is scripted per
 * project, so the summary is read against outcomes the spec chose.
 */
describe("recompilePropagatedProjectAgents", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir("cc-propagated-recompile-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  async function registeredProjects(...names: string[]): Promise<string[]> {
    const dirs = names.map((name) => path.join(tempDir, name));
    await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
    return dirs;
  }

  it("counts each project once by its outcome and keeps every failure's warning in order", async () => {
    const projects = await registeredProjects(
      "rewritten",
      "unchanged",
      "partly-failed",
      "unreachable",
    );
    mockCompileAgents
      .mockResolvedValueOnce(
        buildRecompileAgentsResult({ compiled: ["web-developer"], rewritten: ["web-developer"] }),
      )
      .mockResolvedValueOnce(buildRecompileAgentsResult({ compiled: ["web-developer"] }))
      .mockResolvedValueOnce(
        buildRecompileAgentsResult({
          compiled: ["web-developer"],
          rewritten: ["web-developer"],
          failed: ["pm"],
          warnings: ["Failed to compile pm: the template broke"],
        }),
      )
      .mockRejectedValueOnce(new Error("the disk is full"));

    const summary = await recompilePropagatedProjectAgents(projects);

    expect(summary).toStrictEqual({
      rewrittenCount: 1,
      unchangedCount: 1,
      failedCount: 2,
      warnings: [
        "Failed to compile pm: the template broke",
        `Could not recompile agents in ${elementAt(projects, 3)}: the disk is full`,
      ],
    });
  });

  it("tells rewritten projects from unchanged ones by count", async () => {
    const projects = await registeredProjects("first", "second", "unchanged");
    mockCompileAgents
      .mockResolvedValueOnce(buildRecompileAgentsResult({ compiled: ["pm"], rewritten: ["pm"] }))
      .mockResolvedValueOnce(buildRecompileAgentsResult({ compiled: ["pm"], rewritten: ["pm"] }))
      .mockResolvedValueOnce(buildRecompileAgentsResult({ compiled: ["pm"] }));

    expect(await recompilePropagatedProjectAgents(projects)).toStrictEqual({
      rewrittenCount: 2,
      unchangedCount: 1,
      failedCount: 0,
      warnings: [],
    });
  });

  it("compiles each project's own agents at project scope into its own agents folder", async () => {
    const projects = await registeredProjects("project");
    const project = firstElement(projects);
    mockCompileAgents.mockResolvedValueOnce(buildRecompileAgentsResult());

    await recompilePropagatedProjectAgents(projects);

    expect(mockCompileAgents).toHaveBeenCalledExactlyOnceWith({
      projectDir: project,
      sourcePath: expect.any(String),
      skills: expect.any(Object),
      scopeFilter: "project",
      outputDir: resolveInstallPaths(project, "project").agentsDir,
    });
  });

  it("answers no projects with an empty summary", async () => {
    expect(await recompilePropagatedProjectAgents([])).toStrictEqual({
      rewrittenCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      warnings: [],
    });
    expect(mockCompileAgents).not.toHaveBeenCalled();
  });
});
