import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AGENT_NAMES } from "../../types/agents.js";
import { glob } from "../../utils/fs.js";
import { typedKeys } from "../../utils/typed-object.js";
import { bytewise } from "../../utils/string.js";
import { loadMergedAgents } from "../loading/index.js";
import { loadAgentDefs } from "../operations/project/load-agent-defs.js";
import {
  cleanupTestSource,
  createTestSource,
  type TestDirs,
} from "./fixtures/create-test-source.js";
import { DEFAULT_TEST_AGENTS } from "./mock-data/mock-agents.js";
import type { AgentName } from "../../types/index.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Deliberately not cast to `AgentName`: that union is generated from the CLI's own agents only. */
const MARKETPLACE_ONLY_AGENT = "fixture-marketplace-only-agent";

/** Names only: definitions differ between CLI and marketplace agents; only names reach a union. */
function rosterOf(agents: Partial<Record<AgentName, unknown>>): string[] {
  return typedKeys(agents).sort(bytewise);
}

/**
 * Every producer of the sub-agent unions in `config-types.ts` derives its roster from
 * `loadAgentDefs`, which is CLI-only: partials resolve under the CLI, so a marketplace name could
 * not compile. The roster is asserted against a walk of `src/cli`, so a new producer must declare.
 */
describe("every producer of the sub-agent unions in config-types.ts", () => {
  let source: TestDirs;

  beforeAll(async () => {
    source = await createTestSource({
      agents: [
        ...DEFAULT_TEST_AGENTS,
        {
          name: MARKETPLACE_ONLY_AGENT,
          title: "Fixture Marketplace Agent",
          description: "A sub-agent only this marketplace declares",
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanupTestSource(source);
  });

  describe("the one function", () => {
    it("answers CLI-only, so nothing it names is outside AGENT_NAMES", async () => {
      const { agents } = await loadAgentDefs();

      expect(rosterOf(agents)).toStrictEqual([...AGENT_NAMES].sort(bytewise));
    });

    it("leaves out a sub-agent only the marketplace declares", async () => {
      const { agents } = await loadAgentDefs();

      expect(rosterOf(agents)).not.toContain(MARKETPLACE_ONLY_AGENT);
    });
  });

  /**
   * The control: the fixture ships a marketplace agent, the other answer carries it, and it is
   * outside `AgentName`. Without this the assertions above pass on an empty fixture.
   */
  describe("the answer the aligned producers no longer take", () => {
    it("carries the marketplace's own sub-agent", async () => {
      const merged = await loadMergedAgents(source.sourceDir);

      expect(rosterOf(merged)).toContain(MARKETPLACE_ONLY_AGENT);
    });

    it("names a sub-agent AGENT_NAMES does not, which is what makes it uncompilable", () => {
      expect(
        (AGENT_NAMES as readonly string[]).includes(MARKETPLACE_ONLY_AGENT),
        "the generated roster is built from the CLI's own src/agents/ — a marketplace name is not in it",
      ).toBe(false);
    });
  });

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
      why: "`loadAgentDefs` once, handed to `writeProjectConfig` as `agentDefs` and to `compileAgentsAllScopes` as `sourcePath`. This was already the correct side of the split.",
    },
    {
      file: "src/cli/commands/init.tsx",
      posture: "derives from the one function",
      why: "Reads `loadAgentDefs().sourcePath` for the compile pass only; the config-types roster reaches it through `writeProjectConfig`, which now loads from the same function.",
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
      why: "`getAgentDefinitions()` is asked for its local branch, which answers `sourcePath: PROJECT_ROOT`, so the merge below it has one real side and the result is the CLI's own `src/agents/` — the same directory `AGENT_NAMES` is generated from.",
    },
    {
      file: "src/cli/lib/operations/project/recompile-project-agents.ts",
      posture: "not the union",
      why: "Takes `sourcePath` off `loadAgentDefs` to point a compile pass at the CLI's partials. It reads no roster and writes no types.",
    },
    {
      file: "src/cli/lib/operations/project/write-project-config.ts",
      posture: "derives from the one function",
      why: "The `agents` it hands `writeConfigByScope` becomes the config-types roster for `init --from`. It loaded CLI ∪ marketplace until 2026-08-21, which is the half of the defect a user could actually reach.",
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

  it("is one of the modules rostered here, so a fifth producer cannot land unjudged", async () => {
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
