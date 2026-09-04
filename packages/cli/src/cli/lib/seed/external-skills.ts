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
  readForkedFromMetadata,
  readLocalSkillMetadata,
  writeMetadataYaml,
} from "../skills/skill-metadata.js";
import { defaultUsageGuidance } from "../stacks/stacks-loader.js";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix.js";
import { computeFileHash } from "../versioning.js";
import { directoryExists, glob, readFile, writeFile } from "../../utils/fs.js";
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
 * Names every carried skill claiming an id a catalogue already owns, not just the first.
 *
 * A skill id is the directory the skill installs into, so a carried skill taking a catalogue id
 * writes its own bytes where that catalogue's own copy belongs, and the id every sub-agent
 * references afterwards resolves to whatever the payload shipped. Nothing later can tell the two
 * apart either: the local-skill merge inherits an incumbent's `displayName`, `slug` and `category`
 * on the next load, so the impostor renders under the catalogue's own name and placement.
 *
 * **The union of two catalogues, and each half answers what the other cannot.** The LOADED matrix
 * catches the same defect one marketplace along — an external id colliding with a loaded custom
 * marketplace's own ids, which the shipped set has never heard of. The SHIPPED catalogue is the
 * half no payload can move: `sharedConfigSourceFlags` in `commands/init.tsx` passes
 * `payload.marketplace` to the loader, so a payload naming a marketplace that does not ship the id
 * it impersonates meets no incumbent in the loaded matrix at all — which is exactly why
 * `refuseCatalogueCollisions` in `loading/source-loader.ts` reads {@link BUILT_IN_MATRIX} and says
 * so: nothing a source ships is unforgeable, so the consumer's own load has to ask the question
 * again of a set the source cannot choose.
 */
function claimingACatalogueId(
  externals: SelectedExternal[],
  matrix: MergedSkillsMatrix,
): SkillId[] {
  return externals.filter(({ id }) => heldByEitherCatalogue(id, matrix)).map(({ id }) => id);
}

/** Every skill id the shipped catalogue owns — the half of the incumbent set a payload cannot move. */
const CATALOGUE_SKILL_IDS: ReadonlySet<SkillId> = new Set(typedKeys(BUILT_IN_MATRIX.skills));

function heldByEitherCatalogue(id: SkillId, matrix: MergedSkillsMatrix): boolean {
  return heldByLoadedCatalogue(matrix.skills[id]) || CATALOGUE_SKILL_IDS.has(id);
}

/**
 * Whether the LOADED matrix's entry for an id is one a payload has no right to write over.
 *
 * An incumbent this installation merged off its own disk is not a collision on this axis.
 * `edit --from` applies destructively over an existing install and hands this the source's matrix,
 * which has already had the local-skill merge run over it — so a carried skill a previous apply
 * wrote arrives back here seated and `local`, and refusing it would make a shared configuration
 * installable exactly once. The same carve-out {@link claimSlug} makes for a claim it already
 * holds, on the axis the merge already treats as override-able.
 *
 * `local` is all the matrix can say, and it says less than it looks like: the merge writes that
 * flag on EVERYTHING it finds, so a skill the user wrote by hand wears it too, and a directory
 * carrying no `metadata.yaml` at all never reaches the matrix to be asked. Which directories this
 * installation may actually be written over is therefore settled on disk rather than here — see
 * {@link refuseUncarriedDestinations}.
 */
function heldByLoadedCatalogue(incumbent: ResolvedSkill | undefined): boolean {
  return incumbent !== undefined && incumbent.local !== true;
}

/**
 * Every colliding id at once, and the fix rather than only the fault.
 *
 * Not truncated, unlike the marketplace refusal's list in `loading/source-loader.ts`: that one
 * reports a whole repository's directory scan, where hundreds of ids can collide at once, while
 * these are the skills one sharer added by hand to one configuration. {@link pluginInstallError}
 * draws from the same set and names all of it, and two refusals over one set disagreeing about
 * that would be an inconsistency with nothing behind it.
 */
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
 * Both refusals are decided before anything is seated, because the seat writes into `matrix` in
 * place: a guard placed after it would stop the run having already replaced entries every later
 * read in this process resolves, and a guard that threw on the first collision it met would have
 * overwritten whatever it seated on the way there.
 *
 * The third refusal is not here. Whether a DIRECTORY may be written over is a question about the
 * disk rather than about the catalogue, and {@link writeExternalSkills} is where it is asked.
 *
 * @throws {Error} If any carried skill asks to be installed as a plugin — see
 *   {@link pluginInstallError} — or claims an id either catalogue already owns, see
 *   {@link catalogueIdCollisionError}.
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
 * Writes each carried skill's directory where its own entry said, and registers it on disk.
 *
 * Three things have to be true afterwards, and each is a separate act: the files are there, the
 * skill answers to the id the configuration recorded, and a metadata.yaml describes it well
 * enough for the next `edit`, `compile` or `list` to find it again. The seat above lasts one run;
 * this is what makes the install survive.
 *
 * @throws {Error} If any destination is a directory this installation did not receive inside a
 *   shared configuration — see {@link refuseUncarriedDestinations}.
 */
