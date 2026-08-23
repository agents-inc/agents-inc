import path from "path";

import { seedExternalSkillSchema } from "@workspace/matrix/seed";

import { GITHUB_SOURCE, LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../consts.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { readSkillMetadata } from "../loading/loader.js";
import { getCategoryDomain } from "../matrix/matrix-provider.js";
import { claimSlug } from "../matrix/skill-resolution.js";
import { validateSkillPath } from "../skills/skill-copier.js";
import {
  injectForkedFromMetadata,
  readLocalSkillMetadata,
  writeMetadataYaml,
} from "../skills/skill-metadata.js";
import { computeFileHash } from "../versioning.js";
import { glob, readFile, writeFile } from "../../utils/fs.js";
import { typedEntries } from "../../utils/typed-object.js";

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

/**
 * One skill the payload carries rather than names, seated and ready to be written.
 *
 * `skillDir` and `domain` are resolved once, where the checks that make them safe already are:
 * the directory has to be the one the catalogue entry points at, because that is what tells the
 * copy step this skill is already where it belongs, and the domain is what the category guard has
 * just proved this catalogue declares.
 */
export type ExternalSkillInstall = {
  id: SkillId;
  scope: SkillScope;
  skill: SeedExternalSkill;
  domain: Domain;
  skillDir: string;
};

/** One external entry with the skill row that selected it — what the payload says about it. */
type SelectedExternal = { id: SkillId; skill: SeedExternalSkill; entry: SeedSkill };

/**
 * Names every carried skill a payload asks to install as a plugin, not just the first.
 *
 * There is nothing to install them FROM: the payload is the source, so no marketplace serves
 * these ids. Coercing them to eject would install something the payload did not ask for, under a
 * mode the sharer's own screen still shows as plugin — so the ids are named and the run stops.
 */
function pluginInstallError(ids: SkillId[]): string {
  return [
    "This configuration cannot be installed: these skills travel inside it, so no marketplace " +
      "serves them and they cannot be installed as plugins:",
    ...ids.map((id) => `  ${id}`),
    "Re-share it with each skill above set to eject, which is the only way a carried skill installs.",
  ].join("\n");
}

/**
 * The external entries this selection actually names.
 *
 * Presence in `skills` is selection and `external` is only where the bytes are, so content nobody
 * picked installs nothing — seating it would put a skill in the catalogue no part of the
 * configuration asked for.
 */
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
 * Boundary cast: a carried skill's id is minted at intake and belongs to no generated union,
 * which is exactly what makes it external. It is its own slug too — a skill outside every
 * catalogue has no shorter name anything else would recognise, and the sending side says the same.
 */
function externalSlug(id: SkillId): SkillSlug {
  return id as SkillSlug;
}

/** The repository's owner as a handle, which is all the authorship a carried skill records. */
function skillAuthor(repo: string): string {
  const [owner = repo] = repo.split("/");
  return `@${owner}`;
}

/** The repository ref a carried skill's provenance records, in the form every other ref wears. */
function repoRef(repo: string): string {
  return `${GITHUB_SOURCE.GITHUB_PREFIX}${repo}`;
}

/** Where a carried skill's directory goes: under the skills directory of the scope it names. */
function externalSkillDir(id: SkillId, scope: SkillScope, projectDir: string): string {
  return path.join(resolveInstallPaths(projectDir, scope).skillsDir, id);
}

/**
 * The catalogue entry a carried skill becomes on arrival.
 *
 * It declares no relationships and is named by none, which is honest: nothing outside the
 * catalogue can say what this skill conflicts with, and nothing inside it knows the skill exists.
 */
function externalCatalogueEntry(install: ExternalSkillInstall): ResolvedSkill {
  return {
    id: install.id,
    slug: externalSlug(install.id),
    displayName: install.skill.displayName,
    description: install.skill.description,
    // Boundary cast held by the guard above it: the category was confirmed against the catalogue
    // the payload names, and this one has just been shown to declare it too.
    category: install.skill.categoryId as CategoryPath,
    author: skillAuthor(install.skill.repo),
    path: `${LOCAL_SKILLS_PATH}/${install.id}/`,
    conflictsWith: [],
    requires: [],
    alternatives: [],
    discourages: [],
    // Local and custom for the same reason: the bytes are on this machine and nowhere else, and
    // the skill was authored outside the vocabulary this catalogue ships.
    local: true,
    custom: true,
    localPath: install.skillDir,
  };
}

/**
 * Seats one carried skill in the catalogue, or leaves it unseated.
 *
 * A skill is PLACED in the taxonomy and never extends it, so a category this catalogue has no
 * definition for belongs to no domain, renders in no tab and reaches no sub-agent. Left unseated,
 * the id falls to the decode's own skip, which reports it by name.
 */
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
  // Completes the map over the matrix: an entry the slug map does not carry is invisible to
  // anything that addresses a skill by slug.
  claimSlug(matrix.slugMap, externalSlug(id), id);

  return [install];
}

