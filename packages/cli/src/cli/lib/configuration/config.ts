import os from "os";
import path from "path";
import { z } from "zod";
import { fileExists, readFileOptional } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import {
  DEFAULT_BRANDING,
  GITHUB_SOURCE,
  PUBLIC_CATALOGUE_PACKAGE,
  STANDARD_FILES,
} from "../../consts";
import { configUnreadableError } from "../../utils/messages";
import { projectSourceConfigSchema } from "../schemas";
import type { ProjectConfig, SourceEntry } from "../../types";
import { ConfigDefaultExportError, ConfigSchemaError, loadConfig } from "./config-loader";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { isHomeDirectory } from "../installation/is-home-directory";

export const DEFAULT_SOURCE = `${GITHUB_SOURCE.GITHUB_PREFIX}agents-inc/skills`;
export const SOURCE_ENV_VAR = "CC_MARKETPLACE";

// Re-export types that moved to src/cli/types/config.ts for backward compatibility
export type { SourceEntry, BrandingConfig } from "../../types/config";

// getProjectConfigPath lives in install-base-dir.ts (a neutral leaf) to avoid an
// import cycle; re-exported here for existing importers of this module.
export { getProjectConfigPath };

export type ResolvedConfig = {
  source: string;
  sourceOrigin: "flag" | "env" | "project" | "global" | "default";
  marketplace?: string;
};

/**
 * Who is asking for a marketplace, and therefore whether this run may CHOOSE one.
 *
 * Choosing is an install-time decision (owner ruling 2026-08-09): `--marketplace` is
 * `init`'s flag and nobody else's, and {@link SOURCE_ENV_VAR} is the same choice made
 * without typing it — so the environment rung is read for `init` and for nothing else.
 * Every later command asks as `"stored"` and gets what the install recorded: the
 * project config, then the global one, then {@link DEFAULT_SOURCE}.
 *
 * A `"stored"` caller may still NAME a marketplace it is reading for its own sake —
 * `doctor` validating a marketplace repository points the loader at a path — which is why
 * the flag is not tied to the caller. What `init` alone gets is the ambient environment.
 */
export type SourceCaller = "init" | "stored";

export type ResolveSourceRequest = {
  caller: SourceCaller;
  /** The marketplace this run named, where it named one. */
  flag?: string | undefined;
  /** The project whose `config.ts` is the first stored rung. */
  projectDir?: string | undefined;
};

/**
 * Reads the settings config at `dir`, or answers `null` when there is none to read.
 *
 * **A file that EXISTS and cannot be loaded is raised, never reported as absence** (owner ruling
 * 2026-08-20). `resolveSource` reads the return value alone, so a swallowed failure was
 * indistinguishable from a config that is not there: the run walked past this rung to
 * {@link DEFAULT_SOURCE} and installed from a marketplace nobody named, while the config naming a
 * private one sat unread on disk. All three ways a config can fail are on the loud side of that
 * line now — a shape the schema refused, a module whose exports are all named, and a file that
 * could not be evaluated at all, which was the one still reported as `null`.
 *
 * A MISSING file keeps its `null`, and that is the whole of what `null` means here: the legitimate
 * state `init` exists for, and the state `edit` reports as "no installation".
 *
 * Every call site chose a posture and states it where it stands. All but one ABORT: the marketplace
 * a run installs from is not a thing to guess at, and the two sites that read this file to locate a
 * marketplace's own skills or agent partials would otherwise walk a tree it says is elsewhere. The
 * exception is `validateRegisteredSources`, which DEGRADES — a command whose job is naming what is
 * wrong here has to survive the thing it is naming, so `doctor`'s `safeCheck` turns the raise into
 * a failed row and its `readsConfig: true` rows stand down before reaching here at all. Two further
 * sites are unreachable rather than chosen: `mergeWithExistingConfig` loads the full config first,
 * and `ensureMinimalConfig` reads only where the file is absent.
 */
