import type {
  CompilationResult,
  DiscoveredSkills,
  LoadedSource,
  SkillCopyResult,
} from "../../operations/index.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

/**
 * What the operations a command is built from answer, for a spec that stubs them.
 *
 * Each factory is typed against the operation's own result type, so a field the product adds is
 * a compile error at the one default here, and a field it retires is a compile error at every
 * override still naming it — neither survives as a dead value a hand-written object literal
 * returns. Every default is the result of an operation that found or did NOTHING, and a spec
 * whose assertion depends on one of those empties names it at the call site rather than
 * inheriting it.
 */

/** `loadSource`'s answer: the source it was handed, and no startup messages captured. */
export function buildLoadedSource(
  sourceResult: SourceLoadResult,
  overrides?: Partial<LoadedSource>,
): LoadedSource {
  return { sourceResult, startupMessages: [], ...overrides };
}

/** `discoverInstalledSkills`' answer for an installation holding no skill in either scope. */
export function buildDiscoveredSkills(overrides?: Partial<DiscoveredSkills>): DiscoveredSkills {
  return {
    allSkills: {},
    totalSkillCount: 0,
    pluginSkillCount: 0,
    localSkillCount: 0,
    globalPluginSkillCount: 0,
    globalLocalSkillCount: 0,
    unusableMetadata: [],
    ...overrides,
  };
}

/** A compile pass's answer when it compiled nothing and had nothing to say. */
export function buildCompilationResult(overrides?: Partial<CompilationResult>): CompilationResult {
  return {
    compiled: [],
    rewritten: [],
    failed: [],
    warnings: [],
    ...overrides,
  };
}

/** `copyLocalSkills`' answer when neither scope had a local skill to copy. */
export function buildSkillCopyResult(overrides?: Partial<SkillCopyResult>): SkillCopyResult {
  return { projectCopied: [], globalCopied: [], totalCopied: 0, ...overrides };
}
