import os from "os";
import path from "path";
import { mkdtemp } from "fs/promises";

import { externalIdsNamingNoDirectory, seedExternalSkillSchema } from "@workspace/matrix/seed";
import { carriedSkillAuthor, installedSkillTree } from "@workspace/compile/carried-skill";

import { GITHUB_SOURCE, LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../consts.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { parseFrontmatter, readSkillMetadata } from "../loading/loader.js";
import { getCategoryDomain } from "../matrix/matrix-provider.js";
import { claimSlug } from "../matrix/skill-resolution.js";
import { validateSkillPath } from "../skills/skill-copier.js";
import { readForkedFromMetadata } from "../skills/skill-metadata.js";
import { defaultUsageGuidance } from "../stacks/stacks-loader.js";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix.js";
import { getCurrentDate } from "../versioning.js";
import {
  copy,
  directoryExists,
  fileExists,
  glob,
  readFile,
  remove,
  writeFile,
} from "../../utils/fs.js";
import { typedEntries, typedKeys } from "../../utils/typed-object.js";

import type { SkillScope } from "../../types/config.js";
import type { Domain, MergedSkillsMatrix, ResolvedSkill } from "../../types/matrix.js";
import type { CategoryPath, SkillId, SkillSlug } from "../../types/skills.js";
import type { ForkedFromMetadata } from "../skills/skill-metadata.js";
import type {
  SeedExternalSkill,
  SeedPayload,
  SeedSkill,
  SeedSkillTree,
} from "@workspace/matrix/seed";

/** One skill the payload carries rather than names, seated and ready to be written. */
export type ExternalSkillInstall = {
  id: SkillId;
  scope: SkillScope;
  skill: SeedExternalSkill;
  domain: Domain;
  skillDir: string;
};

type SelectedExternal = { id: SkillId; skill: SeedExternalSkill; entry: SeedSkill };

/** No marketplace serves a carried skill, and coercing it to eject would defy the payload. */
function pluginInstallError(ids: SkillId[]): string {
  return [
    "This configuration cannot be installed: these skills travel inside it, so no marketplace " +
      "serves them and they cannot be installed as plugins:",
    ...ids.map((id) => `  ${id}`),
    "Re-share it with each skill above set to eject, which is the only way a carried skill installs.",
  ].join("\n");
}

/** Presence in `skills` is selection; `external` content nobody picked installs nothing. */
function selectedExternals(payload: SeedPayload): SelectedExternal[] {
  return typedEntries<SkillId, SeedExternalSkill>(payload.external ?? {}).flatMap(([id, skill]) => {
    const entry = payload.skills[id];
    return entry ? [{ id, skill, entry }] : [];
  });
}

function askedForAsPlugin(externals: SelectedExternal[]): SkillId[] {
  return externals.filter(({ entry }) => entry.install !== "eject").map(({ id }) => id);
}

/**
 * A carried skill on a catalogue id would overwrite that catalogue's copy. Checks the loaded matrix
 * and the shipped catalogue, since the payload chooses which marketplace gets loaded.
 */
function claimingACatalogueId(
  externals: SelectedExternal[],
  matrix: MergedSkillsMatrix,
): SkillId[] {
  return externals.filter(({ id }) => heldByEitherCatalogue(id, matrix)).map(({ id }) => id);
}

const CATALOGUE_SKILL_IDS: ReadonlySet<SkillId> = new Set(typedKeys(BUILT_IN_MATRIX.skills));

function heldByEitherCatalogue(id: SkillId, matrix: MergedSkillsMatrix): boolean {
  return heldByLoadedCatalogue(matrix.skills[id]) || CATALOGUE_SKILL_IDS.has(id);
}

/**
 * A `local` incumbent is exempt so a re-apply works; whether its directory may be overwritten is
 * settled on disk by {@link refuseUncarriedDestinations}.
 */
function heldByLoadedCatalogue(incumbent: ResolvedSkill | undefined): boolean {
  return incumbent !== undefined && incumbent.local !== true;
}

function catalogueIdCollisionError(ids: SkillId[]): string {
  return [
    "This configuration cannot be installed: these skills travel inside it under ids a " +
      "catalogue already owns:",
    ...ids.map((id) => `  ${id}`),
    "A skill id is the directory the skill installs into, so each would be written over the " +
      "catalogue's own copy of that skill. Re-share it with each skill above added again, which " +
      "mints an id — 'external-<category>-<name>' — that no catalogue owns.",
  ].join("\n");
}

/** Boundary cast: a carried skill's id is in no generated union, and is its own slug. */
function externalSlug(id: SkillId): SkillSlug {
  return id as SkillSlug;
}

function externalSkillDir(id: SkillId, scope: SkillScope, projectDir: string): string {
  return path.join(resolveInstallPaths(projectDir, scope).skillsDir, id);
}

function externalCatalogueEntry(install: ExternalSkillInstall): ResolvedSkill {
  return {
    id: install.id,
    slug: externalSlug(install.id),
    displayName: install.skill.displayName,
    description: install.skill.description,
    // Boundary cast: seatExternalSkill has confirmed this catalogue declares the category.
    category: install.skill.categoryId as CategoryPath,
    author: carriedSkillAuthor(install.skill.repo),
    path: `${LOCAL_SKILLS_PATH}/${install.id}/`,
    conflictsWith: [],
    requires: [],
    alternatives: [],
    discourages: [],
    local: true,
    custom: true,
    localPath: install.skillDir,
  };
}

/** An unknown category leaves the skill unseated, so the decode skips and reports it. */
function seatExternalSkill(
  { id, skill, entry }: SelectedExternal,
  matrix: MergedSkillsMatrix,
  projectDir: string,
): ExternalSkillInstall[] {
  const domain = getCategoryDomain(skill.categoryId);
  if (domain === undefined) return [];

  const install: ExternalSkillInstall = {
    id,
    skill,
    domain,
    scope: entry.scope,
    skillDir: externalSkillDir(id, entry.scope, projectDir),
  };

  matrix.skills[id] = externalCatalogueEntry(install);
  claimSlug(matrix.slugMap, externalSlug(id), id);

  return [install];
}

/** Quoted, so an empty id prints as something and an escape is spelled out rather than sent. */
function notADirectoryNameError(ids: string[]): string {
  return [
    "This configuration cannot be installed: these skills travel inside it under ids that are " +
      "not a single directory name:",
    ...ids.map((id) => `  ${JSON.stringify(id)}`),
    "A skill id is the directory the skill is written into, so an id holding a path separator, " +
      "or naming '.' or '..', would be written somewhere other than a directory of its own, " +
      "and one holding a control character would hand it to the terminal wherever that " +
      "directory is named. Re-share it with each skill above added again, which mints an id — " +
      "'external-<category>-<name>' — that names one directory.",
  ].join("\n");
}

/** ext4's `NAME_MAX`, in UTF-8 bytes; a name within it fits Windows' 255 UTF-16 units too. */
const DIRECTORY_NAME_MAX_BYTES = 255;

function overrunsADirectoryName(id: string): boolean {
  return Buffer.byteLength(id, "utf8") > DIRECTORY_NAME_MAX_BYTES;
}

function externalIdsTooLongForADirectory(payload: SeedPayload): string[] {
  return Object.keys(payload.external ?? {}).filter(overrunsADirectoryName);
}

function tooLongForADirectoryError(ids: string[]): string {
  return [
    "This configuration cannot be installed: these skills travel inside it under ids longer " +
      "than a directory name may be:",
    ...ids.map((id) => `  ${JSON.stringify(id)}`),
    "A skill id is the directory the skill is written into, and a directory name may hold at " +
      `most ${String(DIRECTORY_NAME_MAX_BYTES)} bytes, so none of these could be written. ` +
      "Re-share it without each skill above.",
  ].join("\n");
}

/**
 * Writes carried skills into `matrix` in place so the decode can resolve them. Every refusal runs
 * before anything is seated, so a refused run leaves the matrix untouched. The id is checked first:
 * every path a carried skill is written to, scratch copies included, is joined from it.
 */
export function registerExternalSkills(
  payload: SeedPayload,
  matrix: MergedSkillsMatrix,
  projectDir: string,
): ExternalSkillInstall[] {
  const notDirectoryNames = externalIdsNamingNoDirectory(payload);
  if (notDirectoryNames.length > 0) throw new Error(notADirectoryNameError(notDirectoryNames));

  const tooLong = externalIdsTooLongForADirectory(payload);
  if (tooLong.length > 0) throw new Error(tooLongForADirectoryError(tooLong));

  const externals = selectedExternals(payload);
  const asPlugin = askedForAsPlugin(externals);
  const colliding = claimingACatalogueId(externals, matrix);

  if (asPlugin.length > 0) throw new Error(pluginInstallError(asPlugin));
  if (colliding.length > 0) throw new Error(catalogueIdCollisionError(colliding));

  return externals.flatMap((external) => seatExternalSkill(external, matrix, projectDir));
}

/**
 * Answers the ids whose directories changed. Refuses destinations again, since a directory may have
 * appeared while the user read the prompt.
 */
export async function writeExternalSkills(installs: ExternalSkillInstall[]): Promise<SkillId[]> {
  await refuseUncarriedDestinations(installs);

  const written = await Promise.all(installs.map(writeExternalSkill));
  return changedIds(written);
}

const SCRATCH_DIR_PREFIX = "agents-inc-carried-";

/** What {@link writeExternalSkills} would change, by running the write against scratch copies. */
export async function carriedSkillsThatDiffer(
  installs: ExternalSkillInstall[],
): Promise<SkillId[]> {
  if (installs.length === 0) return [];

  const scratch = await mkdtemp(path.join(os.tmpdir(), SCRATCH_DIR_PREFIX));
  try {
    const written = await Promise.all(
      installs.map(async (install) => writeExternalSkill(await scratchCopyOf(install, scratch))),
    );
    return changedIds(written);
  } finally {
    await remove(scratch);
  }
}

async function scratchCopyOf(
  install: ExternalSkillInstall,
  scratch: string,
): Promise<ExternalSkillInstall> {
  const skillDir = path.join(scratch, install.id);
  if (await directoryExists(install.skillDir)) await copy(install.skillDir, skillDir);
  return { ...install, skillDir };
}

type WrittenSkill = { id: SkillId; changed: boolean };

function changedIds(written: WrittenSkill[]): SkillId[] {
  return written.filter(({ changed }) => changed).map(({ id }) => id);
}

/** Writes only the files whose bytes differ, so an unchanged skill keeps its mtimes. */
async function writeExternalSkill(install: ExternalSkillInstall): Promise<WrittenSkill> {
  const files = typedEntries<string, string>(await treeToWrite(install));
  refuseEscapingPaths(install.skillDir, files);

  const written = await Promise.all(
    files.map(([relativePath, contents]) =>
      writeIfChanged(path.join(install.skillDir, relativePath), contents),
    ),
  );
  return { id: install.id, changed: written.some(Boolean) };
}

/** The keys came off the wire, so every path is refused before any file is written. */
function refuseEscapingPaths(skillDir: string, files: [string, string][]): void {
  for (const [relativePath] of files) {
    validateSkillPath(path.join(skillDir, relativePath), skillDir, relativePath);
  }
}

/** The bytes the editor previews, dated today unless nothing in them would change. */
async function treeToWrite(install: ExternalSkillInstall): Promise<SeedSkillTree> {
  const shipped = await withShippedMetadata(install);
  const unchanged = await treeAsInstalled(install, shipped);
  return unchanged ?? carriedTree(install, shipped, getCurrentDate());
}

/**
 * The tree dated as the stamp on disk is, where that makes its metadata the bytes already there:
 * a fresh date would otherwise make an unchanged skill look rewritten.
 */
async function treeAsInstalled(
  install: ExternalSkillInstall,
  shipped: SeedExternalSkill,
): Promise<SeedSkillTree | null> {
  const recorded = (await readForkedFromMetadata(install.skillDir))?.date;
  if (recorded === undefined) return null;

  const tree = await carriedTree(install, shipped, recorded);
  const onDisk = await bytesOnDisk(path.join(install.skillDir, STANDARD_FILES.METADATA_YAML));
  return tree[STANDARD_FILES.METADATA_YAML] === onDisk ? tree : null;
}

function carriedTree(
  install: ExternalSkillInstall,
  skill: SeedExternalSkill,
  date: string,
): Promise<SeedSkillTree> {
  return installedSkillTree({
    id: install.id,
    skill,
    domain: install.domain,
    usageGuidance: defaultUsageGuidance(install.skill.categoryId),
    date,
  });
}

/** Where the payload carries no metadata, the copy on disk stands for what was shipped. */
async function withShippedMetadata(install: ExternalSkillInstall): Promise<SeedExternalSkill> {
  if (Object.hasOwn(install.skill.files, STANDARD_FILES.METADATA_YAML)) return install.skill;

  const onDisk = await bytesOnDisk(path.join(install.skillDir, STANDARD_FILES.METADATA_YAML));
  if (onDisk === null) return install.skill;

  return {
    ...install.skill,
    files: { ...install.skill.files, [STANDARD_FILES.METADATA_YAML]: onDisk },
  };
}

async function bytesOnDisk(filePath: string): Promise<string | null> {
  return (await fileExists(filePath)) ? readFile(filePath) : null;
}

async function writeIfChanged(filePath: string, contents: string): Promise<boolean> {
  if ((await bytesOnDisk(filePath)) === contents) return false;
  await writeFile(filePath, contents);
  return true;
}

type BlockedDestination = { id: SkillId; skillDir: string };

/**
 * Refuses when a destination holds content no shared configuration carried. Only a carried skill's
 * install writes `forkedFrom.path`, so its presence marks a carried directory.
 */
export async function refuseUncarriedDestinations(installs: ExternalSkillInstall[]): Promise<void> {
  const judged = await Promise.all(installs.map(judgeDestination));
  const blocked = judged.filter((destination) => destination !== null);

  if (blocked.length > 0) throw new Error(uncarriedDestinationError(blocked));
}

async function judgeDestination(install: ExternalSkillInstall): Promise<BlockedDestination | null> {
  const { id, skillDir } = install;
  if (!(await directoryExists(skillDir))) return null;
  if ((await readForkedFromMetadata(skillDir))?.path !== undefined) return null;
  return { id, skillDir };
}

function uncarriedDestinationError(blocked: BlockedDestination[]): string {
  return [
    "This configuration cannot be installed: these skills travel inside it under ids this " +
      "installation already keeps a skill directory for, and no shared configuration put those " +
      "directories there:",
    ...blocked.map(({ id, skillDir }) => `  ${id}  ->  ${skillDir}`),
    "A skill id is the directory the skill installs into, so each would be written over a skill " +
      "written here by hand or ejected from a marketplace. Move or rename the directory above, " +
      "or re-share the configuration with each skill added again, which mints an id — " +
      "'external-<category>-<name>' — that nothing here holds.",
  ].join("\n");
}

export type OwnedSkillDir = { id: string; skillDir: string; provenance: ForkedFromMetadata };

export type ContentReading = {
  external: Record<string, SeedExternalSkill>;
  uncarryable: string[];
};

type CarriedRead =
  | { carries: "content"; id: string; skill: SeedExternalSkill }
  | { carries: "nothing" }
  | { carries: "unshareable"; line: string };

function unnameableRepoMessage(id: string): string {
  return `${id} travels inside a shared configuration, and this installation does not record the repository its content came from`;
}

function uncarryableContentMessage(id: string, reason: string): string {
  return `${id} travels inside a shared configuration, and ${reason}`;
}

/** The inverse of the stamp's `github:` source; any other ref answers nothing, to be refused. */
function repoFromRef(ref: string | undefined): string | undefined {
  if (ref === undefined || !ref.startsWith(GITHUB_SOURCE.GITHUB_PREFIX)) return undefined;
  return ref.slice(GITHUB_SOURCE.GITHUB_PREFIX.length);
}

const NO_MANIFEST_DESCRIPTION = `no description can be read from its ${STANDARD_FILES.SKILL_MD}`;

function manifestDescription(files: SeedSkillTree, skillDir: string): string | null {
  const manifest = files[STANDARD_FILES.SKILL_MD];
  if (manifest === undefined) return null;

  const frontmatter = parseFrontmatter(manifest, path.join(skillDir, STANDARD_FILES.SKILL_MD));
  return frontmatter === null ? null : frontmatter.description;
}

async function readSkillTree(skillDir: string): Promise<SeedSkillTree> {
  const files = await glob("**/*", skillDir, { dot: true });
  const entries = await Promise.all(
    files.map(async (file) => [file, await readFile(path.join(skillDir, file))] as const),
  );
  return Object.fromEntries(entries);
}

/**
 * Rebuilds the carried entry from the bytes as installed. The description is the manifest's, not
 * the truncated `cliDescription`, which would shorten the skill on every round trip.
 */
async function readCarriedSkill({ id, skillDir, provenance }: OwnedSkillDir): Promise<CarriedRead> {
  // No path means a catalogue serves this id, so the bytes need not travel.
  if (provenance.path === undefined) return { carries: "nothing" };

  const repo = repoFromRef(provenance.source);
  if (repo === undefined) return { carries: "unshareable", line: unnameableRepoMessage(id) };

  const described = await readSkillMetadata(path.join(skillDir, STANDARD_FILES.METADATA_YAML));
  if (!described.usable) {
    return { carries: "unshareable", line: uncarryableContentMessage(id, described.reason) };
  }

  const files = await readSkillTree(skillDir);
  const description = manifestDescription(files, skillDir);
  if (description === null) {
    return { carries: "unshareable", line: uncarryableContentMessage(id, NO_MANIFEST_DESCRIPTION) };
  }

  const parsed = seedExternalSkillSchema.safeParse({
    displayName: described.metadata.displayName,
    description,
    categoryId: described.metadata.category,
    repo,
    path: provenance.path,
    files,
  });
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => issue.message).join("; ");
    return { carries: "unshareable", line: uncarryableContentMessage(id, reason) };
  }

  return { carries: "content", id, skill: parsed.data };
}

/** The mirror of {@link registerExternalSkills}: reads installed bytes back into entries. */
export async function readCarriedSkills(owned: OwnedSkillDir[]): Promise<ContentReading> {
  const reads = await Promise.all(owned.map(readCarriedSkill));

  return {
    external: Object.fromEntries(
      reads.flatMap((read) => (read.carries === "content" ? [[read.id, read.skill]] : [])),
    ),
    uncarryable: reads.flatMap((read) => (read.carries === "unshareable" ? [read.line] : [])),
  };
}