async function loadSourceConfig(
  dir: string,
  scope: "project" | "global",
): Promise<Partial<ProjectConfig> | null> {
  const scopeLabel = scope === "project" ? "Project" : "Global";
  const configPath = getProjectConfigPath(dir);

  if (!(await fileExists(configPath))) {
    verbose(`${scopeLabel} config not found at ${configPath}`);
    return null;
  }

  const data = await readSourceConfigOrRefuse(configPath);
  if (!data) return null;

  verbose(`Loaded ${scope} config from ${dir}`);
  return data;
}

/**
 * The config at `configPath`, or `null` when it evaluated and declared nothing.
 *
 * Every way of failing raises. Split out from {@link loadSourceConfig} so that function's own body
 * reads as the two states it answers — no file, or a config — with the third state, a file that
 * will not load, named once here rather than assembled from a `let` and a `try`.
 */
async function readSourceConfigOrRefuse(
  configPath: string,
): Promise<Partial<ProjectConfig> | null> {
  try {
    return await loadConfig(configPath, projectSourceConfigSchema);
  } catch (error) {
    if (describesItsOwnFault(error)) throw error;
    throw unreadableSourceConfig(error);
  }
}

/**
 * Whether a load failure already names the field or the export at fault, and so is handed on as
 * itself rather than re-worded.
 *
 * The two it admits fault a LINE of a file the user still owns and can go and correct. Everything
 * else says only that the file would not evaluate, which is what {@link unreadableSourceConfig}
 * exists to turn into a way out.
 */
function describesItsOwnFault(error: unknown): boolean {
  return error instanceof ConfigSchemaError || error instanceof ConfigDefaultExportError;
}

/**
 * The refusal for a config that exists and cannot be evaluated.
 *
 * `loadConfig` already names the file and the parser's own reason — `Failed to load config from
 * '<path>': ParseError: Missing semicolon` — so the cause is handed straight to
 * {@link configUnreadableError} rather than restated. That builder is what `BaseCommand`'s
 * `ensureConfigReadable` prints for the OTHER loader of this very file, so both readers refuse it
 * in one vocabulary and offer the one route that clears it: `uninstall` still works on a config it
 * cannot read.
 */
function unreadableSourceConfig(cause: unknown): Error {
  return new Error(configUnreadableError(getErrorMessage(cause)), { cause });
}

/**
 * Load source config from a directory's own `.claude-src/config.ts`.
 *
 * The scope it announces is derived, not assumed: at the home root the file this reads
 * IS the global config, and a caller asking a project question there — `doctor` deciding
 * whether the cwd is a source repository — must not be told a project config was found
 * where none exists.
 */
export async function loadProjectSourceConfig(
  projectDir: string,
): Promise<Partial<ProjectConfig> | null> {
  return loadSourceConfig(projectDir, isHomeDirectory(projectDir) ? "global" : "project");
}

/** Load source config from the global home directory (~/.claude-src/config.ts). */
export async function loadGlobalSourceConfig(): Promise<Partial<ProjectConfig> | null> {
  return loadSourceConfig(os.homedir(), "global");
}

/** The effective source config plus which scope it was actually loaded from. */
type EffectiveSourceConfig = {
  config: Partial<ProjectConfig>;
  origin: "project" | "global";
};

async function loadEffectiveSourceConfig(
  projectDir?: string,
): Promise<EffectiveSourceConfig | null> {
  const projectConfig = await loadOwnProjectSourceConfig(projectDir);
  if (projectConfig) return { config: projectConfig, origin: "project" };

  const globalConfig = await loadGlobalSourceConfig();
  if (globalConfig) return { config: globalConfig, origin: "global" };

  return null;
}

/**
 * A project's OWN source config, and nothing at the home root.
 *
 * `~/.claude-src/config.ts` is the global config, so reading it as a project's would label
 * one file both things at once: `compile` naming `Marketplace: project` beside
 * `Compiling global agents...`, `edit` announcing `(project)` while refusing scope toggles
 * as a global context. The axis is which FILE the settings were read from — never what
 * scope the skill and agent entries inside it carry.
 */
async function loadOwnProjectSourceConfig(
  projectDir: string | undefined,
): Promise<Partial<ProjectConfig> | null> {
  if (projectDir === undefined || isHomeDirectory(projectDir)) return null;
  return loadProjectSourceConfig(projectDir);
}

/**
 * Precedence: flag > env > project > global > default, with the first two rungs
 * reachable by `init` alone — see {@link SourceCaller}.
 */
