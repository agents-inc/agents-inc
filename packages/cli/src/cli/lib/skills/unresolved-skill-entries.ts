import path from "path";

import { EJECT_SOURCE, STANDARD_FILES } from "../../consts";
import type { SkillConfig } from "../../types";
import { fileExists } from "../../utils/fs";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { readSkillMetadata, type UnusableSkillMetadata } from "../loading";

/**
 * The saved entries among `savedSkills` whose local skill is installed but whose metadata.yaml
 * describes no skill.
 *
 * A run that meets one must stop rather than carry on without it: the file can be repaired, and
 * `compile` already refuses the whole run over the same verdict about the same file. Which
 * entries are worth asking about is the caller's to say — `edit --from` asks only of those its
 * catalogue does not carry, and a bare `edit`, which loads no catalogue, asks of all of them.
 *
 * Each entry is looked for at its own install path, so both halves of a `[P][G]` pair are read.
 * A local skill lives at `<skillsDir>/<id>` — the one address `copySkillsToLocalFlattened`,
 * `deleteLocalSkill` and `migrateLocalSkillScope` all write to — and {@link readSkillMetadata}
 * gives the same verdict local-skill discovery, `compile` and `doctor` already share about that
 * file.
 */
export async function findUnusableSavedSkillMetadata(
  savedSkills: readonly SkillConfig[],
  projectDir: string,
): Promise<UnusableSkillMetadata[]> {
  const verdicts = await Promise.all(
    savedSkills.map((saved) => unusableMetadataOf(saved, projectDir)),
  );
  return verdicts.filter((verdict) => verdict !== null);
}

/**
 * A directory with no metadata.yaml at all is not registered with the CLI, and `compile` skips
 * rather than refuses it.
 */
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
