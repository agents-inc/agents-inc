import { existsSync } from "fs";
import path from "path";
import { expect } from "vitest";
import { readAllSkillEntries, readAgentEntries } from "../fixtures/dual-scope-helpers.js";
import { readCompiledAgents } from "../helpers/test-utils.js";
import {
  TS_NOT_ASSIGNABLE,
  typecheckGeneratedConfig,
  probeConfigTypesNarrowing,
} from "../helpers/type-check-probe.js";

/**
 * The four assertion surfaces `standards/e2e/user-journeys.md` defines, read at
 * one scope: the compiled agent files, the written `config.ts`, and the
 * generated `config-types.ts`. (The fourth, rendered output, belongs to whoever
 * drove the command and is asserted at the call site.)
 *
 * One core with two presentations, deliberately. `inspectFourSurfaces` reports
 * and `expectFourSurfaces` throws, so a spec and a hand-run cannot drift on what
 * "strict" means — which they did: the hand-run's first pass asserted presence
 * where the suite asserted content, and neither noticed.
 */

/**
 * The generated aliases an install fills in at whatever scope it writes, named
 * exactly as `probeConfigTypesNarrowing` wants them: it takes ALIAS NAMES to
 * import and supplies its own bogus literal. Handing it a literal instead emits
 * `import type { definitely-not-a-real-id }`, which tsc rejects as a SYNTAX
 * error — non-zero for a reason that has nothing to do with narrowing, so the
 * check below held even against a union collapsed all the way to `string`.
 */
const GENERATED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

export type SurfaceFinding = {
  claim: string;
  held: boolean;
  detail?: string;
};

export type SurfaceReading = {
  skillIds: readonly string[];
  agentsAtThisScope: readonly string[];
  compiledFiles: readonly string[];
  findings: readonly SurfaceFinding[];
  held: boolean;
};

export type SurfaceOptions = {
  /**
   * The global HOME this installation writes into. Defaults to `dir`, which is
   * right for a global install. **Never `os.homedir()`** — a spec's own process
   * runs under the machine's home while the binary it spawned runs under a
   * temp one, so reading it there checks the wrong tree and passes anyway.
   */
  globalHome?: string;
  /** This scope must own nothing; the absence is what is asserted. */
  expectEmpty?: boolean;
};