export async function resolveSource(request: ResolveSourceRequest): Promise<ResolvedConfig> {
  const { caller, flag, projectDir } = request;
  const effective = await loadEffectiveSourceConfig(projectDir);
  // The stored NAME becomes this result's `marketplace` — the ref it was read beside becomes the
  // `source`. Every return below carries the same name, present only when the config named one.
  const marketplaceName = effective?.config.marketplaceName;
  const marketplaceLabel = marketplaceName !== undefined && { marketplace: marketplaceName };

  if (flag !== undefined) {
    assertNamedSourceUsable(flag);
    verbose(`Marketplace named by this run: ${flag}`);
    return { source: flag, sourceOrigin: "flag", ...marketplaceLabel };
  }

  const envSource = caller === "init" ? readEnvSource() : undefined;
  if (envSource !== undefined) {
    return { source: envSource, sourceOrigin: "env", ...marketplaceLabel };
  }

  if (effective?.config.marketplace) {
    verbose(`Marketplace from ${effective.origin} config: ${effective.config.marketplace}`);
    return {
      source: effective.config.marketplace,
      sourceOrigin: effective.origin,
      ...marketplaceLabel,
    };
  }

  verbose(`Using default marketplace: ${DEFAULT_SOURCE}`);
  return { source: DEFAULT_SOURCE, sourceOrigin: "default", ...marketplaceLabel };
}

/**
 * How a marketplace this run NAMED is referred to back to whoever named it.
 *
 * Origin-neutral on purpose: `--marketplace` is `init`'s flag and nobody else's, while a
 * `"stored"` caller may still name a marketplace it is reading for its own sake — `doctor`
 * points the loader at a marketplace repository. Naming the flag in a sentence that caller
 * reads blames an option it never passed.
 */
const NAMED_SOURCE_LABEL = "The marketplace";

/**
 * Refuses a named marketplace that cannot be one. Raised rather than warned: somebody named
 * this, so falling through to another would install from a place they did not name.
 */
function assertNamedSourceUsable(flag: string): void {
  if (flag.trim() === "") {
    throw new Error(
      `${NAMED_SOURCE_LABEL} cannot be empty. Provide a valid marketplace: a local directory path or a git repository URL (e.g., './my-skills' or 'https://github.com/user/repo')`,
    );
  }
  validateSourceFormat(flag.trim(), NAMED_SOURCE_LABEL);
}

/**
 * The marketplace {@link SOURCE_ENV_VAR} names, or undefined when it names none this run.
 *
 * Unset, empty and unusable all fall through to the next rung with a warning rather than
 * a refusal — the environment is ambient, so an exported value nobody meant for this run
 * must not be able to fail it. That is the opposite of {@link assertNamedSourceUsable},
 * and deliberately so: one was typed at this command, the other was already there.
 */
function readEnvSource(): string | undefined {
  const envValue = process.env[SOURCE_ENV_VAR];
  if (!envValue) return undefined;

  const trimmed = envValue.trim();
  if (trimmed === "") {
    warn(`${SOURCE_ENV_VAR} is set but empty — ignoring and falling back to the next rung.`);
    return undefined;
  }

  try {
    validateSourceFormat(trimmed, SOURCE_ENV_VAR);
  } catch (error) {
    warn(
      `${SOURCE_ENV_VAR} has an invalid value — ignoring and falling back to the next rung.\n${getErrorMessage(error)}`,
    );
    return undefined;
  }

  verbose(`Marketplace from ${SOURCE_ENV_VAR} env var: ${trimmed}`);
  return trimmed;
}

export async function resolveAuthor(projectDir?: string): Promise<string | undefined> {
  const effective = await loadEffectiveSourceConfig(projectDir);
  return effective?.config.author;
}

/** Resolved branding with defaults applied for any missing fields */
export type ResolvedBranding = {
  name: string;
};

