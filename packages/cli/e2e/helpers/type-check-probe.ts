import { execa } from "execa";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { createRequire } from "node:module";
import { stripVTControlCharacters } from "node:util";

/**
 * Proves generated `config-types.ts` aliases still narrow: each is assigned a bogus literal and
 * tsc must reject it (TS2322); an alias collapsed to `string` produces no diagnostic.
 */

// A union, not `string[]`: a skill id passed as an alias fails tsc on syntax, not narrowing.
export type GeneratedAlias =
  "SkillId" | "AgentName" | "SelectedAgentName" | "ProjectAgentName" | "Domain" | "Category";

// One literal per alias: tsc expands a single-member union rather than printing its alias name.
function bogusLiteralFor(alias: GeneratedAlias): string {
  return `__agentsinc-e2e-bogus-${alias}__`;
}

export const TS_NOT_ASSIGNABLE = "TS2322";

// Code plus this alias's own literal: either alone matches some other diagnostic.
function rejectionOf(alias: GeneratedAlias): string {
  return `${TS_NOT_ASSIGNABLE}: Type '"${bogusLiteralFor(alias)}"'`;
}

export const TS_UNKNOWN_PROPERTY = "TS2353";

// Resolved through Node's module lookup: `npx tsc` from a temp dir finds the wrong package.
const TSC_BIN = createRequire(import.meta.url).resolve("typescript/bin/tsc");

// The weakest consumer tsconfig the generated pair must hold under, not a mirror of this repo's.
const TSC_FLAGS = [
  "--ignoreConfig",
  "--noEmit",
  "--strict",
  "--target",
  "ES2022",
  "--module",
  "ESNext",
  "--moduleResolution",
  "bundler",
] as const;

const PROBE_FILENAME = "type-narrowing-probe.ts";

const CONFIG_FILENAME = "config.ts";

function renderNarrowingProbe(aliases: readonly GeneratedAlias[]): string {
  const importLine = `import type { ${aliases.join(", ")} } from "./config-types";`;
  const assignments = aliases.map(
    (alias) => `export const probe${alias}: ${alias} = "${bogusLiteralFor(alias)}";`,
  );
  return [importLine, ...assignments, ""].join("\n");
}

export type NarrowingProbe = {
  exitCode: number;
  output: string;
  /** Judge by comparing to the aliases asked for: any one rejection fails tsc. */
  rejected: readonly GeneratedAlias[];
};

/** The probe file sits beside `config-types.ts` and is removed before returning. */
export async function probeConfigTypesNarrowing(
  sourceFolderDir: string,
  aliases: readonly GeneratedAlias[],
): Promise<NarrowingProbe> {
  const probePath = path.join(sourceFolderDir, PROBE_FILENAME);
  await writeFile(probePath, renderNarrowingProbe(aliases));

  try {
    const result = await execa("node", [TSC_BIN, ...TSC_FLAGS, probePath], { reject: false });
    const output = stripVTControlCharacters(result.stdout + result.stderr);

    return {
      exitCode: result.exitCode ?? 1,
      output,
      rejected: aliases.filter((alias) => output.includes(rejectionOf(alias))),
    };
  } finally {
    await rm(probePath, { force: true });
  }
}

/** Whether the config the CLI wrote type-checks against its generated types; writes nothing. */
export async function typecheckGeneratedConfig(
  sourceFolderDir: string,
): Promise<{ exitCode: number; output: string }> {
  const configPath = path.join(sourceFolderDir, CONFIG_FILENAME);
  const result = await execa("node", [TSC_BIN, ...TSC_FLAGS, "--skipLibCheck", configPath], {
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 1,
    output: stripVTControlCharacters(result.stdout + result.stderr),
  };
}