/** Reads all four surfaces and reports what each holds, without throwing. */
export async function inspectFourSurfaces(
  dir: string,
  options?: SurfaceOptions,
): Promise<SurfaceReading> {
  const globalHome = options?.globalHome ?? dir;
  const expectEmpty = options?.expectEmpty ?? false;
  const claudeSrc = path.join(dir, ".claude-src");

  const skills = await readAllSkillEntries(dir);
  const agents = await readAgentEntries(dir);
  const bodies = await readCompiledAgents(dir);
  const compiledFiles = Object.keys(bodies);
  const skillIds = skills.map((entry) => String(entry.id));

  // A config records agents at BOTH scopes; only this scope's compile here. And
  // a [P][G] pair is ONE name at two scopes, so a name present at this scope is
  // never a leak — the other side compiles its own half.
  const here = dir === globalHome ? "global" : "project";
  const mine = agents.filter((a) => a.scope === here).map((a) => String(a.name));
  const theirs = agents
    .filter((a) => a.scope !== here)
    .map((a) => String(a.name))
    .filter((name) => !mine.includes(name));

  // The loader has already narrowed `scope` to one of two values, so asserting
  // that is tautological. What is worth asking is whether the skill LIVES where
  // its entry claims — config and disk disagreeing is the defect class the
  // scope system keeps producing.
  const misplaced = skills
    .filter((entry) => entry.origin === "eject")
    .filter((entry) => {
      const base = entry.scope === "global" ? globalHome : dir;
      return !existsSync(path.join(base, ".claude", "skills", String(entry.id)));
    })
    .map((entry) => `${String(entry.id)}[${entry.scope}]`);

  const unattributed = skills
    .filter((entry) => typeof entry.origin !== "string" || entry.origin.length === 0)
    .map((entry) => String(entry.id));

  const uncompiled = mine.filter((name) => !compiledFiles.includes(`${name}.md`));
  const leaked = theirs.filter((name) => compiledFiles.includes(`${name}.md`));
  const undeclared = compiledFiles.filter(
    (file) => !agents.some((a) => `${String(a.name)}.md` === file),
  );

  // A compiled agent naming a skill this configuration does not carry is the
  // failure a directory listing cannot see.
  const dangling: string[] = [];
  for (const [file, body] of Object.entries(bodies)) {
    const referenced = [...body.matchAll(/^\s*-\s+([a-z0-9-]+)\s*$/gm)]
      .map((match) => match[1])
      .filter((ref): ref is string => ref !== undefined && ref.includes("-"));
    for (const ref of referenced) {
      if (!skillIds.includes(ref) && !dangling.includes(`${file} → ${ref}`)) {
        dangling.push(`${file} → ${ref}`);
      }
    }
  }

  const typecheck = await typecheckGeneratedConfig(claudeSrc);
  const narrowing = await probeConfigTypesNarrowing(claudeSrc, GENERATED_ALIASES);

  const findings: SurfaceFinding[] = expectEmpty
    ? [
        { claim: "this scope owns no skills", held: skills.length === 0 },
        { claim: "this scope compiles no agents", held: compiledFiles.length === 0 },
      ]
    : [
        {
          claim: "every ejected skill sits at the scope its entry claims",
          held: misplaced.length === 0,
          ...(misplaced.length > 0 && { detail: misplaced.join(", ") }),
        },
        {
          claim: "every skill entry names its origin",
          held: unattributed.length === 0,
          ...(unattributed.length > 0 && { detail: unattributed.join(", ") }),
        },
        {
          claim: "every agent at this scope is compiled here",
          held: uncompiled.length === 0,
          ...(uncompiled.length > 0 && { detail: uncompiled.join(", ") }),
        },
        {
          claim: "no other scope's agent is compiled here",
          held: leaked.length === 0,
          ...(leaked.length > 0 && { detail: leaked.join(", ") }),
        },
        {
          claim: "nothing is compiled that the config does not declare",
          held: undeclared.length === 0,
          ...(undeclared.length > 0 && { detail: undeclared.join(", ") }),
        },
        {
          claim: "no compiled agent references a skill this config does not carry",
          held: dangling.length === 0,
          ...(dangling.length > 0 && { detail: dangling.join(", ") }),
        },
        {
          claim: "config.ts type-checks against its own generated types",
          held: typecheck.exitCode === 0,
          ...(typecheck.exitCode !== 0 && { detail: typecheck.output.slice(0, 400) }),
        },
        {
          // A union degraded to `string` type-checks cleanly, so the positive
          // check above cannot tell a narrow union from a useless one. The
          // verdict is the DIAGNOSTIC, not the exit code: tsc exits non-zero for
          // a malformed probe too, and a probe that never compiled has asked
          // nothing about the unions.
          claim: "config-types.ts still rejects a literal outside its union",
          held: narrowing.output.includes(TS_NOT_ASSIGNABLE),
          ...(!narrowing.output.includes(TS_NOT_ASSIGNABLE) && {
            detail: narrowing.output.slice(0, 400) || "no diagnostics — the unions accept anything",
          }),
        },
      ];

  return {
    skillIds,
    agentsAtThisScope: mine,
    compiledFiles,
    findings,
    held: findings.every((finding) => finding.held),
  };
}

/** Asserts all four surfaces at `dir`, naming what failed and why. */
export async function expectFourSurfaces(
  dir: string,
  options?: SurfaceOptions,
): Promise<SurfaceReading> {
  const reading = await inspectFourSurfaces(dir, options);
  const broken = reading.findings.filter((finding) => !finding.held);

  expect(
    broken.map((finding) =>
      finding.detail ? `${finding.claim} — ${finding.detail}` : finding.claim,
    ),
    `Four-surface check failed at ${dir}`,
  ).toStrictEqual([]);

  return reading;
}
