import { existsSync } from "fs";
import { globalHomeFor } from "../../src/cli/lib/__tests__/helpers/global-home.js";
import path from "path";
import { expect } from "vitest";
import {
  loadConfigOrFail,
  parseCompiledAgentSections,
  readCompiledAgents,
  sourceFolderIn,
} from "../helpers/test-utils.js";
import {
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

// Compiled agents, config.ts and config-types.ts at one scope; rendered output is asserted by the
// caller. `inspect` reports and `expect` throws over one core, so a spec and a hand-run agree.

// Alias NAMES: the probe imports them and supplies its own bogus literal.
const GENERATED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

type SkillListSide = "preloaded" | "dynamic";

// A preload renders `pluginRef ?? id`; a dynamic skill's heading is always the bare id.
type SkillPlacement = {
  agent: string;
  side: SkillListSide;
  ref: string;
  headingId: string | null;
};

type SurfaceFinding = {
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
  /** Defaults to `dir`. Never `os.homedir()`: the spawned binary runs under a temp HOME. */
  globalHome?: string;
  expectEmpty?: boolean;
};

export async function inspectFourSurfaces(
  dir: string,
  options?: SurfaceOptions,
): Promise<SurfaceReading> {
  const globalHome = globalHomeFor({ dir, globalHome: options?.globalHome });
  const expectEmpty = options?.expectEmpty ?? false;
  const sourceFolder = sourceFolderIn(dir);

  const config = await loadConfigOrFail(dir);
  const { agents, skills } = config;
  const bodies = await readCompiledAgents(dir);
  const compiledFiles = Object.keys(bodies);
  const skillIds = skills.map((entry) => String(entry.id));

  // Only this scope's agents compile here; a name declared at both scopes is never a leak.
  const here = dir === globalHome ? "global" : "project";
  const mine = agents.filter((a) => a.scope === here).map((a) => String(a.name));
  const theirs = agents
    .filter((a) => a.scope !== here)
    .map((a) => String(a.name))
    .filter((name) => !mine.includes(name));

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

  const typecheck = await typecheckGeneratedConfig(sourceFolder);
  const narrowing = await probeConfigTypesNarrowing(sourceFolder, GENERATED_ALIASES);
  const aliasesAccepting = GENERATED_ALIASES.filter((alias) => !narrowing.rejected.includes(alias));

  const findings: SurfaceFinding[] = expectEmpty
    ? [
        { claim: "this scope owns no skills", held: skills.length === 0 },
        { claim: "this scope compiles no agents", held: compiledFiles.length === 0 },
      ]
    : [
        {
          // Without this floor every `length === 0` claim holds over an empty scope. Skills OR agents,
          // because a scope can hold one without the other.
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
          // Each assigned skill appears exactly once across preloads and activation, in the ref form its
          // origin dictates, and nothing unassigned appears.
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
          // A union degraded to `string` still type-checks, so probe each alias for a rejection.
          claim: "config-types.ts still rejects a literal outside its union, alias by alias",
          held: aliasesAccepting.length === 0,
          ...(aliasesAccepting.length > 0 && {
            detail: `${aliasesAccepting.join(", ")} accepted the bogus literal — ${
              narrowing.output.slice(0, 400) || "no diagnostics at all"
            }`,
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

function agentsCompiledHere(
  agents: readonly AgentScopeConfig[],
  bodies: Record<string, string>,
): { name: AgentName; body: string }[] {
  return agents.flatMap((entry) => {
    const body = bodies[`${String(entry.name)}.md`];
    return body === undefined ? [] : [{ name: entry.name, body }];
  });
}

// Mirrors the filters of `buildCompileAgents` in lib/installation/local-installer.ts.
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

// Same rule as `pluginRefFor`: ejected or unconfigured skills render bare, marketplace ones `id:id`.
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

function sortedPlacementLines(placements: readonly SkillPlacement[]): string[] {
  return placements
    .map(({ agent, side, ref, headingId }) =>
      headingId === null
        ? `${agent} [${side}] ${ref}`
        : `${agent} [${side}] ${ref} (heading: ${headingId})`,
    )
    .sort(bytewise);
}

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

  // Same membership, different arity: one skill rendered twice.
  return `assigned ${expected.length} placements but rendered ${rendered.length}: ${rendered.join("; ")}`;
}
