import path from "path";

import { EJECT_SOURCE, STANDARD_FILES } from "../../consts";
import type { SkillConfig, SkillId } from "../../types";
import { directoryExists, fileExists, readFile } from "../../utils/fs";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { parseFrontmatter, readSkillMetadata, type UnusableSkillMetadata } from "../loading";

/**
 * What became of the skill a saved config entry names, when the loaded catalogue does not
 * carry it.
 *
 * The wizard resolves an installed roster against the catalogue, and an id it cannot find is
 * an id it cannot put on any screen — so the merge drops that entry and `edit` reports a
 * removal the user never asked for. Reporting it is right; reporting all of them the same way
 * was not. A marketplace entry the source no longer carries is gone from the CATALOGUE. A
 * local entry is gone from the DISK — or is not gone at all, and its metadata.yaml simply
 * stopped describing it, which is a file to repair rather than a reason to lose the entry.
 *
 * Told apart at the entry's own install path. A local skill lives at
 * `<skillsDir>/<id>` — the one address `copySkillsToLocalFlattened`, `deleteLocalSkill` and
 * `migrateLocalSkillScope` all write to — so the entry names exactly where to look. What is
 * asked there is borrowed rather than invented: {@link readSkillMetadata} gives the same verdict
 * local-skill discovery, `compile` and `doctor` already share about that file, and
 * {@link parseFrontmatter}'s `name` is the same identity discovery registers the skill under.
 */
type SavedSkillFate =
  /** No local copy is claimed: the marketplace this entry names no longer carries the skill. */
  | { kind: "dropped-by-source" }
  /** Its local install is gone from the disk — nothing is left at the path it was ejected to. */
  | { kind: "files-gone"; skillDir: string }
  /** The directory is there but registers no skill by that name (no metadata.yaml, or a SKILL.md naming another). */
  | { kind: "not-installed-there"; skillDir: string }
  /** The skill is installed and intact — its declared category is one no domain in this source claims. */
  | { kind: "unplaceable-category"; skillDir: string; category: string }
  /** The directory is there and its metadata.yaml describes no skill — repairable, so the run refuses instead. */
  | { kind: "unusable-metadata"; detail: UnusableSkillMetadata };

type ClassifiedSkill = { id: SkillId; fate: SavedSkillFate };

/**
 * The saved entries whose local skill is installed but whose metadata.yaml describes no skill.
 *
 * A run that meets one must stop rather than drop the entry: the file can be repaired, and
 * `compile` already refuses the whole run over the same verdict about the same file. Dropping
 * the entry instead would spend a config record on a YAML typo, and say the marketplace did it.
 */
export async function findUnusableSavedSkillMetadata(
  unresolvedIds: readonly SkillId[],
  savedSkills: readonly SkillConfig[],
  projectDir: string,
): Promise<UnusableSkillMetadata[]> {
  const classified = await classifyUnresolvedSkills(unresolvedIds, savedSkills, projectDir);
  return classified.flatMap(({ fate }) => (fate.kind === "unusable-metadata" ? [fate.detail] : []));
}

/**
 * Why each unresolvable entry went, for `edit`'s Changes block.
 *
 * These removals are the only ones the user did not ask for: the wizard could not represent
 * the skill, so it never appeared on any screen to be deselected, and the merge drops it.
 * Reporting the id alone would read as "we removed something you chose to remove"; the reason
 * says which of the things below happened. Every other removal is a deselection the user
 * watched themselves make and needs no reason.
 *
 * An entry {@link findUnusableSavedSkillMetadata} would name is deliberately absent from the
 * map — that run refuses before any of this is printed, so a sentence for it would only ever
 * be a wrong one.
 */
export async function unresolvedSkillRemovalReasons(
  unresolvedIds: readonly SkillId[],
  savedSkills: readonly SkillConfig[],
  projectDir: string,
  sourceLabel: string,
): Promise<ReadonlyMap<SkillId, string>> {
  const classified = await classifyUnresolvedSkills(unresolvedIds, savedSkills, projectDir);
  return new Map(
    classified.flatMap(({ id, fate }) => {
      const reason = removalReason(id, fate, sourceLabel);
      return reason === null ? [] : [[id, reason] as const];
    }),
  );
}

async function classifyUnresolvedSkills(
  unresolvedIds: readonly SkillId[],
  savedSkills: readonly SkillConfig[],
  projectDir: string,
): Promise<ClassifiedSkill[]> {
  return Promise.all(
    unresolvedIds.map(async (id) => {
      const saved = savedSkills.find((entry) => entry.id === id);
      return { id, fate: await classifySavedSkill(id, saved, projectDir) };
    }),
  );
}

/**
 * An id with no saved entry behind it — a plugin-discovered skill the config never recorded —
 * is read as the marketplace's: there is no local copy claimed for it to have lost.
 */
async function classifySavedSkill(
  id: SkillId,
  saved: SkillConfig | undefined,
  projectDir: string,
): Promise<SavedSkillFate> {
  if (saved?.origin !== EJECT_SOURCE) return { kind: "dropped-by-source" };

  const skillDir = path.join(resolveInstallPaths(projectDir, saved.scope).skillsDir, id);
  if (!(await directoryExists(skillDir))) return { kind: "files-gone", skillDir };

  const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
  // A directory with no metadata.yaml at all is not registered with the CLI, and `compile`
  // skips rather than refuses it — so this one is reported and removed, not stopped over.
  if (!(await fileExists(metadataPath))) return { kind: "not-installed-there", skillDir };

  const read = await readSkillMetadata(metadataPath);
  if (!read.usable) {
    return {
      kind: "unusable-metadata",
      detail: { skillDirName: id, metadataPath, reason: read.reason },
    };
  }

  // The metadata describes SOME skill. Whether it describes THIS one is SKILL.md's answer — a
  // local skill is identified by its frontmatter name — so a SKILL.md deleted out from under a
  // live metadata.yaml, or renamed under a directory that was not, lands here.
  if (!(await skillMdNames(skillDir, id))) return { kind: "not-installed-there", skillDir };

  // Everything about the install is intact, so what could not be placed is the category this
  // metadata.yaml declares — whichever arm brought the id here. `resolveSkillForPopulation` in
  // `stores/wizard-store.ts` returns null both for a skill the catalogue does not carry and for
  // one it carries under a category no domain claims, and an intact install arrives by either:
  // local discovery refuses the placeholder category before the catalogue is built.
  return { kind: "unplaceable-category", skillDir, category: read.metadata.category };
}

/** Whether the SKILL.md installed here names this skill — a local skill's identity is that name. */
async function skillMdNames(skillDir: string, id: SkillId): Promise<boolean> {
  const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);
  if (!(await fileExists(skillMdPath))) return false;

  const frontmatter = parseFrontmatter(await readFile(skillMdPath), skillMdPath);
  return frontmatter?.name === id;
}

/** The sentence the Changes block puts after the removed row, or null when there is none to give. */
function removalReason(id: SkillId, fate: SavedSkillFate, sourceLabel: string): string | null {
  switch (fate.kind) {
    case "dropped-by-source":
      return `not present in ${sourceLabel}`;
    case "files-gone":
      return `skill files no longer exist at ${fate.skillDir}`;
    case "not-installed-there":
      return `no skill named '${id}' is installed at ${fate.skillDir}`;
    case "unplaceable-category":
      return `installed at ${fate.skillDir}, but its category '${fate.category}' is not one this source knows`;
    case "unusable-metadata":
      return null;
    default: {
      const exhaustive: never = fate;
      return exhaustive;
    }
  }
}
