/**
 * Every emitted `AgentName` union must agree on which sub-agents are custom, so every producer
 * builds its data through the one constructor. Read off the source: a producer added later is one
 * no behaviour spec yet drives.
 */

import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { describe, expect, it } from "vitest";

import { glob } from "../../../utils/fs";
import { bytewise } from "../../../utils/string";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("every producer of ConfigTypesBackgroundData", () => {
  /** What a module does with the type. Only the first builds one. */
  type ProducerPosture =
    /** Declares the type and the one constructor for it. */
    | "the one constructor"
    /** Calls the constructor and reads the value; builds nothing of its own. */
    | "calls the constructor"
    /** Re-exports the type and builds nothing. */
    | "re-export only"
    /** Builds its own. Named, not tolerated silently. */
    | "its own constructor";

  type BackgroundDataReader = {
    /** Path relative to the package root. */
    file: string;
    posture: ProducerPosture;
    /** Why that posture is the right one here. */
    why: string;
  };

  const READERS = [
    {
      file: "src/cli/lib/config-gate/index.ts",
      posture: "calls the constructor",
      why: "`writeScopeConfigTypes` wraps the gate deps it already loaded and hands them to `regenerateConfigTypes`.",
    },
    {
      file: "src/cli/lib/config-gate/pair-writer.ts",
      posture: "calls the constructor",
      why: "`renderStandaloneTypes` needs the same three values to call `generateConfigTypesSource`.",
    },
    {
      file: "src/cli/lib/config-gate/propagate.ts",
      posture: "calls the constructor",
      why: "`writeProjectConfigPair` regenerates a propagated project's types from the matrix and agents the fan-out already loaded.",
    },
    {
      file: "src/cli/lib/configuration/config-types-io.ts",
      posture: "the one constructor",
      why: "The type is declared here, so the constructor is too. Every producer is handed the matrix and the agent roster it builds from; none loads them for itself.",
    },
    {
      file: "src/cli/lib/configuration/config-types-writer.ts",
      posture: "re-export only",
      why: "The surface both halves are read through: the renderers from `@workspace/compile/config-types-source`, the disk-probing half from `config-types-io.ts`.",
    },
  ] as const satisfies readonly BackgroundDataReader[];

  /**
   * A module naming neither token holds no `ConfigTypesBackgroundData`, so the walk is exhaustive.
   */
  const CONSTRUCTION_TOKENS = ["ConfigTypesBackgroundData", "customAgentNames"];

  /** A spec or a test-support module: neither ships, so neither is bound by the rule. */
  function isTestSource(file: string): boolean {
    return file.includes("/__tests__/") || /\.test\.tsx?$/.test(file);
  }

  async function readSource(file: string): Promise<string> {
    return readFile(path.join(PACKAGE_ROOT, file), "utf-8");
  }

  async function productionFilesNaming(tokens: readonly string[]): Promise<string[]> {
    const files = await glob("src/cli/**/*.{ts,tsx}", PACKAGE_ROOT);
    const production = files.filter((file) => !isTestSource(file));
    const verdicts = await Promise.all(
      production.map(async (file) => {
        const source = await readSource(file);
        return tokens.some((token) => source.includes(token)) ? [file] : [];
      }),
    );
    return verdicts.flat().sort(bytewise);
  }

  it("is one of the modules rostered here, so a fourth producer cannot land unjudged", async () => {
    expect(
      await productionFilesNaming(CONSTRUCTION_TOKENS),
      "a module that builds or reads this type and is not rostered above is one nothing holds to the rule",
    ).toStrictEqual(READERS.map((reader) => reader.file).sort(bytewise));
  });

  /** The derivation itself: a module carrying it computes the custom set, whatever its row says. */
  it("derives the custom set in exactly one module", async () => {
    expect(
      await productionFilesNaming(["?.custom === true"]),
      "two modules deriving which sub-agents are custom is two answers to one question",
    ).toStrictEqual(["src/cli/lib/configuration/config-types-io.ts"]);
  });
});
