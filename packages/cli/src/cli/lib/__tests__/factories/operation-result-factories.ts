import type {
  CompilationResult,
  DiscoveredSkills,
  LoadedSource,
  SkillCopyResult,
} from "../../operations/index.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

// Every default is an operation that found or did nothing; a spec relying on one names it.

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
