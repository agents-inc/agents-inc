import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

import { GITHUB_PREFIX, STANDARD_FILES } from "./paths.js"

import type { SeedExternalSkill, SeedSkillTree } from "@workspace/matrix"

/**
 * WHAT AN INSTALL DOES TO A SKILL A CONFIGURATION CARRIES rather than names —
 * one added in the editor, whose whole directory travels inside the payload —
 * on its way to disk.
 *
 * The CLI's `seed/external-skills.ts` writes with {@link withInstalledName} and
 * {@link carriedSkillMetadata}. The editor's output preview draws the whole
 * directory with {@link installedSkillTree}, which composes those two with the
 * half the CLI keeps because it needs a disk — reading the shipped
 * `metadata.yaml` back, and stamping `forkedFrom` through
 * `injectForkedFromMetadata` — and the CLI's `external-skills.test.ts` holds
 * that composition against a real install, byte for byte.
 */

/** The frontmatter block at the head of a SKILL.md, and the `name` field inside it. */
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/
const NAME_FIELD = /^name:.*$/m

/** The id a carried skill installs under, and the sentence the payload describes it with. */
export type InstalledSkillIdentity = { id: string; description: string }

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
export function withInstalledName(
  manifest: string,
  { id, description }: InstalledSkillIdentity
): string {
  const named = `name: ${id}`
  const block = FRONTMATTER_BLOCK.exec(manifest)

  // A manifest with no frontmatter at all describes no skill to Claude Code either. The payload
  // carries both fields one needs, so it is given one rather than installed unreadable.
  if (!block) {
    return `---\n${named}\ndescription: ${description}\n---\n\n${manifest}`
  }

  const [whole, fields = ""] = block
  const renamed = NAME_FIELD.test(fields)
    ? fields.replace(NAME_FIELD, named)
    : `${named}\n${fields}`

  // The block is anchored at the head of the file, so what follows it is the rest verbatim.
  return `---\n${renamed}\n---${manifest.slice(whole.length)}`
}

/** The repository's owner as a handle, which is all the authorship a carried skill records. */
export function carriedSkillAuthor(repo: string): string {
  const [owner = repo] = repo.split("/")
  return `@${owner}`
}