/**
 * Seats the catalogue entries a payload carries, and says where each one's bytes go.
 *
 * Every other id in a payload is resolved against a catalogue the receiver already has, so one it
 * does not know is skipped and reported. A carried skill answers to no catalogue at all — which is
 * why its whole directory travels — so it has to BECOME a catalogue entry before the decode reads
 * the selection, or it is skipped like any other unknown id and the configuration installs
 * quietly smaller than it was shared.
 *
 * The entries are written into `matrix` in place, exactly as the local-skill merge writes the
 * skills it discovers on disk. That matrix is the object `initializeMatrix` seated, which is what
 * {@link getCategoryDomain} reads — every caller passes the loaded source's own.
 *
 * @throws {Error} If any carried skill asks to be installed as a plugin — see
 *   {@link pluginInstallError}.
 */
export function registerExternalSkills(
  payload: SeedPayload,
  matrix: MergedSkillsMatrix,
  projectDir: string,
): ExternalSkillInstall[] {
  const externals = selectedExternals(payload);
  const asPlugin = askedForAsPlugin(externals);

  if (asPlugin.length > 0) throw new Error(pluginInstallError(asPlugin));

  return externals.flatMap((external) => seatExternalSkill(external, matrix, projectDir));
}

/**
 * Writes each carried skill's directory where its own entry said, and registers it on disk.
 *
 * Three things have to be true afterwards, and each is a separate act: the files are there, the
 * skill answers to the id the configuration recorded, and a metadata.yaml describes it well
 * enough for the next `edit`, `compile` or `list` to find it again. The seat above lasts one run;
 * this is what makes the install survive.
 */
export async function writeExternalSkills(installs: ExternalSkillInstall[]): Promise<void> {
  for (const install of installs) {
    await writeSkillTree(install);
    await writeSkillManifest(install);
    await registerSkillOnDisk(install);
  }
}

/**
 * The directory as the payload holds it, keys and all.
 *
 * The keys came off the wire, so a payload may ask for any path it likes — including one that
 * climbs out of the skill's own directory. They answer to the same guard a marketplace's own
 * paths do.
 */
async function writeSkillTree(install: ExternalSkillInstall): Promise<void> {
  for (const [relativePath, contents] of Object.entries(install.skill.files)) {
    const filePath = path.join(install.skillDir, relativePath);
    validateSkillPath(filePath, install.skillDir, relativePath);
    await writeFile(filePath, contents);
  }
}

/** The frontmatter block at the head of a SKILL.md, and the `name` field inside it. */
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;
const NAME_FIELD = /^name:.*$/m;

/**
 * Names the skill by the id it installs under.
 *
 * Every loader reads a skill's id off this one field, and a compiled sub-agent references the id
 * the configuration recorded — the one minted at intake, which is also this directory's name. The
 * repository the skill came from knew about neither, so left as it was written the two never
 * meet: the sub-agent names a skill Claude Code knows as something else, and the next load
 * registers an id no configuration carries.
 *
 * Only the name. Everything else in the block is the author's and travels untouched.
 */