/**
 * Branding resolved per FIELD: this project's, then the global one's, then the shipped default.
 *
 * Per field rather than per file, and that distinction is the whole of this function. Everything
 * else reads {@link loadEffectiveSourceConfig}, which answers with the project's config if that
 * FILE exists and the global one otherwise — right for `marketplace`, where a project's is its own
 * and inheriting one would install from somewhere nobody named. Branding is the opposite kind of
 * field: it is presentation, a user sets it once for themselves, and a project that says nothing
 * about it is not asking for the shipped name back.
 *
 * Read per file it did exactly that. A user who branded globally stopped seeing their own name the
 * moment any project config existed — which is every installed project — and nothing announced it;
 * the name simply reverted. This function's own docblock described the per-field behaviour for as
 * long as the code did not perform it.
 */
export async function resolveBranding(projectDir?: string): Promise<ResolvedBranding> {
  const [own, global] = await Promise.all([
    loadOwnProjectSourceConfig(projectDir),
    loadGlobalSourceConfig(),
  ]);

  return {
    name: own?.branding?.name ?? global?.branding?.name ?? DEFAULT_BRANDING.NAME,
  };
}

/**
 * The one marketplace this installation reads skills from, as a {@link SourceEntry}.
 *
 * Distinct from {@link resolveSource}, which answers the same question as a
 * {@link ResolvedConfig} (source string plus where it came from). This is the shape the
 * surfaces that LIST sources want — `search` and `doctor` — and there is exactly one of
 * them: the registered-extras array this used to return alongside it was withdrawn with
 * the marketplace axis itself.
 */
export async function resolvePrimarySourceEntry(projectDir?: string): Promise<SourceEntry> {
  const resolvedConfig = await resolveSource({ caller: "stored", projectDir });
  return {
    name: "marketplace",
    url: resolvedConfig.source,
    description: "Primary skills marketplace",
  };
}

const REMOTE_PROTOCOLS = [
  GITHUB_SOURCE.GITHUB_PREFIX, // "github:"
  GITHUB_SOURCE.GH_PREFIX, // "gh:"
  "gitlab:",
  "bitbucket:",
  "sourcehut:",
  "https://",
  "http://",
] as const;

// Minimum length after protocol prefix for a valid remote source (e.g., "org/repo" = 8 chars min)
const MIN_REMOTE_PATH_LENGTH = 3;
const MAX_SOURCE_LENGTH = 512;

// Null bytes must never appear in source strings — they can bypass C-level string termination in downstream tools
const NULL_BYTE_PATTERN = /\0/;

// Path traversal sequences in git refs/branches/tags (e.g., "?branch=../../etc/passwd")
const PATH_TRAVERSAL_PATTERN = /\.\./;

// UNC path prefixes (Windows network paths): \\server\share or //server/share
// These can trigger SMB authentication to attacker-controlled servers
const UNC_PATH_PATTERN = /^(?:\/\/|\\\\)/;

// Private/reserved IPv4 ranges that should not appear in source URLs (SSRF prevention)
// Matches: 127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 0.0.0.0, 169.254.x.x
const PRIVATE_IPV4_PATTERN =
  /^(?:127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|0\.0\.0\.0|169\.254\.\d+\.\d+)$/;

// IPv6 loopback and private addresses in URL hostname brackets
const PRIVATE_IPV6_PATTERN =
  /^\[(?:::1|::ffff:(?:127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)|fd[0-9a-f]{2}:.*|fe80:.*)\]$/i;

/**
 * Validates a marketplace string format before it reaches giget or filesystem operations.
 * Catches obviously invalid formats early with clear error messages.
 *
 * @param source - The trimmed, non-empty marketplace value to validate
 * @param flagName - What carried this value, as the error messages name it back: `init`'s
 *   `--marketplace`, {@link SOURCE_ENV_VAR}, or {@link NAMED_SOURCE_LABEL} when no flag did
 */
export function validateSourceFormat(source: string, flagName: string): void {
  // Null bytes can bypass C-level string termination in downstream tools (giget, git)
  if (NULL_BYTE_PATTERN.test(source)) {
    throw new Error(
      `${flagName} contains invalid characters.\n\n` +
        `Marketplace values must not contain null bytes.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} github:user/repo`,
    );
  }

  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error(
      `${flagName} value is too long (${source.length} characters, max ${MAX_SOURCE_LENGTH}).\n\n` +
        `Provide a shorter marketplace path or URL.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} github:user/repo`,
    );
  }

  const matchedProtocol = REMOTE_PROTOCOLS.find((prefix) => source.startsWith(prefix));

  if (matchedProtocol) {
    validateRemoteSource(source, matchedProtocol, flagName);
  } else {
    validateLocalPath(source, flagName);
  }
}

