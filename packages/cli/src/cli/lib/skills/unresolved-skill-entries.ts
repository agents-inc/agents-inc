import path from "path";

import { EJECT_SOURCE, STANDARD_FILES } from "../../consts";
import type { SkillConfig, SkillId } from "../../types";
import { fileExists } from "../../utils/fs";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { readSkillMetadata, type UnusableSkillMetadata } from "../loading";

/**
 * The saved entries the loaded catalogue does not carry whose local skill is installed but whose
 * metadata.yaml describes no skill.
 *
 * A run that meets one must stop rather than drop the entry: the file can be repaired, and
 * `compile` already refuses the whole run over the same verdict about the same file. Dropping
 * the entry instead would spend a config record on a YAML typo, and say the marketplace did it.
 *
 * Looked for at the entry's own install path. A local skill lives at `<skillsDir>/<id>` — the one
 * address `copySkillsToLocalFlattened`, `deleteLocalSkill` and `migrateLocalSkillScope` all write
 * to — and {@link readSkillMetadata} gives the same verdict local-skill discovery, `compile` and
 * `doctor` already share about that file.
 */
export async function findUnusableSavedSkillMetadata(
  unresolvedIds: readonly SkillId[],
  savedSkills: readonly SkillConfig[],
  projectDir: string,
): Promise<UnusableSkillMetadata[]> {
  const verdicts = await Promise.all(
    unresolvedIds.map((id) =>
      unusableMetadataOf(
        id,
        savedSkills.find((entry) => entry.id === id),
        projectDir,
      ),
    ),
  );
  return verdicts.filter((verdict) => verdict !== null);
}

/**
 * Only an ejected entry claims a local copy. A directory with no metadata.yaml at all is not
 * registered with the CLI, and `compile` skips rather than refuses it.
 */
async function unusableMetadataOf(
  id: SkillId,
  saved: SkillConfig | undefined,
  projectDir: string,
): Promise<UnusableSkillMetadata | null> {
  if (saved?.origin !== EJECT_SOURCE) return null;

  const skillDir = path.join(resolveInstallPaths(projectDir, saved.scope).skillsDir, id);
  const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
  if (!(await fileExists(metadataPath))) return null;

  const read = await readSkillMetadata(metadataPath);
  return read.usable ? null : { skillDirName: id, metadataPath, reason: read.reason };
}
