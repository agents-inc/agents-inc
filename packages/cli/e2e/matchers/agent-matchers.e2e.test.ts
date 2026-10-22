import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "./setup.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { MINIMAL_PROJECT_AGENT_NAMES, ProjectBuilder } from "../fixtures/project-builder.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { DECLARED_STOP_HOOK_LINE, declareAStopHook } from "../helpers/declared-stop-hook.js";
import { cleanupTempDir, loadConfigOrFail, readCompiledAgents } from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";

/**
 * `toHaveAgentFrontmatter`'s `tools` and `stopHook` options, read off a sub-agent `compile` really
 * wrote: its `tools:` line is one comma-separated string, its `hooks:` line one JSON object.
 */

const WEB_DEVELOPER = E2E_AGENT["web-developer"].name;

/** web-developer's `metadata.yaml` list, then the `Skill` grant compile adds to every agent. */
const WEB_DEVELOPER_TOOLS = ["Read", "Write", "Edit", "Grep", "Glob", "Bash", "Skill"];

const UNGRANTED_TOOL = "WebFetch";

const CONFIGURED_AGENTS = buildAgentConfigs([...MINIMAL_PROJECT_AGENT_NAMES], { scope: "project" });

const COMPILED_FILES = MINIMAL_PROJECT_AGENT_NAMES.map((name) => `${name}.md`).sort();

/** The hooks {@link declareAStopHook} writes, as JSON: its line without the key. */
const DECLARED_STOP_HOOK_JSON = DECLARED_STOP_HOOK_LINE.slice("hooks: ".length);

describe("toHaveAgentFrontmatter tools", () => {
  let project: ProjectHandle;
  let tempDir: string | undefined;

  beforeEach(async () => {
    project = await ProjectBuilder.minimal();
    tempDir = path.dirname(project.dir);

    const { exitCode, output } = await CLI.run(["compile"], project);

    expect(exitCode, `compile failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect((await loadConfigOrFail(project.dir)).agents).toStrictEqual(CONFIGURED_AGENTS);
    expect(Object.keys(await readCompiledAgents(project.dir)).sort()).toStrictEqual(COMPILED_FILES);
  }, TIMEOUTS.LIFECYCLE);

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("accepts every tool a compiled sub-agent's tools line grants", async () => {
    await expect(project).toHaveAgentFrontmatter(WEB_DEVELOPER, { tools: WEB_DEVELOPER_TOOLS });
  });

  it("rejects a tool the tools line does not grant, naming that tool", async () => {
    await expect(
      expect(project).toHaveAgentFrontmatter(WEB_DEVELOPER, {
        tools: [...WEB_DEVELOPER_TOOLS, UNGRANTED_TOOL],
      }),
    ).rejects.toThrow(
      `Expected agent frontmatter tools to contain "${UNGRANTED_TOOL}" but found: "${WEB_DEVELOPER_TOOLS.join(", ")}"`,
    );
  });
});

describe("toHaveAgentFrontmatter stopHook", () => {
  let project: ProjectHandle;
  let tempDir: string | undefined;

  beforeEach(async () => {
    project = await ProjectBuilder.minimal();
    tempDir = path.dirname(project.dir);
    await declareAStopHook(project.dir, WEB_DEVELOPER);

    const { exitCode, output } = await CLI.run(["compile"], project);

    expect(exitCode, `compile failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect((await loadConfigOrFail(project.dir)).agents).toStrictEqual(CONFIGURED_AGENTS);
    expect(Object.keys(await readCompiledAgents(project.dir)).sort()).toStrictEqual(COMPILED_FILES);
  }, TIMEOUTS.LIFECYCLE);

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("accepts a sub-agent whose declared Stop hook was compiled in", async () => {
    await expect(project).toHaveAgentFrontmatter(WEB_DEVELOPER, { stopHook: true });
  });

  it("rejects a sub-agent expected to carry no Stop hook, showing the hooks it carries", async () => {
    await expect(
      expect(project).toHaveAgentFrontmatter(WEB_DEVELOPER, { stopHook: false }),
    ).rejects.toThrow(
      `Expected agent "${WEB_DEVELOPER}" frontmatter to carry no Stop hook but its hooks are ${DECLARED_STOP_HOOK_JSON}`,
    );
  });
});