function validateRemoteSource(source: string, protocol: string, flagName: string): void {
  const pathAfterProtocol = source.slice(protocol.length).trim();

  if (pathAfterProtocol.length < MIN_REMOTE_PATH_LENGTH) {
    throw new Error(
      `${flagName} has an incomplete URL: "${source}"\n\n` +
        `A repository path is required after the protocol prefix.\n` +
        `Examples:\n` +
        `  ${flagName} github:user/repo\n` +
        `  ${flagName} https://github.com/user/repo`,
    );
  }

  // Block path traversal in any remote marketplace (refs, branches, query params)
  if (PATH_TRAVERSAL_PATTERN.test(pathAfterProtocol)) {
    throw new Error(
      `${flagName} contains path traversal in URL: "${source}"\n\n` +
        `Remote marketplace URLs must not contain '..' sequences.\n` +
        `Examples:\n` +
        `  ${flagName} github:user/repo\n` +
        `  ${flagName} https://github.com/user/repo`,
    );
  }

  // For https:// and http:// URLs, validate basic URL structure
  if (protocol === "https://" || protocol === "http://") {
    validateHttpUrl(source, flagName);
  }

  // For git shorthand protocols (github:, gh:, gitlab:, etc.), validate org/repo pattern
  if (protocol !== "https://" && protocol !== "http://") {
    validateGitShorthand(source, pathAfterProtocol, flagName);
  }
}

function validateHttpUrl(source: string, flagName: string): void {
  // Basic URL structure check: must have a hostname with at least one dot or localhost
  const afterProtocol = source.replace(/^https?:\/\//, "");
  // Strip port number for hostname validation (e.g., "localhost:8080" -> "localhost")
  const hostnameWithPort = afterProtocol.split("/")[0] ?? "";
  const hostname = hostnameWithPort.split(":")[0] ?? "";

  // Allow: dotted hostnames (github.com), localhost, and bracketed IPv6 ([::1])
  const isBracketedIPv6 = hostnameWithPort.startsWith("[") && hostnameWithPort.includes("]");
  if (!hostname || (!hostname.includes(".") && hostname !== "localhost" && !isBracketedIPv6)) {
    throw new Error(
      `${flagName} has an invalid URL: "${source}"\n\n` +
        `The URL must include a valid hostname.\n` +
        `Examples:\n` +
        `  ${flagName} https://github.com/user/repo\n` +
        `  ${flagName} https://gitlab.company.com/team/skills`,
    );
  }

  // Block private/reserved IP addresses (SSRF prevention via giget)
  if (PRIVATE_IPV4_PATTERN.test(hostname) || PRIVATE_IPV6_PATTERN.test(hostnameWithPort)) {
    throw new Error(
      `${flagName} points to a private or reserved IP address: "${source}"\n\n` +
        `Marketplace URLs must not target private network addresses.\n` +
        `Use a public hostname instead.\n` +
        `Examples:\n` +
        `  ${flagName} https://github.com/user/repo\n` +
        `  ${flagName} https://gitlab.company.com/team/skills`,
    );
  }
}

function validateGitShorthand(source: string, repoPath: string, flagName: string): void {
  // Git shorthand format: protocol:owner/repo (must have at least owner/repo)
  if (!repoPath.includes("/")) {
    throw new Error(
      `${flagName} has an invalid repository reference: "${source}"\n\n` +
        `Git shorthand marketplaces require an owner/repo format.\n` +
        `Examples:\n` +
        `  ${flagName} github:user/repo\n` +
        `  ${flagName} gh:organization/skills`,
    );
  }
}

function validateLocalPath(source: string, flagName: string): void {
  // Check for control characters (except common whitespace)
  // eslint-disable-next-line no-control-regex
  const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0E-\x1F\x7F]/u;
  if (CONTROL_CHAR_PATTERN.test(source)) {
    throw new Error(
      `${flagName} contains invalid characters: "${source}"\n\n` +
        `Marketplace paths must not contain control characters.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} /home/user/skills`,
    );
  }

  // Block UNC paths (Windows network paths like \\server\share or //server/share)
  // These can trigger SMB authentication to attacker-controlled servers, leaking credentials
  if (UNC_PATH_PATTERN.test(source)) {
    throw new Error(
      `${flagName} contains a UNC network path: "${source}"\n\n` +
        `Network paths (\\\\server\\share or //server/share) are not allowed for security reasons.\n` +
        `Use a local directory path or a remote URL instead.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} /home/user/skills\n` +
        `  ${flagName} https://github.com/user/repo`,
    );
  }
}

