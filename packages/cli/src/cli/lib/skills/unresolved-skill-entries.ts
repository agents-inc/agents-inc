import path from "path";

import { EJECT_SOURCE, STANDARD_FILES } from "../../consts";
import type { SkillConfig } from "../../types";
import { fileExists } from "../../utils/fs";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { readSkillMetadata, type UnusableSkillMetadata } from "../loading";

/** Saved entries whose local skill is installed but whose metadata.yaml describes no skill. */
export async function findUnusableSavedSkillMetadata(
  savedSkills: readonly SkillConfig[],
  projectDir: string,
): Promise<UnusableSkillMetadata[]> {
  const verdicts = await Promise.all(
    savedSkills.map((saved) => unusableMetadataOf(saved, projectDir)),
  );
  return verdicts.filter((verdict) => verdict !== null);
}

/** A directory with no metadata.yaml is unregistered, so `compile` skips rather than refuses it. */
async function unusableMetadataOf(
  saved: SkillConfig,
  projectDir: string,
): Promise<UnusableSkillMetadata | null> {
  if (!claimsLocalCopy(saved)) return null;

  const metadataPath = installedMetadataPath(saved, projectDir);
  if (!(await fileExists(metadataPath))) return null;

  const read = await readSkillMetadata(metadataPath);
  return read.usable ? null : { skillDirName: saved.id, metadataPath, reason: read.reason };
}

/** Only an installed, ejected entry claims a local copy: a tombstone names nothing on disk. */
function claimsLocalCopy(saved: SkillConfig): boolean {
  return !saved.excluded && saved.origin === EJECT_SOURCE;
}

function installedMetadataPath(saved: SkillConfig, projectDir: string): string {
  const { skillsDir } = resolveInstallPaths(projectDir, saved.scope);
  return path.join(skillsDir, saved.id, STANDARD_FILES.METADATA_YAML);
}
