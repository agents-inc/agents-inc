import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { describe, expect, it } from "vitest";

import { glob } from "../../utils/fs.js";
import { bytewise } from "../../utils/string.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Which loader each module reading sub-agent definitions calls. `config-types-agent-defs-agree`
 * holds the one function to the CLI-only roster these producers are required to take.
 */
describe("every producer of the sub-agent unions in config-types.ts", () => {
  /** Only rosters reaching `config-types.ts` decide a type; the others decide none. */
  type UnionPosture =
    | "the one function"
    | "derives from the one function"
    | "re-export only"
    | "not the union"
    /** Reaches a config-types.ts write with its own roster. */
    | "its own roster";

  type AgentDefReader = {
    file: string;
    posture: UnionPosture;
    why: string;
  };

  const READERS = [
    {
      file: "src/cli/commands/compile.ts",
      posture: "derives from the one function",
      why: "`loadAgentDefsOrFail` wraps `loadAgentDefs`, and the same value drives both the compile passes and `reconcileTypesFromDisk`'s `deps.agents` — the one place a command can see the two rosters disagree, because it uses one value for both.",
    },
    {
      file: "src/cli/commands/edit.tsx",
      posture: "derives from the one function",
      why: "`loadAgentDefs` once, handed to `writeProjectConfig` as `agentDefs` and to `compileAgentsAllScopes` as `sourcePath`.",
    },
    {
      file: "src/cli/commands/init.tsx",
      posture: "derives from the one function",
      why: "Reads `loadAgentDefs().sourcePath` for the compile pass only; the config-types roster reaches it through `writeProjectConfig`, which loads from the same function.",
    },
    {
      file: "src/cli/commands/uninstall.tsx",
      posture: "derives from the one function",
      why: "`loadAgentDefs().agents` becomes the `agents` half of the propagation data that regenerates every registered project's config-types.ts.",
    },
    {
      file: "src/cli/lib/agents/agent-recompiler.ts",
      posture: "not the union",
      why: "`loadAllAgents(sourcePath)` plus `loadProjectAgents(projectDir)` build the roster of what to COMPILE, including a project's own `.agents-inc/claude/agents/`. Nothing here reaches a type union.",
    },
    {
      file: "src/cli/lib/config-gate/index.ts",
      posture: "derives from the one function",
      why: "`lazyGateDeps` loads agents only when classification proves the write regenerates types, and loads them from `loadAgentDefs`.",
    },
    {
      file: "src/cli/lib/loading/index.ts",
      posture: "re-export only",
      why: "The loading barrel.",
    },
    {
      file: "src/cli/lib/loading/loader.ts",
      posture: "re-export only",
      why: "Declares `loadAllAgents` / `loadMergedAgents` / `loadProjectAgents`. It reads metadata off a directory it is handed and chooses nothing.",
    },
    {
      file: "src/cli/lib/operations/index.ts",
      posture: "re-export only",
      why: "The operations barrel.",
    },
    {
      file: "src/cli/lib/operations/project/index.ts",
      posture: "re-export only",
      why: "The project-operations barrel.",
    },
    {
      file: "src/cli/lib/operations/project/load-agent-defs.ts",
      posture: "the one function",
      why: "`getLocalAgentDefinitions()` answers `sourcePath: PROJECT_ROOT`, so the merge below it has one real side and the result is the CLI's own `src/agents/` — the same directory `AGENT_NAMES` is generated from.",
    },
    {
      file: "src/cli/lib/operations/project/recompile-project-agents.ts",
      posture: "not the union",
      why: "Takes `sourcePath` off `loadAgentDefs` to point a compile pass at the CLI's partials. It reads no roster and writes no types.",
    },
    {
      file: "src/cli/lib/operations/project/write-project-config.ts",
      posture: "derives from the one function",
      why: "The `agents` it hands `writeConfigByScope` becomes the config-types roster for `init --from`.",
    },
  ] as const satisfies readonly AgentDefReader[];

  /** A module reaching none of these holds no roster, so the walk is exhaustive over the class. */
  const LOADER_NAMES = ["loadAllAgents", "loadMergedAgents", "loadAgentDefs"];

  function isTestSource(file: string): boolean {
    return file.includes("/__tests__/") || /\.test\.tsx?$/.test(file);
  }

  function namesALoader(source: string): boolean {
    return LOADER_NAMES.some((loader) => source.includes(loader));
  }

  async function readSource(file: string): Promise<string> {
    return readFile(path.join(PACKAGE_ROOT, file), "utf-8");
  }

  async function productionFilesNamingALoader(): Promise<string[]> {
    const files = await glob("src/cli/**/*.{ts,tsx}", PACKAGE_ROOT);
    const production = files.filter((file) => !isTestSource(file));
    const verdicts = await Promise.all(
      production.map(async (file) => (namesALoader(await readSource(file)) ? [file] : [])),
    );
    return verdicts.flat().sort(bytewise);
  }

  it("is one of the modules rostered here, so a new producer cannot land unjudged", async () => {
    expect(
      await productionFilesNamingALoader(),
      "a module that loads sub-agent definitions and is not rostered above is one nothing holds to the ruling",
    ).toStrictEqual(READERS.map((reader) => reader.file).sort(bytewise));
  });

  describe.each(READERS.filter((reader) => reader.posture === "derives from the one function"))(
    "$file",
    (reader) => {
      it("names loadAgentDefs and no marketplace-aware loader", async () => {
        const source = await readSource(reader.file);

        expect(source).toContain("loadAgentDefs");
        expect(
          source.includes("loadMergedAgents") || source.includes("loadAllAgents("),
          "a config-types producer that reaches a marketplace-aware loader is a second answer to which sub-agents exist",
        ).toBe(false);
      });
    },
  );
});
