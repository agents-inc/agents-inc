import os from "os";
import path from "path";
import { mkdtemp } from "fs/promises";

import { isDeepEqual, omit } from "remeda";
import { seedExternalSkillSchema } from "@workspace/matrix/seed";
import {
  carriedSkillAuthor,
  carriedSkillMetadata,
  withInstalledName,
} from "@workspace/compile/carried-skill";

import { GITHUB_SOURCE, LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../consts.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { parseFrontmatter, readSkillMetadata } from "../loading/loader.js";
import { getCategoryDomain } from "../matrix/matrix-provider.js";
import { claimSlug } from "../matrix/skill-resolution.js";
import { validateSkillPath } from "../skills/skill-copier.js";
import {
  injectForkedFromMetadata,
  readForkedFromMetadata,
  readLocalSkillMetadata,
  writeMetadataYaml,
} from "../skills/skill-metadata.js";
import { defaultUsageGuidance } from "../stacks/stacks-loader.js";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix.js";
import { computeFileHash } from "../versioning.js";
import { copy, directoryExists, glob, readFile, remove, writeFile } from "../../utils/fs.js";
import { typedEntries, typedKeys } from "../../utils/typed-object.js";

import type { SkillScope } from "../../types/config.js";
import type { Domain, MergedSkillsMatrix, ResolvedSkill } from "../../types/matrix.js";
import type { CategoryPath, SkillId, SkillSlug } from "../../types/skills.js";
import type { ForkedFromMetadata, LocalSkillMetadata } from "../skills/skill-metadata.js";
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

function repoRef(repo: string): string {
  return `${GITHUB_SOURCE.GITHUB_PREFIX}${repo}`;
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

/**
 * Writes carried skills into `matrix` in place so the decode can resolve them. Both refusals run
 * before anything is seated, so a refused run leaves the matrix untouched.
 */
export function registerExternalSkills(
  payload: SeedPayload,
  matrix: MergedSkillsMatrix,
  projectDir: string,
): ExternalSkillInstall[] {
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

async function writeExternalSkill(install: ExternalSkillInstall): Promise<WrittenSkill> {
  const before = await readSkillDir(install.skillDir);

  await writeSkillTree(install);
  await writeSkillManifest(install);
  await registerSkillOnDisk(install);

  return { id: install.id, changed: !isDeepEqual(before, await readSkillDir(install.skillDir)) };
}

type SkillDirReading = { files: SeedSkillTree; metadata: Record<string, unknown> | null };

/**
 * Excludes the `forkedFrom` date, which every write moves. Metadata is compared as data because
 * the stamp's position in the file differs between a first and second write.
 */
async function readSkillDir(skillDir: string): Promise<SkillDirReading | null> {
  if (!(await directoryExists(skillDir))) return null;

  const files = omit(await readSkillTree(skillDir), [STANDARD_FILES.METADATA_YAML]);
  return { files, metadata: undated(await readLocalSkillMetadata(skillDir)) };
}

function undated(metadata: LocalSkillMetadata | null): Record<string, unknown> | null {
  if (metadata?.forkedFrom === undefined) return metadata;
  return { ...metadata, forkedFrom: omit(metadata.forkedFrom, ["date"]) };
}

type BlockedDestination = { id: SkillId; skillDir: string };

/**
 * Refuses when a destination holds content no shared configuration carried. Only
 * {@link registerSkillOnDisk} writes `forkedFrom.path`, so its presence marks a carried directory.
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

/** The keys came off the wire, so each path is guarded against escaping the skill directory. */
async function writeSkillTree(install: ExternalSkillInstall): Promise<void> {
  for (const [relativePath, contents] of Object.entries(install.skill.files)) {
    const filePath = path.join(install.skillDir, relativePath);
    validateSkillPath(filePath, install.skillDir, relativePath);
    await writeFile(filePath, contents);
  }
}

async function writeSkillManifest(install: ExternalSkillInstall): Promise<void> {
  const manifestPath = path.join(install.skillDir, STANDARD_FILES.SKILL_MD);
  await writeFile(
    manifestPath,
    withInstalledName(await readFile(manifestPath), {
      id: install.id,
      description: install.skill.description,
    }),
  );
}

/** `forkedFrom` records repository and path, the only record a re-share can rebuild from. */
async function registerSkillOnDisk(install: ExternalSkillInstall): Promise<void> {
  const metadataPath = path.join(install.skillDir, STANDARD_FILES.METADATA_YAML);
  const shipped = await readLocalSkillMetadata(install.skillDir);

  await writeMetadataYaml(
    metadataPath,
    carriedSkillMetadata({
      id: install.id,
      skill: install.skill,
      domain: install.domain,
      usageGuidance: defaultUsageGuidance(install.skill.categoryId),
      shipped,
    }),
  );
  await injectForkedFromMetadata(
    install.skillDir,
    install.id,
    await computeFileHash(path.join(install.skillDir, STANDARD_FILES.SKILL_MD)),
    { source: repoRef(install.skill.repo), path: install.skill.path },
  );
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

/** The inverse of {@link repoRef}; a non-GitHub ref answers nothing, for the caller to refuse. */
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
