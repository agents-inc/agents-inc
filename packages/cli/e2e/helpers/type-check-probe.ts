import { execa } from "execa";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { createRequire } from "node:module";
import { stripVTControlCharacters } from "node:util";

/**
 * Type-narrowing probe for generated `config-types.ts` files.
 *
 * The generated type aliases (`SkillId`, `AgentName`, `Domain`, `Category`) exist
 * for exactly one reason: to make a hand-edited `config.ts` fail `tsc` when it
 * names something that isn't installed. Asserting on the emitted *text* of those
 * aliases only proves what the writer printed; it does not prove the aliases
 * still reject a bad value. A union that degrades to `string` looks harmless in a
 * text assertion and silently accepts everything.
 *
 * This probe asserts the property that actually matters: assign a literal that
 * can never be a real skill id / agent name / domain / category to each alias and
 * let `tsc` render the verdict. Narrowed aliases produce `TS2322`; an alias that
 * has collapsed to `string` produces no diagnostic at all.
 */

/**
 * A literal no generated union can legitimately contain. Deliberately not a
 * plausible slug so a fixture rename can never turn it into a real member.
 */
const BOGUS_TYPE_LITERAL = "__agentsinc-e2e-bogus-literal__";

/** TypeScript's "type X is not assignable to type Y" diagnostic. */
export const TS_NOT_ASSIGNABLE = "TS2322";

/** TypeScript's "object literal may only specify known properties" diagnostic. */
export const TS_UNKNOWN_PROPERTY = "TS2353";

/**
 * Repo-local compiler — `npx tsc` from a temp dir resolves to the wrong package.
 *
 * Resolved through Node's own module lookup rather than a hand-built path, so it
 * finds whichever copy this package itself would import no matter where the
 * installer put it. That location is not stable: bun nested a copy under
 * `packages/cli` while this package pinned its own TypeScript version, and hoists
 * a single copy to the monorepo root now that every workspace agrees on one.
 */
const TSC_BIN = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/**
 * Mirrors the compiler options in the repo's tsconfig.json so the probe
 * type-checks a generated config under the same settings a real consumer would.
 *
 * `--ignoreConfig` is what makes tsc ignore any surrounding tsconfig.json, so the
 * probe's verdict cannot be perturbed by the temp directory's location. Passing
 * the files positionally used to imply that on its own; TypeScript 6 refuses the
 * combination with TS5112 instead, and requires the intent to be stated outright.
 */
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

/** The generated config a `.claude-src/` directory exists to hold. */
const CONFIG_FILENAME = "config.ts";

/**
 * Renders a probe module that imports the given aliases from a sibling
 * `config-types` and assigns {@link BOGUS_TYPE_LITERAL} to each one.
 */
function renderNarrowingProbe(aliases: readonly string[]): string {
  const importLine = `import type { ${aliases.join(", ")} } from "./config-types";`;
  const assignments = aliases.map(
    (alias) => `export const probe${alias}: ${alias} = "${BOGUS_TYPE_LITERAL}";`,
  );
  return [importLine, ...assignments, ""].join("\n");
}

/**
 * Type-checks {@link BOGUS_TYPE_LITERAL} against each named alias exported by the
 * `config-types.ts` in `claudeSrcDir` and returns tsc's verdict.
 *
 * The probe file is written next to `config-types.ts` (so its import resolves
 * with no path arithmetic) and removed again before returning, leaving the
 * installed file tree byte-identical for the caller's filesystem assertions.
 *
 * @returns `exitCode` 0 when every alias accepted the bogus literal — i.e. the
 *          unions are NOT narrowing — and non-zero with `TS2322` diagnostics in
 *          `output` when they are.
 */
export async function probeConfigTypesNarrowing(
  claudeSrcDir: string,
  aliases: readonly string[],
): Promise<{ exitCode: number; output: string }> {
  const probePath = path.join(claudeSrcDir, PROBE_FILENAME);
  await writeFile(probePath, renderNarrowingProbe(aliases));

  try {
    const result = await execa("node", [TSC_BIN, ...TSC_FLAGS, probePath], { reject: false });
    return {
      exitCode: result.exitCode ?? 1,
      output: stripVTControlCharacters(result.stdout + result.stderr),
    };
  } finally {
    await rm(probePath, { force: true });
  }
}

/**
 * Type-checks an installed `config.ts` against the `config-types.ts` written
 * beside it, and returns tsc's verdict.
 *
 * {@link probeConfigTypesNarrowing} asks whether the generated aliases still
 * REJECT something; this asks the complementary question, and the one a user
 * actually meets: does the config the CLI just wrote ACCEPT itself? A generated
 * pair that fails here is a file the user never edited telling them their
 * installation is invalid — the aliases are imported by config.ts on every load,
 * so this is the exact diagnostic their editor shows.
 *
 * `--skipLibCheck` is added to the shared flags because the verdict must be about
 * the generated pair: without it a diagnostic from an ambient .d.ts on the
 * machine could fail a config that is perfectly consistent. Nothing is written to
 * `claudeSrcDir`, so the installed tree stays byte-identical for the caller's
 * filesystem assertions.
 *
 * @returns `exitCode` 0 with empty `output` when the config type-checks.
 */
export async function typecheckGeneratedConfig(
  claudeSrcDir: string,
): Promise<{ exitCode: number; output: string }> {
  const configPath = path.join(claudeSrcDir, CONFIG_FILENAME);
  const result = await execa("node", [TSC_BIN, ...TSC_FLAGS, "--skipLibCheck", configPath], {
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 1,
    output: stripVTControlCharacters(result.stdout + result.stderr),
  };
}
