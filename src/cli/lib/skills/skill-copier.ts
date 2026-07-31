import path from "path";

import { copy, ensureDir, isPathWithin } from "../../utils/fs";
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

  await injectForkedFromMetadata(destPath, skill.id, contentHash, source);

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

export async function copySkillsToPluginFromSource(
  selectedSkillIds: SkillId[],
  pluginDir: string,
  sourceResult: SourceLoadResult,
  sourceSelections?: Partial<Record<SkillId, string>>,
  onProgress?: CopyProgressCallback,
): Promise<CopiedSkill[]> {
  const total = selectedSkillIds.length;
  let completed = 0;
  const results = await Promise.all(
    selectedSkillIds.map(async (skillId): Promise<CopiedSkill> => {
      const skill = getSkillById(skillId);

      const selectedSource = sourceSelections?.[skillId];
      const userSelectedRemote = selectedSource && selectedSource !== EJECT_SOURCE;

      let result: CopiedSkill;
      if (skill.local && skill.localPath && !userSelectedRemote) {
        result = await resolveLocalCopiedSkill(skill, skill.localPath);
      } else {
        result = await copySkillFromSource(skill, pluginDir, sourceResult);
      }

      completed++;
      onProgress?.(completed, total);
      return result;
    }),
  );

  return results;
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
  const results = await Promise.all(
    selectedSkillIds.map(async (skillId): Promise<CopiedSkill> => {
      const skill = getSkillById(skillId);

      const selectedSource = sourceSelections?.[skillId];
      const userSelectedRemote = selectedSource && selectedSource !== EJECT_SOURCE;

      if (skill.local && skill.localPath && !userSelectedRemote) {
        const destPath = getFlattenedSkillDestPath(skill, localSkillsDir);
        const alreadyInPlace = path.resolve(skill.localPath) === path.resolve(destPath);

        if (alreadyInPlace) {
          return resolveLocalCopiedSkill(skill, skill.localPath);
        }

        const contentHash = await generateSkillHash(skill.localPath);
        await ensureDir(path.dirname(destPath));
        await copy(skill.localPath, destPath);
        return { skillId: skill.id, sourcePath: skill.localPath, destPath, contentHash };
      }

      return copySkillToLocalFlattened(skill, localSkillsDir, sourceResult);
    }),
  );

  return results;
}
