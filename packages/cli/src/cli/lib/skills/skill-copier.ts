import path from "path";

import { copy, ensureDir, isPathWithin } from "../../utils/fs";
import { getErrorMessage } from "../../utils/errors";
import { computeFileHash } from "../versioning";
import { EJECT_SOURCE, SOURCE_SRC_DIR, STANDARD_FILES } from "../../consts";
import type { ResolvedSkill, SkillId } from "../../types";
import type { SourceLoadResult } from "../loading";
import { getSkillById } from "../matrix/matrix-provider";
import { injectForkedFromMetadata } from "./skill-metadata";

export type CopiedSkill = {
  skillId: SkillId;
  contentHash: string;
  sourcePath: string;
  destPath: string;
  local?: boolean;
};

const NULL_BYTE_PATTERN = /\0/;

/**
 * Validate that a resolved path stays within the expected parent directory.
 * Prevents path traversal attacks where skill.path contains sequences like "../../sensitive".
 */
export function validateSkillPath(
  resolvedPath: string,
  expectedParent: string,
  skillPath: string,
): void {
  if (NULL_BYTE_PATTERN.test(skillPath)) {
    throw new Error(`Invalid skill path: '${skillPath}' contains null bytes`);
  }

  if (!isPathWithin(resolvedPath, expectedParent)) {
    throw new Error(
      `Invalid skill path: '${skillPath}' escapes expected directory '${path.resolve(expectedParent)}'`,
    );
  }
}

/**
 * Join basePath + skillPath, validate the result stays within basePath,
 * and return the resolved path. Combines path.join + validateSkillPath
 * to eliminate repeated join-then-validate boilerplate.
 */
function resolveSkillPath(basePath: string, skillPath: string): string {
  const resolved = path.join(basePath, skillPath);
  validateSkillPath(resolved, basePath, skillPath);
  return resolved;
}

function getSkillSourcePath(skill: ResolvedSkill, rootDir: string): string {
  const srcDir = path.join(rootDir, SOURCE_SRC_DIR);
  return resolveSkillPath(srcDir, skill.path);
}