export async function writeExternalSkills(installs: ExternalSkillInstall[]): Promise<void> {
  await refuseUncarriedDestinations(installs);

  for (const install of installs) {
    await writeSkillTree(install);
    await writeSkillManifest(install);
    await registerSkillOnDisk(install);
  }
}

/** One destination a carried skill's bytes may not be written to, and what stands there. */
type BlockedDestination = { id: SkillId; skillDir: string };

/**
 * Refuses the run when any destination already holds content no shared configuration carried.
 *
 * **This is the disk half of the collision question, and the matrix cannot answer it.**
 * {@link heldByLoadedCatalogue} carves out every `local` incumbent so a re-apply works, and the
 * local-skill merge writes `local` on everything it merges — so that carve-out also exempts a
 * skill the user wrote by hand and a marketplace skill ejected here, neither of which is the
 * round trip's to replace. Worse, a directory with no readable `metadata.yaml` never reaches the
 * matrix at all, so no in-memory guard, with or without a provenance field on `ResolvedSkill`,
 * could ever see it. The bytes are the subject, so the bytes are what is asked.
 *
 * `forkedFrom.path` is the discriminator, not `forkedFrom` itself: {@link registerSkillOnDisk} is
 * the only writer of that field — `copySkillTo` deliberately omits it, because a marketplace skill
 * is installed again by its id — and {@link readCarriedSkill} reads it for this exact question one
 * layer up. So a directory that names the repository directory its bytes came from is one a
 * shared configuration put here, and everything else is somebody else's.
 *
 * Every destination is judged before any is written, for the same reason the two refusals in
 * {@link registerExternalSkills} are decided before anything is seated: a guard that threw on the
 * first blocked destination it met would have overwritten whatever it wrote on the way there.
 */
async function refuseUncarriedDestinations(installs: ExternalSkillInstall[]): Promise<void> {
  const judged = await Promise.all(installs.map(judgeDestination));
  const blocked = judged.filter((destination) => destination !== null);

  if (blocked.length > 0) throw new Error(uncarriedDestinationError(blocked));
}

/** One destination: the row a refusal would name, or nothing standing there to protect. */
async function judgeDestination(install: ExternalSkillInstall): Promise<BlockedDestination | null> {
  const { id, skillDir } = install;
  if (!(await directoryExists(skillDir))) return null;
  if ((await readForkedFromMetadata(skillDir))?.path !== undefined) return null;
  return { id, skillDir };
}

/**
 * Every blocked destination at once, with the directory beside the id.
 *
 * The path is what makes this actionable and is what the collision message above cannot say: the
 * fix is the RECEIVER's rather than the sharer's, because the directory is theirs — so the message
 * has to name a path they can move, and a user must be able to copy any line of it and `cd` into
 * it. Both ways out are offered, because only the user knows whose skill matters more.
 */
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
 * is invented: the authorship is the repository's owner, and the usage line is
 * {@link defaultUsageGuidance}, the same call the stack loader makes for every skill reference it
 * has nothing more specific for. The same CALL rather than the same words — this file spelled the
 * sentence itself until 2026-09-03, and drifted on both halves, so one carried skill's cue read
 * `Use when working with Brainstorming` off disk and `Use when working with web-tooling.` during
 * the run that installed it.
 */
function externalSkillMetadata(
  install: ExternalSkillInstall,
  shipped: LocalSkillMetadata | null,
): LocalSkillMetadata {
  return {
    author: skillAuthor(install.skill.repo),
    usageGuidance: defaultUsageGuidance(install.skill.categoryId),
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
