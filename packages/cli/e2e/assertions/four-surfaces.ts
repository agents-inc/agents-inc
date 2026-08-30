import { existsSync } from "fs";
import { globalHomeFor } from "../../src/cli/lib/__tests__/helpers/global-home.js";
import path from "path";
import { expect } from "vitest";
import {
  loadConfigOrFail,
  parseCompiledAgentSections,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import {
  TS_NOT_ASSIGNABLE,
  typecheckGeneratedConfig,
  probeConfigTypesNarrowing,
} from "../helpers/type-check-probe.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";
import { buildSkillRefsFromConfig } from "../../src/cli/lib/resolver.js";
import {
  activeAgentScopeMap,
  effectivelyExcludedSkillIds,
  isActiveAt,
} from "../../src/cli/lib/configuration/scope-predicates.js";
import { bytewise } from "../../src/cli/utils/string.js";
import type {
  AgentName,
  AgentScopeConfig,
  ProjectConfig,
  SkillReference,
} from "../../src/cli/types/index.js";

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

/** Which of a compiled agent's two skill lists an entry sits in. */
type SkillListSide = "preloaded" | "dynamic";

/**
 * One place a skill occupies in one compiled agent: the list it sits in, the ref
 * that list renders it as, and — on the dynamic side only — the bare id its
 * `### ` heading carries.
 *
 * `headingId` is `null` on the preloaded side because the frontmatter renders no
 * heading, not because nothing is checked there. The two sides are NOT
 * symmetrical: a preload is emitted as `pluginRef ?? id`, so a marketplace skill
 * reads `id:id` there, while a dynamic skill's heading is the BARE id in both
 * modes and only its `Invoke:` line carries the ref. An expectation keyed on the
 * ref form alone reads one of the two lines a dynamic skill occupies.
 */
type SkillPlacement = {
  agent: string;
  side: SkillListSide;
  ref: string;
  headingId: string | null;
};

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
  const globalHome = globalHomeFor({ dir, globalHome: options?.globalHome });
  const expectEmpty = options?.expectEmpty ?? false;
  const claudeSrc = path.join(dir, ".claude-src");

  // One load, not three: every claim below reads the same config snapshot, so no
  // two of them can disagree about what this scope declares.
  const config = await loadConfigOrFail(dir);
  const { agents, skills } = config;
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

  // Where each compiled agent PUT its skills, against where this config says they
  // belong — both directions at once, which is the failure a directory listing
  // cannot see and a scan of the body cannot see either.
  const compiledHere = agentsCompiledHere(agents, bodies);
  const assignedPlacements = sortedPlacementLines(
    expectedPlacements(
      config,
      compiledHere.map((agent) => agent.name),
    ),
  );
  const writtenPlacements = sortedPlacementLines(
    compiledHere.flatMap((agent) => renderedPlacements(String(agent.name), agent.body)),
  );
  const placementDrift = placementDifference(assignedPlacements, writtenPlacements);

  const typecheck = await typecheckGeneratedConfig(claudeSrc);
  const narrowing = await probeConfigTypesNarrowing(claudeSrc, GENERATED_ALIASES);

  const findings: SurfaceFinding[] = expectEmpty
    ? [
        { claim: "this scope owns no skills", held: skills.length === 0 },
        { claim: "this scope compiles no agents", held: compiledFiles.length === 0 },
      ]
    : [
        {
          // The floor. Six of the claims below are `length === 0` over collections read
          // off this installation, so a scope that owns nothing satisfies every one of
          // them — measured: all eight held over a config whose `skills` and `agents`
          // were empty, generated pair included. `expectEmpty: true` is the explicit way
          // to claim that state, so on this branch a populated scope is part of what is
          // being asserted.
          //
          // Skills OR compiled agents, because a scope legitimately holds one without the
          // other: `commands/init-from-agent-scope` splits a sub-agent to global scope and
          // leaves every skill in the project, so the global side owns one compiled agent
          // and no skills at all and is read here on purpose.
          claim: "this scope owns at least one skill or compiled agent",
          held: skills.length > 0 || compiledFiles.length > 0,
        },
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
          // Both directions over one installation: every skill this config assigns
          // an agent appears exactly once across that agent's preload list and its
          // activation protocol — never both, never neither, in the ref form its own
          // `origin` dictates — and every entry in those two lists is a skill this
          // config carries.
          //
          // The reading it replaces matched `^\s*-\s+([a-z0-9-]+)\s*$` over the whole
          // body, which had no colon in its character class: it therefore skipped
          // every plugin-mode preload in the tree, and false-matched any kebab-cased
          // one-word prose bullet an agent's `identity.md` happens to carry.
          claim: "each compiled agent's skill lists partition exactly what this config assigns it",
          held: placementDrift === null,
          ...(placementDrift !== null && { detail: placementDrift }),
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

/**
 * The agents this config declares that also have a compiled file at this scope, each
 * paired with the body that was written for it.
 *
 * An agent declared here but compiled elsewhere has no body to read, and a body here that
 * no config row declares is the `undeclared` claim's subject rather than this one's.
 */
function agentsCompiledHere(
  agents: readonly AgentScopeConfig[],
  bodies: Record<string, string>,
): { name: AgentName; body: string }[] {
  return agents.flatMap((entry) => {
    const body = bodies[`${String(entry.name)}.md`];
    return body === undefined ? [] : [{ name: entry.name, body }];
  });
}

/**
 * Where this config says each compiled agent's skills must appear, and in what form.
 *
 * Derived rather than written out, so a template change moves both sides at once and
 * nothing here has to be re-baselined. The two filters mirror `buildCompileAgents` in
 * `lib/installation/local-installer.ts`, which is what the compile pass itself applies:
 * an effectively-excluded skill is dropped, and a globally-scoped sub-agent sees only
 * globally-scoped skills.
 */
function expectedPlacements(
  config: ProjectConfig,
  agentNames: readonly AgentName[],
): SkillPlacement[] {
  const excludedIds = effectivelyExcludedSkillIds(config.skills);
  const globalIds = new Set(config.skills.filter((s) => isActiveAt(s, "global")).map((s) => s.id));
  const originById = new Map(config.skills.map((s) => [s.id, s.origin]));
  const scopeByAgent = activeAgentScopeMap(config.agents);

  return agentNames.flatMap((name) => {
    const seesGlobalOnly = scopeByAgent.get(name) === "global";
    return buildSkillRefsFromConfig(config.stack?.[name] ?? {})
      .filter((ref) => !excludedIds.has(ref.id) && (!seesGlobalOnly || globalIds.has(ref.id)))
      .map((ref) => placementFor(String(name), ref, originById.get(ref.id)));
  });
}

/**
 * The one place a skill's assignment and its `origin` put it.
 *
 * `origin` decides the ref form on the same rule `pluginRefFor` applies — declared in
 * `@workspace/compile`'s `agent-source.ts`, which `lib/compiler.ts` imports: an ejected skill,
 * and one with no config entry at all, renders bare, and anything from a marketplace renders
 * as `id:id`.
 */
function placementFor(
  agent: string,
  ref: SkillReference,
  origin: string | undefined,
): SkillPlacement {
  const rendered = origin === undefined || origin === EJECT_SOURCE ? ref.id : `${ref.id}:${ref.id}`;
  return ref.preloaded === true
    ? { agent, side: "preloaded", ref: rendered, headingId: null }
    : { agent, side: "dynamic", ref: rendered, headingId: ref.id };
}

/** Where one compiled agent actually put each skill. */
function renderedPlacements(agent: string, body: string): SkillPlacement[] {
  const { preloadedRefs, dynamicEntries } = parseCompiledAgentSections(body);

  return [
    ...preloadedRefs.map<SkillPlacement>((ref) => ({
      agent,
      side: "preloaded",
      ref,
      headingId: null,
    })),
    ...dynamicEntries.map<SkillPlacement>(({ id, invokeRef }) => ({
      agent,
      side: "dynamic",
      ref: invokeRef,
      headingId: id,
    })),
  ];
}

/** One placement as the line a failure names it by, sorted so the two sides line up. */
function sortedPlacementLines(placements: readonly SkillPlacement[]): string[] {
  return placements
    .map(({ agent, side, ref, headingId }) =>
      headingId === null
        ? `${agent} [${side}] ${ref}`
        : `${agent} [${side}] ${ref} (heading: ${headingId})`,
    )
    .sort(bytewise);
}

/** What the two readings disagree about, or `null` when they are identical. */
function placementDifference(expected: string[], rendered: string[]): string | null {
  if (expected.length === rendered.length && expected.every((line, i) => line === rendered[i])) {
    return null;
  }

  const unrendered = expected.filter((line) => !rendered.includes(line));
  const unassigned = rendered.filter((line) => !expected.includes(line));
  const halves = [
    unrendered.length > 0 ? `assigned but not rendered: ${unrendered.join("; ")}` : "",
    unassigned.length > 0 ? `rendered but not assigned: ${unassigned.join("; ")}` : "",
  ].filter((half) => half.length > 0);
  if (halves.length > 0) return halves.join(" — ");

  // Same membership, different arity — one skill rendered twice on one side. Neither
  // difference above can see it, and "exactly once" is half of what is being claimed.
  return `assigned ${expected.length} placements but rendered ${rendered.length}: ${rendered.join("; ")}`;
}