function withInstalledName(manifest: string, install: ExternalSkillInstall): string {
  const named = `name: ${install.id}`;
  const block = FRONTMATTER_BLOCK.exec(manifest);

  // A manifest with no frontmatter at all describes no skill to Claude Code either. The payload
  // carries both fields one needs, so it is given one rather than installed unreadable.
  if (!block) {
    return `---\n${named}\ndescription: ${install.skill.description}\n---\n\n${manifest}`;
  }

  const [whole, fields = ""] = block;
  const renamed = NAME_FIELD.test(fields)
    ? fields.replace(NAME_FIELD, named)
    : `${named}\n${fields}`;

  // The block is anchored at the head of the file, so what follows it is the rest verbatim.
  return `---\n${renamed}\n---${manifest.slice(whole.length)}`;
}

async function writeSkillManifest(install: ExternalSkillInstall): Promise<void> {
  const manifestPath = path.join(install.skillDir, STANDARD_FILES.SKILL_MD);
  await writeFile(manifestPath, withInstalledName(await readFile(manifestPath), install));
}

/**
 * What the payload confirmed, over what the repository shipped, over what neither says.
 *
 * The order is the whole of it. The taxonomy is the placement the user chose against the
 * catalogue this configuration names, and the repository's own idea of where its skill belongs
 * answers to a taxonomy nobody here shares — so that is written over the file. Everything else
 * the repository wrote is kept, because its author knows more about their skill than a default
 * does.
 *
 * The defaults underneath exist because `doctor` validates every installed metadata.yaml, and a
 * file this command writes that that command reports as an error is the CLI disagreeing with
 * itself — in a file the user cannot fix, since the skill is somebody else's repository. Neither
 * is invented: the authorship is the repository's owner, and the usage line is the same words the
 * stack loader already writes for every skill reference it has nothing more specific for.
 */
function externalSkillMetadata(
  install: ExternalSkillInstall,
  shipped: LocalSkillMetadata | null,
): LocalSkillMetadata {
  return {
    author: skillAuthor(install.skill.repo),
    usageGuidance: `Use when working with ${install.skill.displayName}`,
    ...shipped,
    displayName: install.skill.displayName,
    slug: install.id,
    category: install.skill.categoryId,
    domain: install.domain,
    cliDescription: install.skill.description,
    custom: true,
  };
}

/**
 * Registers the skill on disk, where the next command will look for it.
 *
 * `forkedFrom` is stamped through the one writer that stamps it, because it is the package's
 * single answer to "did the CLI put this directory here?" — `uninstall` reads it to decide what it
 * may delete, and the producer reads it to decide what the round trip owns. A carried skill IS the
 * round trip's; a skill the user wrote by hand is not, and carries nothing.
 *
 * The repository AND the directory inside it, because this is the only record of where these bytes
 * came from. Sharing this installation has to rebuild the entry the payload carried, and a
 * repository alone cannot say which of its directories travelled — see {@link readCarriedSkills}.
 */
async function registerSkillOnDisk(install: ExternalSkillInstall): Promise<void> {
  const metadataPath = path.join(install.skillDir, STANDARD_FILES.METADATA_YAML);
  const shipped = await readLocalSkillMetadata(install.skillDir);

  await writeMetadataYaml(metadataPath, externalSkillMetadata(install, shipped));
  await injectForkedFromMetadata(
    install.skillDir,
    install.id,
    await computeFileHash(path.join(install.skillDir, STANDARD_FILES.SKILL_MD)),
    { source: repoRef(install.skill.repo), path: install.skill.path },
  );
}

/**
 * One installed skill directory the round trip owns, and what its install recorded about it.
 *
 * Read by the caller rather than here: whether a directory is the CLI's copy or the user's own
 * work is a question about ownership, which `installation-payload.ts` already asks of every entry
 * before anything else. This module answers only the next one — whether the bytes have to travel.
 */
export type OwnedSkillDir = { id: string; skillDir: string; provenance: ForkedFromMetadata };