function getSkillDestPath(skill: ResolvedSkill, stackDir: string): string {
  const skillRelativePath = skill.path.replace(/^skills\//, "");
  const skillsDir = path.join(stackDir, "skills");
  return resolveSkillPath(skillsDir, skillRelativePath);
}

async function generateSkillHash(skillSourcePath: string): Promise<string> {
  const skillMdPath = path.join(skillSourcePath, STANDARD_FILES.SKILL_MD);
  return computeFileHash(skillMdPath);
}

/** Core copy: hash the source SKILL.md, copy the directory, stamp forkedFrom provenance. */
async function copySkillTo(
  skill: ResolvedSkill,
  sourcePath: string,
  destPath: string,
  source?: string,
): Promise<CopiedSkill> {
  const contentHash = await generateSkillHash(sourcePath);

  await ensureDir(path.dirname(destPath));
  await copy(sourcePath, destPath);

  // No directory: the marketplace this ref names resolves the id itself, so where inside it the
  // skill lived is not part of installing it again. Absent rather than undefined, because that is
  // the difference between "no ref was given" and "the ref is the word undefined".
  await injectForkedFromMetadata(destPath, skill.id, contentHash, {
    ...(source !== undefined && { source }),
  });

  return { skillId: skill.id, contentHash, sourcePath, destPath };
}

export async function copySkill(
  skill: ResolvedSkill,
  stackDir: string,
  registryRoot: string,
  source?: string,
): Promise<CopiedSkill> {
  return copySkillTo(
    skill,
    getSkillSourcePath(skill, registryRoot),
    getSkillDestPath(skill, stackDir),
    source,
  );
}

export async function copySkillFromSource(
  skill: ResolvedSkill,
  stackDir: string,
  sourceResult: SourceLoadResult,
): Promise<CopiedSkill> {
  return copySkillTo(
    skill,
    getSkillSourcePath(skill, sourceResult.sourcePath),
    getSkillDestPath(skill, stackDir),
    sourceResult.sourceConfig.source,
  );
}

/**
 * In-place CopiedSkill for a local skill left where it already lives (no copy):
 * source and destination are the skill's own local path.
 */
async function resolveLocalCopiedSkill(
  skill: ResolvedSkill,
  localPath: string,
): Promise<CopiedSkill> {
  const contentHash = await generateSkillHash(localPath);
  return {
    skillId: skill.id,
    sourcePath: localPath,
    destPath: localPath,
    contentHash,
    local: true,
  };
}

export type CopyProgressCallback = (completed: number, total: number) => void;

/**
 * Copies every selected skill, and reports the ones that could not be copied BY ID.
 *
 * `Promise.all` alone rejects with whichever error arrived first and discards its siblings', and
 * that error is the filesystem's: an `ENOENT` naming a path inside the source cache. The reader is
 * told a file is missing at an address they did not choose, cannot place, and cannot act on — and
 * they learn about the second missing skill only by fixing the first and running again.
 *
 * The condition is ordinary rather than exotic: the copy walks the MATRIX and reads from the
 * FETCHED directory, so any disagreement between the two lands here. A user whose CLI predates a
 * marketplace change has no way to make them agree, which makes the id the only actionable thing
 * the failure can carry.
 *
 * It still throws. A partial copy would leave an installation missing skills its config records,
 * which is the orphan-entry state the plugin-install path already refuses.
 */
async function copyEachSkill(
  selectedSkillIds: SkillId[],
  copyOne: (skillId: SkillId) => Promise<CopiedSkill>,
): Promise<CopiedSkill[]> {
  const outcomes = await Promise.all(
    selectedSkillIds.map(async (skillId) => attemptCopy(skillId, copyOne)),
  );
  const failures = outcomes.filter(isCopyFailure);

  if (failures.length > 0) throw new Error(copyFailureMessage(failures, selectedSkillIds.length));

  return outcomes.filter(isCopySuccess).map((outcome) => outcome.copied);
}

type CopySuccess = { skillId: SkillId; copied: CopiedSkill };
type CopyFailure = { skillId: SkillId; problem: string };
type CopyOutcome = CopySuccess | CopyFailure;

async function attemptCopy(
  skillId: SkillId,
  copyOne: (skillId: SkillId) => Promise<CopiedSkill>,
): Promise<CopyOutcome> {
  try {
    return { skillId, copied: await copyOne(skillId) };
  } catch (error) {
    return { skillId, problem: getErrorMessage(error) };
  }
}

function isCopyFailure(outcome: CopyOutcome): outcome is CopyFailure {
  return "problem" in outcome;
}

function isCopySuccess(outcome: CopyOutcome): outcome is CopySuccess {
  return "copied" in outcome;
}

/** One line per skill that failed, so both what failed and why are named for every one of them. */
function copyFailureMessage(failures: CopyFailure[], attempted: number): string {
  const lines = failures.map((failure) => `  ${failure.skillId}: ${failure.problem}`);

  return `Could not copy ${failures.length} of ${attempted} skills:\n${lines.join("\n")}`;
}

export async function copySkillsToPluginFromSource(
  selectedSkillIds: SkillId[],
  pluginDir: string,
  sourceResult: SourceLoadResult,
  sourceSelections?: Partial<Record<SkillId, string>>,
  onProgress?: CopyProgressCallback,
): Promise<CopiedSkill[]> {
  const total = selectedSkillIds.length;
  let completed = 0;

  return copyEachSkill(selectedSkillIds, async (skillId) => {
    const skill = getSkillById(skillId);

    const selectedSource = sourceSelections?.[skillId];
    const userSelectedRemote = selectedSource && selectedSource !== EJECT_SOURCE;

    const result =
      skill.local && skill.localPath && !userSelectedRemote
        ? await resolveLocalCopiedSkill(skill, skill.localPath)
        : await copySkillFromSource(skill, pluginDir, sourceResult);

    completed++;
    onProgress?.(completed, total);

    return result;
  });
}

function getFlattenedSkillDestPath(skill: ResolvedSkill, localSkillsDir: string): string {
  return resolveSkillPath(localSkillsDir, skill.id);
}

async function copySkillToLocalFlattened(
  skill: ResolvedSkill,
  localSkillsDir: string,
  sourceResult: SourceLoadResult,
): Promise<CopiedSkill> {
  return copySkillTo(
    skill,
    getSkillSourcePath(skill, sourceResult.sourcePath),
    getFlattenedSkillDestPath(skill, localSkillsDir),
    sourceResult.sourceConfig.source,
  );
}

export async function copySkillsToLocalFlattened(
  selectedSkillIds: SkillId[],
  localSkillsDir: string,
  sourceResult: SourceLoadResult,
  sourceSelections?: Partial<Record<SkillId, string>>,
): Promise<CopiedSkill[]> {
  return copyEachSkill(selectedSkillIds, async (skillId) => {
    const skill = getSkillById(skillId);

    const selectedSource = sourceSelections?.[skillId];
    const userSelectedRemote = selectedSource && selectedSource !== EJECT_SOURCE;
    if (!skill.local || !skill.localPath || userSelectedRemote) {
      return copySkillToLocalFlattened(skill, localSkillsDir, sourceResult);
    }

    const destPath = getFlattenedSkillDestPath(skill, localSkillsDir);
    if (path.resolve(skill.localPath) === path.resolve(destPath)) {
      return resolveLocalCopiedSkill(skill, skill.localPath);
    }

    const contentHash = await generateSkillHash(skill.localPath);
    await ensureDir(path.dirname(destPath));
    await copy(skill.localPath, destPath);

    return { skillId: skill.id, sourcePath: skill.localPath, destPath, contentHash };
  });
}
