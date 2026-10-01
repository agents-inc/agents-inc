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
 * Every alias `assembleConfigTypesSource` emits into a generated `config-types.ts`
 * (`src/cli/lib/configuration/config-types-writer.ts`), and so the whole vocabulary a probe may
 * import.
 *
 * A union rather than `readonly string[]` because the probe takes alias NAMES and supplies its
 * own literal, and the two are indistinguishable at runtime while proving opposite things. A
 * skill id handed over in an alias's place renders `import type { web-framework-react }`, which
 * tsc rejects as a SYNTAX error — non-zero for a reason that has nothing to do with narrowing, so
 * a caller written `exitCode !== 0` held against a `config-types.ts` degraded all the way to
 * `SkillId = string`, which is the exact failure this probe exists to catch. Typed this way the
 * mistake is a compile error instead.
 */
export type GeneratedAlias =
  "SkillId" | "AgentName" | "SelectedAgentName" | "ProjectAgentName" | "Domain" | "Category";

/**
 * A literal no generated union can legitimately contain, and a DIFFERENT one per alias.
 *
 * Deliberately not a plausible slug, so a fixture rename can never turn it into a real member —
 * and deliberately alias-specific, which is what lets a caller ask whether EACH alias rejected
 * rather than whether any did. One shared literal makes the three assignments indistinguishable in
 * tsc's output, so a single surviving narrow alias covers for two that have collapsed.
 *
 * The alias NAME cannot do that job, measured against tsc 5.9 on 2026-09-20: it prints the alias
 * for a multi-member union (`… is not assignable to type 'SkillId'`) and EXPANDS a single-member
 * one (`… to type '"web-developer"'`), so an install with one agent has no `AgentName` in its
 * output at all. The literal is on the source side of the message and is printed verbatim either
 * way.
 */
function bogusLiteralFor(alias: GeneratedAlias): string {
  return `__agentsinc-e2e-bogus-${alias}__`;
}

/** TypeScript's "type X is not assignable to type Y" diagnostic. */
export const TS_NOT_ASSIGNABLE = "TS2322";

/**
 * The substring that says `alias` rejected its literal: the diagnostic CODE and the literal only
 * that alias was assigned, in one match.
 *
 * Both halves are needed. The code alone is the reading this replaced — satisfied by any one
 * alias. The literal alone would be satisfied by a diagnostic of some other kind about the same
 * assignment, which is a failure rather than a rejection.
 */
function rejectionOf(alias: GeneratedAlias): string {
  return `${TS_NOT_ASSIGNABLE}: Type '"${bogusLiteralFor(alias)}"'`;
}

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
 * The FLOOR a consumer's tsconfig is assumed to meet — deliberately not a mirror
 * of this repo's. What the probe type-checks is a config the CLI wrote into
 * somebody else's project, so the settings that matter are the weakest ones it
 * still has to hold under, not whatever this repo happens to compile itself at.
 * `--target ES2022` stays put for that reason even though `packages/cli` moved to
 * ES2023 (via `@workspace/typescript-config/node.json`): a generated pair that
 * narrows at ES2022 narrows at every later target too, and re-pinning this list
 * to follow the repo would make an unrelated tsconfig bump able to move a test's
 * verdict.
 *
 * `--ignoreConfig` is what makes tsc ignore any surrounding tsconfig.json, so the
 * probe's verdict cannot be perturbed by the temp directory's location — the same
 * independence, stated as a flag. Passing the files positionally used to imply
 * that on its own; TypeScript 6 refuses the combination with TS5112 instead, and
 * requires the intent to be stated outright.
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

/** The generated config a source folder exists to hold. */
const CONFIG_FILENAME = "config.ts";

/**
 * Renders a probe module that imports the given aliases from a sibling
 * `config-types` and assigns each one its own {@link bogusLiteralFor} literal.
 */
function renderNarrowingProbe(aliases: readonly GeneratedAlias[]): string {
  const importLine = `import type { ${aliases.join(", ")} } from "./config-types";`;
  const assignments = aliases.map(
    (alias) => `export const probe${alias}: ${alias} = "${bogusLiteralFor(alias)}";`,
  );
  return [importLine, ...assignments, ""].join("\n");
}

/** What a narrowing probe answers: tsc's raw verdict, and which aliases rejected their literal. */
export type NarrowingProbe = {
  exitCode: number;
  output: string;
  /**
   * The aliases that REJECTED their bogus literal, in the order they were asked for.
   *
   * The caller's claim is the whole roster, not a non-empty one: `rejected` shorter than
   * `aliases` names exactly which alias has stopped narrowing, where a shared reading of `output`
   * reports the collapse of one as the success of all three.
   */
  rejected: readonly GeneratedAlias[];
};

/**
 * Type-checks each named alias exported by the `config-types.ts` in
 * `sourceFolderDir` against its own {@link bogusLiteralFor} literal, and returns
 * tsc's verdict alias by alias.
 *
 * The probe file is written next to `config-types.ts` (so its import resolves
 * with no path arithmetic) and removed again before returning, leaving the
 * installed file tree byte-identical for the caller's filesystem assertions.
 *
 * @returns `exitCode` 0 when every alias accepted the bogus literal — i.e. the
 *          unions are NOT narrowing — and non-zero with `TS2322` diagnostics in
 *          `output` when they are. Judge on `rejected` against the aliases you asked
 *          for, never on `exitCode`: tsc exits non-zero for any diagnostic at all, and
 *          `output.includes(TS_NOT_ASSIGNABLE)` is satisfied by ONE alias rejecting
 *          while its neighbours have collapsed to `string`.
 */
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
 * `sourceFolderDir`, so the installed tree stays byte-identical for the caller's
 * filesystem assertions.
 *
 * @returns `exitCode` 0 with empty `output` when the config type-checks.
 */
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