/**
 * What one installation carries rather than names.
 *
 * The same shape the mapper's other readings wear: what can travel, and the lines naming what
 * cannot. Both halves matter — a payload quietly missing content it could not read still mints an
 * id, and that id installs a configuration nobody chose.
 */
export type ContentReading = {
  /** Skill id -> the entry a receiver seats it from. Keyed exactly as the wire keys `external`. */
  external: Record<string, SeedExternalSkill>;
  /** One line per skill whose content this installation cannot carry, for the refusal. */
  uncarryable: string[];
};

/** What one owned directory turns out to carry: content, a reason it cannot, or nothing. */
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

/**
 * The inverse of {@link repoRef}: the repository a ref names, or nothing when it names none this
 * contract can state.
 *
 * Provenance is written as a ref because that is the form every other source in a configuration
 * wears; the wire wants GitHub's own `owner/name`. Any other ref is a repository this contract has
 * no word for, which is a refusal rather than something to guess at.
 */
function repoFromRef(ref: string | undefined): string | undefined {
  if (ref === undefined || !ref.startsWith(GITHUB_SOURCE.GITHUB_PREFIX)) return undefined;
  return ref.slice(GITHUB_SOURCE.GITHUB_PREFIX.length);
}

/** Every file under the skill, keyed by its path relative to it — dotfiles and nesting included. */
async function readSkillTree(skillDir: string): Promise<SeedSkillTree> {
  const files = await glob("**/*", skillDir, { dot: true });
  const entries = await Promise.all(
    files.map(async (file) => [file, await readFile(path.join(skillDir, file))] as const),
  );
  return Object.fromEntries(entries);
}

/**
 * Rebuilds the entry a carried skill arrived as, from the directory the install wrote.
 *
 * The bytes as they stand rather than as they arrived: the manifest was renamed to the id this
 * install recorded, and a user may have edited the skill since. Both are what is installed here,
 * and what is installed here is what a share carries.
 *
 * Validated against the contract's own schema rather than by rules restated here — that is what
 * makes the weight limit, the manifest requirement and every field's shape one definition rather
 * than two that can drift.
 */
async function readCarriedSkill({ id, skillDir, provenance }: OwnedSkillDir): Promise<CarriedRead> {
  // The directory is what marks a skill as one no catalogue can resolve. Without it there is a
  // catalogue behind this id, so the receiver installs it from there and the bytes stay home.
  if (provenance.path === undefined) return { carries: "nothing" };

  const repo = repoFromRef(provenance.source);
  if (repo === undefined) return { carries: "unshareable", line: unnameableRepoMessage(id) };

  const described = await readSkillMetadata(path.join(skillDir, STANDARD_FILES.METADATA_YAML));
  if (!described.usable) {
    return { carries: "unshareable", line: uncarryableContentMessage(id, described.reason) };
  }

  const parsed = seedExternalSkillSchema.safeParse({
    displayName: described.metadata.displayName,
    description: described.metadata.cliDescription,
    categoryId: described.metadata.category,
    repo,
    path: provenance.path,
    files: await readSkillTree(skillDir),
  });
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => issue.message).join("; ");
    return { carries: "unshareable", line: uncarryableContentMessage(id, reason) };
  }

  return { carries: "content", id, skill: parsed.data };
}

/**
 * What a set of owned skill directories carries, and what it cannot.
 *
 * The mirror of {@link registerExternalSkills}: that seats an entry a payload carried and writes
 * its bytes, this reads those bytes back into the entry a payload carries. Every other id in a
 * configuration is resolved by the receiver against a catalogue it already has, so its content has
 * nothing to add; an added skill answers to no catalogue in either direction, and a share that
 * named it without carrying it would mint an id that installs a configuration missing it.
 */
export async function readCarriedSkills(owned: OwnedSkillDir[]): Promise<ContentReading> {
  const reads = await Promise.all(owned.map(readCarriedSkill));

  return {
    external: Object.fromEntries(
      reads.flatMap((read) => (read.carries === "content" ? [[read.id, read.skill]] : [])),
    ),
    uncarryable: reads.flatMap((read) => (read.carries === "unshareable" ? [read.line] : [])),
  };
}
