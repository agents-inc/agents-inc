/** A root file `tsconfig.json` type-checks but no ESLint block names is skipped by `eslint .` silently. */

import path from "path";
import { ESLint } from "eslint";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";

const TSCONFIG_PATH = path.join(CLI_ROOT, "tsconfig.json");

/** Named by no lint block, so the probe below is shown able to see a missing config. */
const UNROSTERED_ROOT_FILE = path.join(CLI_ROOT, "vitest.unrostered.config.ts");

function rootFilesTheTypeCheckerIncludes(): string[] {
  const { config, error } = ts.readConfigFile(TSCONFIG_PATH, (file) => ts.sys.readFile(file));
  if (error !== undefined) throw new Error(`${TSCONFIG_PATH} does not parse`);

  return ts
    .parseJsonConfigFileContent(config, ts.sys, CLI_ROOT)
    .fileNames.filter((file) => path.dirname(file) === CLI_ROOT);
}

describe("the package's root tool files", () => {
  it("are each linted, wherever the type checker reaches them", async () => {
    const eslint = new ESLint({ cwd: CLI_ROOT });
    const rootFiles = rootFilesTheTypeCheckerIncludes();

    const unlinted = (
      await Promise.all(
        rootFiles.map(async (file) =>
          (await eslint.calculateConfigForFile(file)) === undefined ? [path.basename(file)] : [],
        ),
      )
    ).flat();

    expect(rootFiles, "no root file was found, so nothing below was judged").not.toStrictEqual([]);
    expect(
      unlinted,
      "add each to ROOT_TOOL_CONFIGS in eslint.config.js: `eslint .` skips it without a word",
    ).toStrictEqual([]);
  });

  it("would be named if one had no lint block", async () => {
    const eslint = new ESLint({ cwd: CLI_ROOT });

    expect(await eslint.calculateConfigForFile(UNROSTERED_ROOT_FILE)).toBeUndefined();
  });
});