/** Where a carried skill was placed, and what its `metadata.yaml` falls back to. */
export type CarriedSkillPlacement = {
  id: string
  skill: Pick<
    SeedExternalSkill,
    "displayName" | "description" | "categoryId" | "repo"
  >
  /** The domain the receiving catalogue files the skill's category under. */
  domain: string
  /**
   * The usage line a skill stating none is given — the caller's own call rather than a sentence
   * spelled here, because the CLI's stack loader owns that sentence (`defaultUsageGuidance`) and a
   * second spelling of it drifted once already.
   */
  usageGuidance: string
  /** The `metadata.yaml` the repository shipped beside the skill, as the CLI reads it back. */
  shipped: Readonly<Record<string, unknown>> | null
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
 * file the install writes that that command reports as an error is the CLI disagreeing with
 * itself — in a file the user cannot fix, since the skill is somebody else's repository. Neither
 * is invented: the authorship is the repository's owner, and the usage line is the one the
 * caller's stack loader gives every skill reference it has nothing more specific for. The label is
 * shortened to the length that command accepts for the same reason.
 */
export function carriedSkillMetadata({
  id,
  skill,
  domain,
  usageGuidance,
  shipped,
}: CarriedSkillPlacement): Record<string, unknown> {
  return {
    author: carriedSkillAuthor(skill.repo),
    usageGuidance,
    ...shipped,
    displayName: skill.displayName,
    slug: id,
    category: skill.categoryId,
    domain,
    cliDescription: shortLabel(skill.description),
    custom: true,
  }
}

/**
 * `CLI_DESCRIPTION_MAX_LENGTH` in the CLI's `schemas.ts`: the longest `cliDescription` its `doctor`
 * accepts without a warning.
 */
const CLI_DESCRIPTION_MAX_LENGTH = 60

const ELLIPSIS = "…"

/**
 * The description as the wizard's short label: whole where it fits the length `doctor` accepts,
 * otherwise cut at the last word that fits and marked as cut. A sub-agent is compiled from the
 * SKILL.md's own description, so nothing it reads is shortened.
 */
function shortLabel(description: string): string {
  if (description.length <= CLI_DESCRIPTION_MAX_LENGTH) return description

  const room = description.slice(
    0,
    CLI_DESCRIPTION_MAX_LENGTH - ELLIPSIS.length
  )
  return `${toLastWholeWord(room)}${ELLIPSIS}`
}

/** The text up to its last whole word — all of it, where it holds no break. */
function toLastWholeWord(text: string): string {
  const lastBreak = text.lastIndexOf(" ")
  return (lastBreak > 0 ? text.slice(0, lastBreak) : text).trimEnd()
}

/** One carried skill as {@link installedSkillTree} needs it: its whole directory, and the day. */
export type CarriedSkillInstall = Omit<
  CarriedSkillPlacement,
  "shipped" | "skill"
> & {
  skill: SeedExternalSkill
  /** The day the install ran, which only the machine running it knows. */
  date: string
}

/**
 * The directory a carried skill's install leaves, keyed as the payload keys it.
 *
 * Every file the payload carries, with the SKILL.md renamed by {@link withInstalledName} and a
 * `metadata.yaml` written beside it — over the one the repository shipped, when it shipped one.
 */
export async function installedSkillTree(
  install: CarriedSkillInstall
): Promise<SeedSkillTree> {
  const manifest = withInstalledName(manifestOf(install.skill.files), {
    id: install.id,
    description: install.skill.description,
  })

  return {
    ...install.skill.files,
    [STANDARD_FILES.SKILL_MD]: manifest,
    [STANDARD_FILES.METADATA_YAML]: await metadataYaml(install, manifest),
  }
}

/**
 * The line `injectForkedFromMetadata` writes above the file:
 * `yamlSchemaComment(SCHEMA_PATHS.metadata)` in the CLI's `consts.ts`.
 */
const METADATA_SCHEMA_COMMENT =
  "# yaml-language-server: $schema=https://raw.githubusercontent.com/agents-inc/agents-inc/main/packages/cli/src/schemas/metadata.schema.json"

/** `YAML_FORMATTING.LINE_WIDTH_NONE`: the CLI folds no line of a metadata file. */
const NO_LINE_FOLDING = 0

/**
 * `registerSkillOnDisk`'s two writes as the bytes they leave: the shared metadata, then the
 * provenance `injectForkedFromMetadata` stamps over it.
 */
async function metadataYaml(
  install: CarriedSkillInstall,
  manifest: string
): Promise<string> {
  const metadata = carriedSkillMetadata({
    ...install,
    shipped: shippedMetadata(install.skill.files),
  })
  const stamp = await provenanceStamp(install, manifest)

  return asMetadataFile(withForkedFrom(metadata, stamp))
}

/**
 * What `injectForkedFromMetadata` records about where the bytes came from: the id they install
 * under, the hash of the manifest as installed, the day, and the repository directory — the only
 * address a carried skill has.
 */
async function provenanceStamp(
  install: CarriedSkillInstall,
  manifest: string
): Promise<Record<string, string>> {
  return {
    skillId: install.id,
    contentHash: await contentHashOf(manifest),
    date: install.date,
    source: `${GITHUB_PREFIX}${install.skill.repo}`,
    path: install.skill.path,
  }
}

/** The bytes `writeMetadataYaml` leaves for a mapping, under the schema comment. */
const asMetadataFile = (metadata: Record<string, unknown>): string =>
  `${METADATA_SCHEMA_COMMENT}\n${stringifyYaml(metadata, {
    lineWidth: NO_LINE_FOLDING,
  })}`

/**
 * The stamp, where `injectForkedFromMetadata` puts it. It reads the file back through
 * `localSkillMetadataSchema` first, and that schema's one declared key comes out of a parse ahead
 * of every passed-through one: a repository that shipped its own `forkedFrom` has the stamp at the
 * top of the file, and one that did not has it last.
 */
function withForkedFrom(
  metadata: Record<string, unknown>,
  forkedFrom: Record<string, string>
): Record<string, unknown> {
  if (!Object.hasOwn(metadata, "forkedFrom")) return { ...metadata, forkedFrom }

  const { forkedFrom: _shipped, ...rest } = metadata
  return { forkedFrom, ...rest }
}

/**
 * The `metadata.yaml` the repository shipped, read the way `readLocalSkillMetadata` reads it: a
 * file no parser can read, one that is not a mapping, or one whose `forkedFrom` block
 * `localSkillMetadataSchema` refuses, is no metadata at all.
 */
function shippedMetadata(files: SeedSkillTree): Record<string, unknown> | null {
  const shipped = files[STANDARD_FILES.METADATA_YAML]
  if (shipped === undefined) return null

  const parsed = parsedYaml(shipped)
  return isMapping(parsed) && hasReadableProvenance(parsed) ? parsed : null
}

function parsedYaml(text: string): unknown {
  try {
    return parseYaml(text)
  } catch {
    // The CLI warns and reads no metadata; there is nobody here to warn.
    return undefined
  }
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The `forkedFrom` fields `localSkillMetadataSchema` requires, and the ones it allows. */
const PROVENANCE_REQUIRED = ["skillId", "contentHash", "date"] as const
const PROVENANCE_OPTIONAL = ["source", "path"] as const

/** No `forkedFrom` at all, or one whose every field is a string the schema names. */
function hasReadableProvenance(metadata: Record<string, unknown>): boolean {
  if (!Object.hasOwn(metadata, "forkedFrom")) return true

  const provenance = metadata.forkedFrom
  return (
    isMapping(provenance) &&
    PROVENANCE_REQUIRED.every((key) => typeof provenance[key] === "string") &&
    PROVENANCE_OPTIONAL.every(
      (key) =>
        !Object.hasOwn(provenance, key) || typeof provenance[key] === "string"
    )
  )
}

/** The `SKILL.md` a carried skill's directory holds, which the seed contract refuses one without. */
function manifestOf(files: SeedSkillTree): string {
  const manifest = files[STANDARD_FILES.SKILL_MD]
  if (manifest === undefined) {
    throw new Error(
      `A carried skill's directory holds no ${STANDARD_FILES.SKILL_MD}, which seedSkillTreeSchema refuses`
    )
  }
  return manifest
}

/** `HASH_PREFIX_LENGTH`: how much of the digest the CLI's `computeStringHash` keeps. */
const CONTENT_HASH_LENGTH = 7

/**
 * `computeStringHash` over the installed SKILL.md, which is what `computeFileHash` reads back — the
 * leading hex digits of its SHA-256. Web Crypto rather than `node:crypto`, because this package
 * runs in a browser.
 */
async function contentHashOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  )
  return hexOf(new Uint8Array(digest)).slice(0, CONTENT_HASH_LENGTH)
}

const hexOf = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
