import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { cleanupTempDir, loadConfigOrFail, readCompiledAgents } from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import type { AgentName } from "../../src/cli/types/index.js";
import { typedEntries } from "../../src/cli/utils/typed-object.js";

/**
 * `compile` writes no completion gate, so a sub-agent that writes code hears about the project's
 * typecheck from its own prompt or not at all.
 */

const CODE_WRITERS = [
  "ai-developer",
  "ai-tester",
  "api-developer",
  "api-tester",
  "cli-developer",
  "cli-tester",
  "web-developer",
  "web-tester",
] as const satisfies readonly AgentName[];

const CONFIGURED_AGENTS = buildAgentConfigs([...CODE_WRITERS], { scope: "project" });

const COMPILED_FILES = CODE_WRITERS.map((name) => `${name}.md`);

describe("the sub-agents compile writes for the agents that write code", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  it(
    "tell every one of them to run the project's typecheck",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await ProjectBuilder.editable({ agents: [...CODE_WRITERS] });
      tempDirs.push(path.dirname(project.dir));

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(exitCode, `compile failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
      expect((await loadConfigOrFail(project.dir)).agents).toStrictEqual(CONFIGURED_AGENTS);
      const compiled = await readCompiledAgents(project.dir);
      expect(Object.keys(compiled).sort()).toStrictEqual(COMPILED_FILES);
      expect(
        filesNotToldToTypecheck(compiled),
        "a sub-agent that writes code was compiled with no instruction to typecheck it",
      ).toStrictEqual([]);
    },
  );
});

function filesNotToldToTypecheck(compiled: Record<string, string>): string[] {
  return typedEntries(compiled)
    .filter(([, content]) => !content.includes("Run the project's typecheck"))
    .map(([file]) => file);
}