/**
 * Whether a resolved marketplace IS the default public one, asked of the source
 * STRING.
 *
 * The one place that question is answered, because more than one surface asks it
 * and they must agree: the install-mode tagger decides whether the marketplace it
 * labels skills with is public or private, and both stack lookups ask it as half
 * of {@link offersBuiltInStacks}. A marketplace named explicitly — by flag, env
 * or config — is the default one when it spells {@link DEFAULT_SOURCE}.
 *
 * A path is not this question's subject. Nothing in a source STRING that happens
 * to be a path says which repository it holds; {@link isPublicCatalogueCheckout}
 * asks the directory instead, and it is the one to use where a directory is in hand.
 */
export function isDefaultSource(source: string): boolean {
  return source === DEFAULT_SOURCE;
}

/** The only field of a repository's package.json this module reads. */
const packageIdentitySchema = z.object({ name: z.string() });

/**
 * Whether the DIRECTORY at `basePath` is a checkout of the public catalogue's own
 * repository, read off package identity.
 *
 * Never off the name in `marketplace.json`: that name is a claim the author
 * writes, so a guard keyed on it would exempt exactly the source it exists to
 * catch. {@link PUBLIC_CATALOGUE_PACKAGE} carries what the signal is and is not
 * worth.
 *
 * The build side asks a different question of the same identity and is spelled
 * apart from this one on purpose: `isCatalogueOwnReservedName` in
 * `marketplace-generator.ts` asks whether a marketplace NAME about to be
 * published is the catalogue's own, and takes the package name it already holds
 * rather than a directory to read one from.
 */
export async function isPublicCatalogueCheckout(basePath: string): Promise<boolean> {
  const raw = await readFileOptional(path.join(basePath, STANDARD_FILES.PACKAGE_JSON));
  return declaredPackageName(raw) === PUBLIC_CATALOGUE_PACKAGE;
}

/** The `name` a package.json declares, or null when there is none to read. */
function declaredPackageName(raw: string): string | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = packageIdentitySchema.safeParse(json);
  return parsed.success ? parsed.data.name : null;
}

/**
 * Whether the CLI's built-in stack catalogue stands in for a marketplace that
 * ships no stacks of its own.
 *
 * Two spellings of one marketplace, and BOTH stack lookups must read this rather
 * than either half. `resolveOfferedStacks` decides the list the wizard offers and
 * `loadStackById` resolves the id the user then picked; a rule they answer
 * differently offers a stack and refuses to install it.
 *
 * The built-in stacks ARE the public catalogue's stacks — that repository ships
 * no `config/stacks.ts` at all — so a checkout of it read off a path has to reach
 * them too, and the source string cannot say that a path is that repository.
 */
export async function offersBuiltInStacks(basePath: string, source: string): Promise<boolean> {
  return isDefaultSource(source) || (await isPublicCatalogueCheckout(basePath));
}

export function isLocalSource(source: string): boolean {
  if (source.startsWith("/") || source.startsWith(".")) {
    return true;
  }

  const hasRemoteProtocol = REMOTE_PROTOCOLS.some((prefix) => source.startsWith(prefix));

  if (!hasRemoteProtocol) {
    if (source.includes("..") || source.includes("~")) {
      throw new Error(
        `Invalid marketplace path: ${source}. Path traversal patterns like '..' and '~' are not allowed for security reasons. Use absolute paths or remote URLs instead (e.g., '/home/user/skills' or 'https://github.com/user/repo').`,
      );
    }
  }

  return !hasRemoteProtocol;
}
