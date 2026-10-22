import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { MINIMAL_PROJECT_AGENT_NAMES, ProjectBuilder } from "../fixtures/project-builder.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { DECLARED_STOP_HOOK_LINE, declareAStopHook } from "../helpers/declared-stop-hook.js";
import {
  cleanupTempDir,
  createTempDir,
  loadConfigOrFail,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import type { AgentName } from "../../src/cli/types/index.js";
import { typedEntries } from "../../src/cli/utils/typed-object.js";

/**
 * `compile` writes a Claude sub-agent the hooks its definition declares and none of its own. Both
 * runs are in a folder Claude Code has not trusted, so the trust line is the declared hook's alone.
 */

/** Holds `Write` and `Edit`. */
const WRITER = "web-developer" as const satisfies AgentName;

const CONFIGURED_AGENTS = buildAgentConfigs([...MINIMAL_PROJECT_AGENT_NAMES], { scope: "project" });

const COMPILED_FILES = MINIMAL_PROJECT_AGENT_NAMES.map((name) => `${name}.md`).sort();

describe("the hooks compile writes into a Claude sub-agent", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** HOME apart from the project: from the home directory Claude Code needs no trust. */
  async function minimalProjectAwayFromHome(): Promise<ProjectHandle> {
    const project = await ProjectBuilder.minimal();
    const globalHome = await createTempDir();
    tempDirs.push(path.dirname(project.dir), globalHome);
    return { dir: project.dir, globalHome };
  }

  it(
    "writes none into a built-in sub-agent that writes files, and names no folder to trust",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await minimalProjectAwayFromHome();

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(exitCode, `compile failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
      expect((await loadConfigOrFail(project.dir)).agents).toStrictEqual(CONFIGURED_AGENTS);
      const compiled = await readCompiledAgents(project.dir);
      expect(Object.keys(compiled).sort()).toStrictEqual(COMPILED_FILES);
      expect(compiled[`${WRITER}.md`], "the subject must be a sub-agent that writes").toContain(
        "\ntools: Read, Write, Edit,",
      );
      await expect(project).toHaveAgentFrontmatter(WRITER, { completionGate: false });
      expect(
        filesCarryingHooks(compiled),
        "compile added a hook no definition declared",
      ).toStrictEqual([]);
      expect(output).not.toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
    },
  );

  it(
    "writes a Stop hook a project's own sub-agent declares exactly as declared, and names the folder to trust",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await minimalProjectAwayFromHome();
      await declareAStopHook(project.dir, WRITER);

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(exitCode, `compile failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
      expect((await loadConfigOrFail(project.dir)).agents).toStrictEqual(CONFIGURED_AGENTS);
      const compiled = await readCompiledAgents(project.dir);
      expect(Object.keys(compiled).sort()).toStrictEqual(COMPILED_FILES);
      expect(
        compiled[`${WRITER}.md`],
        "a declared Stop hook did not reach the frontmatter as written",
      ).toContain(`\n${DECLARED_STOP_HOOK_LINE}\n`);
      expect(
        filesCarryingHooks(compiled),
        "a hook one sub-agent declared reached another",
      ).toStrictEqual([`${WRITER}.md`]);
      expect(output).toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
    },
  );
});

function filesCarryingHooks(compiled: Record<string, string>): string[] {
  return typedEntries(compiled)
    .filter(([, content]) => content.includes("\nhooks:"))
    .map(([file]) => file);
}
