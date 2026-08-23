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

/**
 * A sub-agent a marketplace ships and the CLI does not.
 *
 * Not an `AgentName` and deliberately not cast to one: that union is generated from the CLI's own
 * `src/agents/` by `scripts/generate-source-types.ts`, so a name only a marketplace carries is
 * outside it by construction — which is the whole reason a union built from a marketplace-aware
 * roster names something nothing can compile.
 */
const MARKETPLACE_ONLY_AGENT = "fixture-marketplace-only-agent";

/**
 * Which sub-agents exist, asked of one loader.
 *
 * Names only, sorted: the DEFINITIONS differ between a CLI agent and a marketplace agent of the
 * same name (title, description, tools), and none of that reaches a type union. What reaches it
 * is the roster.
 */
function rosterOf(agents: Partial<Record<AgentName, unknown>>): string[] {
  return typedKeys(agents).sort(bytewise);
}

/**
 * "Which sub-agents exist" has one answer, and every path that generates the sub-agent unions in a
 * `config-types.ts` derives it from `loadAgentDefs`.
 *
 * The answer is CLI-ONLY (owner ruling 2026-08-21), because that is what the rest of the system
 * already is: `AGENT_NAMES` is generated from the CLI's own `src/agents/` and nothing else, agent
 * partials resolve through `getLocalAgentDefinitions`, which answers `PROJECT_ROOT`, and every
 * compile pass therefore looks for a sub-agent's partials under the CLI. A union built from
 * CLI ∪ marketplace admits a name none of those three can honour.
 *
 * **The defect this file exists against is not one wrong producer but FOUR producers of one
 * union**, two of which had drifted: `init` (through `writeProjectConfig`) and the background
 * loader in `config-types-writer.ts` loaded CLI ∪ marketplace, while `edit` and `compile` loaded
 * CLI-only — so the same config emitted two different `config-types.ts` files depending on which
 * command last wrote it. Fixing the two would leave the shape that produced them intact, so the
 * roster below is the gate: every production module that reads sub-agent definitions off disk is
 * named here with the posture it takes, and the roster is asserted against a walk of `src/cli`. A
 * fifth producer reddens this file and its author has to say which side it is on.
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
   * The control, and the half without which the two assertions above mean nothing: they would read
   * identically against a fixture that declares no sub-agent at all, or against a loader that
   * reads no marketplace. This proves the fixture ships one, that the OTHER answer really does
   * carry it, and that the name is outside the compile-time roster — so a producer taking that
   * answer puts a literal in `AgentName` that no compile pass can honour.
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

  /**
   * What a module does with the sub-agent definitions it loads. The four are exhaustive over the
   * roster below, and the distinction that matters is the first two against the last two: a
   * roster that reaches `config-types.ts` decides a literal union a user's hand-written `config.ts`
   * is checked against, and a roster that reaches only a compile pass or the wizard's grouping
   * decides no type at all.
   */
  type UnionPosture =
    /** `loadAgentDefs` itself — the single definition of "which sub-agents exist". */
    | "the one function"
    /** Reaches a config-types.ts write, and gets its roster from the one function. */
    | "derives from the one function"
    /** Re-exports a loader and loads nothing itself. */
    | "re-export only"
    /** Loads sub-agent definitions for something that is not a type union. */
    | "not the union"
    /** Reaches a config-types.ts write with its OWN roster. Named, not tolerated silently. */
    | "its own roster";

  type AgentDefReader = {
    /** Path relative to the package root. */
    file: string;
    posture: UnionPosture;
    /** Why that posture is the right one here. */
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
      why: "`loadAllAgents(sourcePath)` plus `loadProjectAgents(projectDir)` build the roster of what to COMPILE, including a project's own `.claude-src/agents/`. Nothing here reaches a type union.",
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
      file: "src/cli/lib/loading/source-loader.ts",
      posture: "not the union",
      why: "Reads the `domain:` field off a source's agent metadata into `matrix.agentDefinedDomains`, which groups rows on the wizard's agents step. No name from here reaches config-types.ts.",
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
      why: "The `agents` it hands `writeScopedFromWizard` becomes the config-types roster for `init` and for `init --from`. It loaded CLI ∪ marketplace until 2026-08-21, which is the half of the defect a user could actually reach.",
    },
  ] as const satisfies readonly AgentDefReader[];

  /**
   * The three names a production module gets sub-agent definitions through.
   *
   * A module reaching none of them holds no roster, so the walk below is exhaustive over the
   * class rather than over a directory somebody remembered to name.
   */
  const LOADER_NAMES = ["loadAllAgents", "loadMergedAgents", "loadAgentDefs"];

  /** A spec or a test-support module: neither ships, so neither is bound by the ruling. */
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
