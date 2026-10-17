import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

import { GITHUB_PREFIX, STANDARD_FILES } from "./paths.js"

import type { SeedExternalSkill, SeedSkillTree } from "@workspace/matrix"

// What an install does to a skill the configuration carries (its whole directory travels in the
// payload). The CLI writes with these; the editor preview draws {@link installedSkillTree}.

const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/
const NAME_FIELD = /^name:.*$/m

export type InstalledSkillIdentity = { id: string; description: string }

/**
 * Names the skill by the id it installs under, which compiled sub-agents reference; the rest of
 * the frontmatter is the author's and travels untouched.
 */
export function withInstalledName(
  manifest: string,
  { id, description }: InstalledSkillIdentity
): string {
  const named = `name: ${id}`
  const block = FRONTMATTER_BLOCK.exec(manifest)

  // No frontmatter describes no skill, so one is given from the payload.
  if (!block) {
    return `---\n${named}\ndescription: ${description}\n---\n\n${manifest}`
  }

  const [whole, fields = ""] = block
  const renamed = NAME_FIELD.test(fields)
    ? fields.replace(NAME_FIELD, named)
    : `${named}\n${fields}`

  return `---\n${renamed}\n---${manifest.slice(whole.length)}`
}

export function carriedSkillAuthor(repo: string): string {
  const [owner = repo] = repo.split("/")
  return `@${owner}`
}

export type CarriedSkillPlacement = {
  id: string
  skill: Pick<
    SeedExternalSkill,
    "displayName" | "description" | "categoryId" | "repo"
  >
  domain: string
  /** The CLI's `defaultUsageGuidance`, passed in so it is spelled once. */
  usageGuidance: string
  shipped: Readonly<Record<string, unknown>> | null
}

/**
 * The payload's taxonomy wins over what the repository shipped, which wins over defaults. The
 * defaults keep `doctor` from flagging a file the user cannot fix.
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

// `CLI_DESCRIPTION_MAX_LENGTH` in the CLI's `schemas.ts`.
const CLI_DESCRIPTION_MAX_LENGTH = 60

const ELLIPSIS = "…"

/** Cut at the last whole word that fits `doctor`'s limit; sub-agents read the full SKILL.md. */
function shortLabel(description: string): string {
  if (description.length <= CLI_DESCRIPTION_MAX_LENGTH) return description

  const room = description.slice(
    0,
    CLI_DESCRIPTION_MAX_LENGTH - ELLIPSIS.length
  )
  return `${toLastWholeWord(room)}${ELLIPSIS}`
}

function toLastWholeWord(text: string): string {
  const lastBreak = text.lastIndexOf(" ")
  return (lastBreak > 0 ? text.slice(0, lastBreak) : text).trimEnd()
}

export type CarriedSkillInstall = Omit<
  CarriedSkillPlacement,
  "shipped" | "skill"
> & {
  skill: SeedExternalSkill
  date: string
}

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

// `yamlSchemaComment(SCHEMA_PATHS.metadata)` in the CLI's `consts.ts`.
const METADATA_SCHEMA_COMMENT =
  "# yaml-language-server: $schema=https://raw.githubusercontent.com/agents-inc/agents-inc/main/packages/cli/src/schemas/metadata.schema.json"

// `YAML_FORMATTING.LINE_WIDTH_NONE`.
const NO_LINE_FOLDING = 0

/** `registerSkillOnDisk`'s two writes: the shared metadata, then the `forkedFrom` stamp. */
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

/** The bytes `writeMetadataYaml` leaves. */
const asMetadataFile = (metadata: Record<string, unknown>): string =>
  `${METADATA_SCHEMA_COMMENT}\n${stringifyYaml(metadata, {
    lineWidth: NO_LINE_FOLDING,
  })}`

/**
 * Where `injectForkedFromMetadata` puts the stamp: `localSkillMetadataSchema` parses its declared
 * key first, so a shipped `forkedFrom` puts it at the top and none puts it last.
 */
function withForkedFrom(
  metadata: Record<string, unknown>,
  forkedFrom: Record<string, string>
): Record<string, unknown> {
  if (!Object.hasOwn(metadata, "forkedFrom")) return { ...metadata, forkedFrom }

  const { forkedFrom: _shipped, ...rest } = metadata
  return { forkedFrom, ...rest }
}

/** Read as `readLocalSkillMetadata` does: unparseable, non-mapping or bad `forkedFrom` is none. */
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

const PROVENANCE_REQUIRED = ["skillId", "contentHash", "date"] as const
const PROVENANCE_OPTIONAL = ["source", "path"] as const

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

function manifestOf(files: SeedSkillTree): string {
  const manifest = files[STANDARD_FILES.SKILL_MD]
  if (manifest === undefined) {
    throw new Error(
      `A carried skill's directory holds no ${STANDARD_FILES.SKILL_MD}, which seedSkillTreeSchema refuses`
    )
  }
  return manifest
}

// `HASH_PREFIX_LENGTH` in the CLI's `computeStringHash`.
const CONTENT_HASH_LENGTH = 7

// The CLI's `computeStringHash`, via Web Crypto because this package runs in a browser.
async function contentHashOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  )
  return hexOf(new Uint8Array(digest)).slice(0, CONTENT_HASH_LENGTH)
}

const hexOf = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
